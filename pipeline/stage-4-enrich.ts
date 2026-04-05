/**
 * Stage 4: Enrich — LLM flavor text + Wikipedia notable person extraction.
 *
 * Flavor text: Qwen3:14b via Ollama.
 * Notable people: parsed from Wikipedia extracts (no LLM — avoids hallucination).
 *
 * Resume-safe: skips FIPS already in enrichment.json.
 * Usage: npx tsx pipeline/stage-4-enrich.ts
 */

import { supabase, loadStatus, saveStatus, loadJson, saveJson, createBatchedSaver, OLLAMA_URL, unloadOllamaModels } from "./config.js";
import { existsSync } from "fs";
import { join } from "path";

const TEXT_MODEL = "qwen3:14b";
const WIKI_FILE = "data/wiki.json";
const ENRICHMENT_FILE = "data/enrichment.json";

interface EnrichmentEntry {
  flavor: string;
  person_name: string | null;
  person_desc: string | null;
}

async function queryLLM(prompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TEXT_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.8, num_predict: 800 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const json = await res.json();
  let text = (json.response || "").trim();
  // Qwen3 uses thinking mode — strip think tags to get the actual answer
  text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  // If still empty after stripping, the model may not have finished thinking
  if (!text && json.response && json.response.includes("<think>")) {
    // Extract last meaningful line from the thinking content
    const inner = json.response.replace(/<think>|<\/think>/g, "").trim();
    const lines = inner.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 10);
    text = lines.length > 0 ? lines[lines.length - 1] : "";
  }
  return text.replace(/^["']|["']$/g, "").trim();
}

function buildFlavorPrompt(name: string, stateName: string, pop: string, area: string, disasters: string): string {
  return `Write ONE evocative sentence (under 120 chars) for a collectible card representing ${name}, ${stateName}.
Population: ${pop}. Area: ${area}. Known for: ${disasters}.
The sentence should capture the county's personality — poetic, not factual.
Write ONLY the sentence, no quotes.`;
}

function extractNotablePerson(wikiText: string | null): { name: string | null; desc: string | null } {
  if (!wikiText) return { name: null, desc: null };

  // Look for patterns like "birthplace of [Name]", "[Name] was born", "home to [Name]"
  // Also common: "Notable residents include [Name]"
  const patterns = [
    /(?:birthplace of|home (?:town |city )?of|born in .{0,30}was)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+(?:was born|grew up|was raised)\s+(?:in|near)/,
    /(?:Notable (?:residents?|people|natives?) include)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/,
  ];

  for (const pattern of patterns) {
    const match = wikiText.match(pattern);
    if (match && match[1]) {
      const personName = match[1].trim();
      // Find the sentence containing this person
      const sentences = wikiText.split(/[.!?]+/);
      const personSentence = sentences.find(s => s.includes(personName));
      const desc = personSentence ? personSentence.trim().substring(0, 80) : null;
      return { name: personName, desc };
    }
  }

  return { name: null, desc: null };
}

function cleanFlavor(raw: string): string | null {
  let text = raw.replace(/^["']|["']$/g, "").trim();
  // Remove thinking tags if model uses them
  text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (text.length > 120) text = text.substring(0, 117) + "...";
  if (text.length < 10) return null;
  return text;
}

async function main() {
  console.log("=== Stage 4: Enrich ===\n");
  console.log(`Text Model: ${TEXT_MODEL}`);
  console.log(`Output: ${ENRICHMENT_FILE}\n`);

  // Dependency checks
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
    if (!models.some((m: string) => m === TEXT_MODEL || m.startsWith(TEXT_MODEL + ":"))) {
      console.error(`ERROR: Model ${TEXT_MODEL} not found. Run: ollama pull ${TEXT_MODEL}`);
      process.exit(1);
    }
    console.log("Ollama connected.\n");
  } catch {
    console.error("ERROR: Ollama not running at " + OLLAMA_URL);
    process.exit(1);
  }

  // Unload other models
  await unloadOllamaModels();

  // Load data
  const wiki = loadJson<Record<string, string>>(WIKI_FILE);
  const enrichment = loadJson<Record<string, EnrichmentEntry>>(ENRICHMENT_FILE);
  console.log(`Wiki descriptions: ${Object.keys(wiki).length}`);
  console.log(`Existing enrichment: ${Object.keys(enrichment).length}`);

  // Fetch counties
  interface CountyRow {
    fips: string;
    name: string;
    state_name: string;
    display_population: string;
    display_area: string;
    display_disasters: string;
  }

  const counties: CountyRow[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("cards")
      .select("fips, display_population, display_area, display_disasters, counties!inner(name, state_name)")
      .order("fips")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const co = (row as any).counties;
      const fips = row.fips.trim();
      if (enrichment[fips]) continue;
      counties.push({
        fips,
        name: co.name,
        state_name: co.state_name,
        display_population: row.display_population || "N/A",
        display_area: row.display_area || "N/A",
        display_disasters: row.display_disasters || "None",
      });
    }
    if (data.length < 1000) break;
    offset += 1000;
  }

  console.log(`Counties to process: ${counties.length}\n`);
  if (counties.length === 0) {
    const status = loadStatus();
    status.stage4 = {
      complete: true,
      enriched: Object.keys(enrichment).length,
      timestamp: new Date().toISOString(),
    };
    saveStatus(status);
    console.log("All done!");
    return;
  }

  let generated = 0;
  let failed = 0;
  const errors: string[] = [];
  const t0 = Date.now();
  const enrichSaver = createBatchedSaver(ENRICHMENT_FILE, 10);

  for (let i = 0; i < counties.length; i++) {
    const county = counties[i];

    try {
      // Generate flavor text via LLM
      const flavorPrompt = buildFlavorPrompt(
        county.name, county.state_name,
        county.display_population, county.display_area, county.display_disasters,
      );
      const rawFlavor = await queryLLM(flavorPrompt);
      const flavor = cleanFlavor(rawFlavor);

      if (!flavor) {
        failed++;
        errors.push(`${county.fips} ${county.name}: flavor text too short`);
        continue;
      }

      // Extract notable person from Wikipedia (no LLM)
      const { name: personName, desc: personDesc } = extractNotablePerson(wiki[county.fips] || null);

      enrichment[county.fips] = {
        flavor,
        person_name: personName,
        person_desc: personDesc,
      };
      generated++;

      // Save periodically (crash-safe)
      enrichSaver.save(enrichment);

      if ((i + 1) % 50 === 0 || i < 5) {
        const elapsed = (Date.now() - t0) / 1000;
        const rate = generated / elapsed;
        const eta = (counties.length - (i + 1)) / Math.max(rate, 0.01) / 60;
        console.log(`  [${i + 1}/${counties.length}] ${county.name}: "${flavor.substring(0, 50)}..." | ${rate.toFixed(2)}/s ETA ${eta.toFixed(0)}m`);
      }
    } catch (err: any) {
      failed++;
      const msg = `${county.fips} ${county.name}: ${err.message}`;
      errors.push(msg);
      if (failed <= 10) console.log(`  [error] ${msg}`);
    }
  }

  // Force-save final state
  enrichSaver.save(enrichment, true);

  // Unload model
  await unloadOllamaModels();

  // Update status
  const failRate = failed / counties.length;
  const status = loadStatus();
  status.stage4 = {
    complete: failRate < 0.05,
    enriched: Object.keys(enrichment).length,
    failed,
    errors: errors.slice(-20),
    timestamp: new Date().toISOString(),
  };
  saveStatus(status);

  if (failRate >= 0.05) {
    console.error(`\nWARNING: ${(failRate * 100).toFixed(1)}% failure rate. Stage marked incomplete.`);
  }

  console.log(`\n=== Stage 4 Complete in ${((Date.now() - t0) / 60000).toFixed(1)} min ===`);
  console.log(`Generated: ${generated} | Failed: ${failed} | Total: ${Object.keys(enrichment).length}`);
}

main().catch(err => { console.error(err); process.exit(1); });
