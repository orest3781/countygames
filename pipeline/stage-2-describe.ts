/**
 * Stage 2: Describe — Vision LLM generates scene descriptions for card art.
 *
 * Sends each county's satellite tile to Qwen3-VL:8b, which describes
 * the terrain. That description becomes the art prompt for ComfyUI.
 *
 * Resume-safe: skips FIPS already in descriptions.json.
 * Usage: npx tsx pipeline/stage-2-describe.ts
 */

import { supabase, loadStatus, saveStatus, loadJson, saveJson, createBatchedSaver, REGION_MAP, RARITY_MOODS, OLLAMA_URL, unloadOllamaModels } from "./config.js";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const VISION_MODEL = "gemma4:e4b";
const SAT_DIR = join(process.cwd(), "data", "satellite");
const SV_DIR = join(process.cwd(), "data", "streetview");
const WIKI_FILE = "data/wiki.json";
const DESCRIPTIONS_FILE = "data/descriptions.json";

async function queryVision(imageBase64: string, prompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [{ role: "user", content: prompt, images: [imageBase64] }],
      stream: false,
      think: false,
      options: { temperature: 0.8, top_p: 0.9, num_predict: 300, num_ctx: 4096 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const json = await res.json();
  let text = (json.message?.content || "").trim();
  // Fallback: if model still used thinking mode, extract from thinking field
  if (!text && json.message?.thinking) {
    // Model returned thinking instead of content despite think:false — treat as failure
    text = "";
  }
  return text.replace(/^["']|["']$/g, "").trim();
}

const TIMES_OF_DAY = [
  "early morning, just after sunrise, long shadows, cool blue-pink light",
  "mid-morning, bright clear light, crisp shadows",
  "bright midday, slight west-angled sun, strong clean shadows, deep blue sky",
  "early afternoon, warm direct light, deep blue sky",
  "late afternoon, golden angled light, warm tones",
  "golden hour, low sun, long golden shadows, rich warm light",
  "dusk, deep orange and purple sky, silhouettes forming",
  "blue hour, deep blue twilight, first lights appearing",
  "overcast day, soft diffused light, muted tones, moody atmosphere",
  "misty morning, fog lifting, ethereal soft light",
  "stormy sky, dramatic dark clouds, shafts of light breaking through",
  "winter light, pale low sun, cold blue shadows, crisp air",
];

const SEASONS = [
  "spring, fresh green buds, wildflowers blooming, soft new growth",
  "early summer, lush deep green, long warm days",
  "late summer, golden dry grass, heat haze, mature crops",
  "autumn, brilliant fall colors, orange and red foliage, harvest time",
  "late autumn, bare branches, fallen leaves, grey-brown tones",
  "winter, snow-covered, bare trees, cold crisp air, low pale sun",
];

function getSeason(key: string): string {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  // Use a different offset so season and time don't correlate
  return SEASONS[(hash >>> 4) % SEASONS.length];
}

function getTimeOfDay(key: string): string {
  // FNV-1a hash for even distribution across 12 buckets
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return TIMES_OF_DAY[hash % TIMES_OF_DAY.length];
}

function buildPrompt(
  county: { name: string; state_name: string; state_abbr: string; rarity: string; display_population: string; display_area: string },
  wikiExtract: string | null,
  imageType: "streetview" | "satellite",
): string {
  const mood = RARITY_MOODS[county.rarity] || RARITY_MOODS.common;
  const timeOfDay = getTimeOfDay(county.name + county.state_abbr);
  const season = getSeason(county.state_abbr + county.name); // reversed for independence

  const wikiSection = wikiExtract
    ? `\nFACTS ABOUT THIS PLACE: ${wikiExtract.substring(0, 400)}\n`
    : "";

  if (imageType === "streetview") {
    return `You are looking at a ground-level photograph of a real place in America. Describe EXACTLY what you see — the road, buildings, trees, sky, terrain in the distance.
${wikiSection}
This will become a landscape painting prompt. Write a vivid 40-60 word scene description that:
- Describes the SPECIFIC things visible: architectural style, tree types, road surface, horizon line, cloud formations
- Set the scene at this time: ${timeOfDay}
- Season: ${season}
- Uses ${mood} mood
- Captures what makes THIS place different from anywhere else

NEVER mention: county names, state names, "photo", "image", "street view", "Google", cameras, cars, road signs, or text.
Output exactly one paragraph — no preamble, no explanation, no options.
Write ONLY the scene description, nothing else:`;
  }

  return `Look at this aerial photograph carefully. Describe EXACTLY what you see — the specific landforms, water features, vegetation patterns, and terrain.
${wikiSection}
This will become a landscape painting prompt. Write a vivid 40-60 word scene description that:
- Names the SPECIFIC landscape features visible (e.g., "a wide brown river bends through dense pine forest" not "varied terrain with waterways")
- Set the scene at this time: ${timeOfDay}
- Season: ${season}
- Uses ${mood} mood
- Is UNIQUE to this exact location — avoid generic phrases like "patchwork fields" or "rolling landscape"

NEVER mention: county names, state names, "satellite", "aerial", or "image".
Output exactly one paragraph — no preamble, no explanation, no options.
Write ONLY the scene description, nothing else:`;
}

function cleanDescription(raw: string, countyName: string, stateName: string): string | null {
  let desc = raw.replace(/^["']|["']$/g, "").trim();

  // Take longest line if multi-line
  if (desc.includes("\n")) {
    const lines = desc.split("\n").map(l => l.trim()).filter(l => l.length > 20);
    // Take the longest line — actual descriptions are longer than preambles or meta-comments
    desc = lines.length > 0 ? lines.reduce((a, b) => a.length >= b.length ? a : b) : desc;
  }

  // Cap at 500 chars — truncate at last sentence boundary
  if (desc.length > 500) {
    const cut = desc.substring(0, 500);
    const lastPeriod = cut.lastIndexOf(".");
    desc = lastPeriod > 200 ? cut.substring(0, lastPeriod + 1) : cut.substring(0, 497) + "...";
  }

  // Too short = failed
  if (desc.length < 20) return null;

  // Strip county/state names if leaked
  const lc = desc.toLowerCase();
  if (lc.includes(countyName.toLowerCase()) || lc.includes(stateName.toLowerCase())) {
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    desc = desc
      .replace(new RegExp(esc(countyName), "gi"), "")
      .replace(new RegExp(esc(stateName), "gi"), "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  return desc;
}

async function main() {
  console.log("=== Stage 2: Describe ===\n");
  console.log(`Vision Model: ${VISION_MODEL}`);
  console.log(`Satellite Dir: ${SAT_DIR}`);
  console.log(`Output: ${DESCRIPTIONS_FILE}\n`);

  // Dependency checks
  if (!existsSync(SAT_DIR) || readdirSync(SAT_DIR).filter(f => f.endsWith(".jpg") || f.endsWith(".png")).length === 0) {
    console.error("ERROR: No satellite tiles found. Run Stage 1 first.");
    process.exit(1);
  }
  const wikiPath = join(process.cwd(), WIKI_FILE);
  if (!existsSync(wikiPath)) {
    console.error("ERROR: data/wiki.json not found. Run Stage 1 first.");
    process.exit(1);
  }

  // Check Ollama
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    const tags = await res.json();
    const models = (tags.models || []).map((m: any) => m.name);
    if (!models.some((m: string) => m.includes("gemma4"))) {
      console.error(`ERROR: Model ${VISION_MODEL} not found. Run: ollama pull ${VISION_MODEL}`);
      process.exit(1);
    }
    console.log("Ollama connected.\n");
  } catch {
    console.error("ERROR: Ollama not running at " + OLLAMA_URL);
    process.exit(1);
  }

  // Unload other models to free VRAM
  await unloadOllamaModels();

  // Load wiki descriptions
  const wiki = loadJson<Record<string, string>>(WIKI_FILE);
  console.log(`Wiki descriptions loaded: ${Object.keys(wiki).length}`);

  // Load existing descriptions
  const descriptions = loadJson<Record<string, string>>(DESCRIPTIONS_FILE);
  console.log(`Existing descriptions: ${Object.keys(descriptions).length}`);

  // Fetch counties that need descriptions
  interface CountyRow {
    fips: string;
    name: string;
    state_abbr: string;
    state_name: string;
    display_population: string;
    display_area: string;
    rarity: string;
  }

  const counties: CountyRow[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("cards")
      .select("fips, rarity, display_population, display_area, counties!inner(name, state_abbr, state_name)")
      .order("fips")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const co = (row as any).counties;
      const fips = row.fips.trim();
      if (descriptions[fips]) continue; // resume
      counties.push({
        fips,
        name: co.name,
        state_abbr: co.state_abbr.trim(),
        state_name: co.state_name,
        display_population: row.display_population || "N/A",
        display_area: row.display_area || "N/A",
        rarity: row.rarity,
      });
    }
    if (data.length < 1000) break;
    offset += 1000;
  }

  console.log(`Counties to process: ${counties.length}\n`);

  // Always export cards-meta.json (stage-3 depends on it) and update status
  // even when resuming with 0 counties to process
  const metaPath = "data/cards-meta.json";
  const allMeta: Record<string, { state_abbr: string; rarity: string }> = {};
  let metaOffset = 0;
  while (true) {
    const { data: metaData } = await supabase
      .from("cards")
      .select("fips, rarity, counties!inner(state_abbr)")
      .order("fips")
      .range(metaOffset, metaOffset + 999);
    if (!metaData || metaData.length === 0) break;
    for (const row of metaData) {
      allMeta[row.fips.trim()] = {
        state_abbr: (row as any).counties.state_abbr.trim(),
        rarity: row.rarity,
      };
    }
    if (metaData.length < 1000) break;
    metaOffset += 1000;
  }
  saveJson(metaPath, allMeta);
  console.log(`Exported ${Object.keys(allMeta).length} card metadata entries to ${metaPath}`);

  if (counties.length === 0) {
    // Update status even on resume
    const status = loadStatus();
    status.stage2 = {
      complete: true,
      descriptions: Object.keys(descriptions).length,
      failed: 0,
      timestamp: new Date().toISOString(),
    };
    saveStatus(status);
    console.log("All done!");
    return;
  }

  // Warm up the vision model (first call loads it into VRAM, can take 30-60s)
  console.log("Loading vision model into VRAM (this may take 30-60 seconds on first run)...");
  try {
    const satFiles = readdirSync(SAT_DIR).filter(f => f.endsWith(".png") || f.endsWith(".jpg"));
    if (satFiles.length > 0) {
      const img = readFileSync(join(SAT_DIR, satFiles[0])).toString("base64");
      await queryVision(img, "Describe this image in 5 words.");
      console.log("Vision model ready.\n");
    }
  } catch (err: any) {
    console.log(`Warmup warning: ${err.message} (will retry on first county)\n`);
  }

  let generated = 0;
  let failed = 0;
  const errors: string[] = [];
  const t0 = Date.now();
  const descSaver = createBatchedSaver(DESCRIPTIONS_FILE, 10);

  // Count image sources
  let svUsed = 0;
  let satUsed = 0;

  for (let i = 0; i < counties.length; i++) {
    const county = counties[i];

    // Prefer satellite for landscape art — shows terrain, rivers, forests
    // Street View shows roads/parking lots which make bad landscape paintings
    const svPath = join(SV_DIR, county.fips + ".jpg");
    const satPathPng = join(SAT_DIR, county.fips + ".png");
    const satPathJpg = join(SAT_DIR, county.fips + ".jpg");
    const satPath = existsSync(satPathPng) ? satPathPng : satPathJpg;

    let imagePath: string;
    let imageType: "streetview" | "satellite";

    if (existsSync(satPath)) {
      imagePath = satPath;
      imageType = "satellite";
      satUsed++;
    } else if (existsSync(svPath)) {
      imagePath = svPath;
      imageType = "streetview";
      svUsed++;
    } else {
      failed++;
      errors.push(`${county.fips}: no image available`);
      continue;
    }

    try {
      const imageBase64 = readFileSync(imagePath).toString("base64");
      const wikiExtract = wiki[county.fips] || null;
      const prompt = buildPrompt(county, wikiExtract, imageType);
      const raw = await queryVision(imageBase64, prompt);
      const desc = cleanDescription(raw, county.name, county.state_name);

      if (!desc) {
        failed++;
        errors.push(`${county.fips} ${county.name}: description too short`);
        continue;
      }

      descriptions[county.fips] = desc;
      generated++;

      // Save periodically (crash-safe)
      descSaver.save(descriptions);

      if ((i + 1) % 10 === 0 || i < 10) {
        const elapsed = (Date.now() - t0) / 1000;
        const rate = generated / elapsed;
        const eta = (counties.length - (i + 1)) / Math.max(rate, 0.01) / 60;
        const src = imageType === "streetview" ? "SV" : "SAT";
        console.log(`  [${i + 1}/${counties.length}] ${src} ${county.name}, ${county.state_abbr}: "${desc.substring(0, 60)}..." | ${rate.toFixed(2)}/s ETA ${eta.toFixed(0)}m`);
      }
    } catch (err: any) {
      failed++;
      const msg = `${county.fips} ${county.name}: ${err.message}`;
      errors.push(msg);
      if (failed <= 10) console.log(`  [error] ${msg}`);
    }
  }

  // Unload vision model to free VRAM for next stage
  await unloadOllamaModels();

  // Save final state
  descSaver.save(descriptions, true);

  // Update status — only mark complete if failure rate < 5%
  const failRate = failed / counties.length;
  const status = loadStatus();
  status.stage2 = {
    complete: failRate < 0.05,
    descriptions: Object.keys(descriptions).length,
    failed,
    errors: errors.slice(-20),
    timestamp: new Date().toISOString(),
  };
  saveStatus(status);

  if (failRate >= 0.05) {
    console.error(`\nWARNING: ${(failRate * 100).toFixed(1)}% failure rate. Stage marked incomplete.`);
  }

  console.log(`\n=== Stage 2 Complete in ${((Date.now() - t0) / 60000).toFixed(1)} min ===`);
  console.log(`Generated: ${generated} | Failed: ${failed} | Total: ${Object.keys(descriptions).length}`);
  console.log(`Sources: ${svUsed} Street View, ${satUsed} Satellite`);
}

main().catch(err => { console.error(err); process.exit(1); });
