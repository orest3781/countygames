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
      options: { temperature: 0.8, top_p: 0.9, num_predict: 200, num_ctx: 4096 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const json = await res.json();
  let text = (json.message?.content || "").trim();
  // Fallback: if model still used thinking mode, extract from thinking field
  if (!text && json.message?.thinking) {
    const cleaned = (json.message.thinking as string).replace(/<think>|<\/think>/g, "").trim();
    const lines = cleaned.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 20);
    text = lines.length > 0 ? lines[lines.length - 1] : "";
  }
  return text.replace(/^["']|["']$/g, "").trim();
}

function buildPrompt(
  county: { name: string; state_name: string; state_abbr: string; rarity: string; display_population: string; display_area: string },
  wikiExtract: string | null,
): string {
  const region = REGION_MAP[county.state_abbr] || { name: "America", palette: "natural light, atmospheric", elements: "varied terrain" };
  const mood = RARITY_MOODS[county.rarity] || RARITY_MOODS.common;

  const wikiSection = wikiExtract
    ? `\nGEOGRAPHIC DESCRIPTION (from Wikipedia): "${wikiExtract.substring(0, 500)}"\n`
    : "";

  return `You are looking at a satellite photo of a county in the ${region.name} region of the United States.
${wikiSection}
County: population ${county.display_population}, area ${county.display_area}.

Write a 40-60 word landscape scene description for a ${county.rarity} painting.
Region palette: ${region.palette}
Rarity mood: ${mood}
Include: specific terrain visible in the satellite image, time of day, lighting, atmosphere.
Never include: county name, state name, text, signs, people.
Write ONLY the scene description:`;
}

function cleanDescription(raw: string, countyName: string, stateName: string): string | null {
  let desc = raw.replace(/^["']|["']$/g, "").trim();

  // Take longest line if multi-line
  if (desc.includes("\n")) {
    const lines = desc.split("\n").map(l => l.trim()).filter(Boolean);
    desc = lines.reduce((a, b) => a.length > b.length ? a : b);
  }

  // Cap at 300 chars
  if (desc.length > 300) desc = desc.substring(0, 297) + "...";

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
  if (!existsSync(SAT_DIR) || readdirSync(SAT_DIR).filter(f => f.endsWith(".jpg")).length === 0) {
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
    const warmupPath = join(SAT_DIR, counties[0].fips + ".jpg");
    if (existsSync(warmupPath)) {
      const img = readFileSync(warmupPath).toString("base64");
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

  for (let i = 0; i < counties.length; i++) {
    const county = counties[i];
    const satPath = join(SAT_DIR, county.fips + ".jpg");
    if (!existsSync(satPath)) {
      failed++;
      errors.push(`${county.fips}: no satellite tile`);
      continue;
    }

    try {
      const imageBase64 = readFileSync(satPath).toString("base64");
      const wikiExtract = wiki[county.fips] || null;
      const prompt = buildPrompt(county, wikiExtract);
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
        console.log(`  [${i + 1}/${counties.length}] ${county.name}, ${county.state_abbr}: "${desc.substring(0, 60)}..." | ${rate.toFixed(2)}/s ETA ${eta.toFixed(0)}m`);
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
}

main().catch(err => { console.error(err); process.exit(1); });
