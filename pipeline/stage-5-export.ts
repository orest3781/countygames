/**
 * Stage 5: Export — Write enrichment data to Supabase and export CSV.
 *
 * Reads descriptions.json and enrichment.json, updates cards table,
 * then exports all card data to data/export.csv.
 *
 * Usage: npx tsx pipeline/stage-5-export.ts
 */

import { supabase, loadStatus, saveStatus, loadJson, batchUpsert } from "./config.js";
import { writeFileSync, existsSync } from "fs";
import { join } from "path";

const DESCRIPTIONS_FILE = "data/descriptions.json";
const ENRICHMENT_FILE = "data/enrichment.json";
const WIKI_FILE = "data/wiki.json";
const EXPORT_FILE = join(process.cwd(), "data", "export.csv");

async function main() {
  console.log("=== Stage 5: Export ===\n");

  // Dependency checks
  for (const file of [DESCRIPTIONS_FILE, ENRICHMENT_FILE, WIKI_FILE]) {
    const fullPath = join(process.cwd(), file);
    if (!existsSync(fullPath)) {
      console.error(`ERROR: ${file} not found. Run earlier stages first.`);
      process.exit(1);
    }
  }

  const descriptions = loadJson<Record<string, string>>(DESCRIPTIONS_FILE);
  const enrichment = loadJson<Record<string, { flavor: string; person_name: string | null; person_desc: string | null }>>(ENRICHMENT_FILE);

  console.log(`Descriptions: ${Object.keys(descriptions).length}`);
  console.log(`Enrichment: ${Object.keys(enrichment).length}`);

  // Build updates
  const updates: Record<string, unknown>[] = [];
  const allFips = new Set([...Object.keys(descriptions), ...Object.keys(enrichment)]);

  for (const fips of allFips) {
    const update: Record<string, unknown> = { fips };
    if (descriptions[fips]) update.art_prompt = descriptions[fips];
    const enrich = enrichment[fips];
    if (enrich) {
      update.flavor_text = enrich.flavor;
      if (enrich.person_name) update.notable_person = enrich.person_name;
      if (enrich.person_desc) update.notable_person_desc = enrich.person_desc;
    }
    updates.push(update);
  }

  console.log(`\nUpdating ${updates.length} cards in Supabase...`);
  await batchUpsert("cards", updates, 200);

  // Export CSV
  console.log("\nExporting CSV...");
  const columns = [
    "fips", "county_name", "state_abbr", "state_name",
    "rarity", "total_score",
    "stat_power", "stat_resilience", "stat_population", "stat_terrain", "stat_chaos", "stat_culture",
    "display_population", "display_area", "display_disasters",
    "ability_name", "ability_desc",
    "flavor_text", "notable_person", "notable_person_desc", "art_prompt",
    "image_url",
  ];

  const allCards: Record<string, string>[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("cards")
      .select("*, counties!inner(name, state_abbr, state_name)")
      .order("fips")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const co = (row as any).counties;
      allCards.push({
        fips: row.fips.trim(),
        county_name: co.name,
        state_abbr: co.state_abbr.trim(),
        state_name: co.state_name,
        rarity: row.rarity || "",
        total_score: String(row.total_score || ""),
        stat_power: String(row.stat_power || ""),
        stat_resilience: String(row.stat_resilience || ""),
        stat_population: String(row.stat_population || ""),
        stat_terrain: String(row.stat_terrain || ""),
        stat_chaos: String(row.stat_chaos || ""),
        stat_culture: String(row.stat_culture || ""),
        display_population: row.display_population || "",
        display_area: row.display_area || "",
        display_disasters: row.display_disasters || "",
        ability_name: row.ability_name || "",
        ability_desc: row.ability_desc || "",
        flavor_text: row.flavor_text || "",
        notable_person: row.notable_person || "",
        notable_person_desc: row.notable_person_desc || "",
        art_prompt: row.art_prompt || "",
        image_url: row.image_url || "",
      });
    }
    if (data.length < 1000) break;
    offset += 1000;
  }

  // Write CSV
  const escCsv = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csvLines = [columns.join(",")];
  for (const card of allCards) {
    csvLines.push(columns.map(col => escCsv(card[col] || "")).join(","));
  }
  writeFileSync(EXPORT_FILE, csvLines.join("\n"), "utf-8");
  console.log(`Exported ${allCards.length} cards to ${EXPORT_FILE}`);

  // Update status
  const status = loadStatus();
  status.stage5 = {
    complete: true,
    exported: allCards.length,
    timestamp: new Date().toISOString(),
  };
  saveStatus(status);

  console.log(`\n=== Stage 5 Complete ===`);
  console.log(`Updated: ${updates.length} cards | Exported: ${allCards.length} rows`);
}

main().catch(err => { console.error(err); process.exit(1); });
