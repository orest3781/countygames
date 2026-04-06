/**
 * 05-usda-typology.ts — Ingest USDA ERS County Typology Codes (2025 edition).
 *
 * Downloads the XLSX from USDA ERS, parses it, and upserts to raw_usda_typology.
 * Flags: farming, mining, manufacturing, government, recreation, nonspecialized,
 * plus demographic flags (poverty, retirement, population loss, etc.)
 *
 * Usage: npx tsx pipeline/sources/05-usda-typology.ts
 */

import { supabase, batchUpsert } from "../config.js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import AdmZip from "adm-zip";

const XLSX_URL = "https://www.ers.usda.gov/media/6173/ers-county-typology-codes-2025-edition.xlsx";
const XLSX_FILE = join(process.cwd(), "data", "usda-typology-2025.xlsx");

function parseXlsx(filepath: string): Record<string, string>[] {
  const zip = new AdmZip(filepath);

  // Parse shared strings
  const ssEntry = zip.getEntry("xl/sharedStrings.xml");
  const strings: string[] = [];
  if (ssEntry) {
    const ssXml = ssEntry.getData().toString("utf-8");
    const siBlocks = ssXml.match(/<si>[\s\S]*?<\/si>/g) || [];
    for (const block of siBlocks) {
      const texts = [...block.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(m => m[1]);
      strings.push(texts.join(""));
    }
  }

  // Parse first sheet
  const sheetXml = zip.getEntry("xl/worksheets/sheet1.xml")!.getData().toString("utf-8");
  const rowBlocks = sheetXml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || [];

  // Parse header row
  const headerCells = rowBlocks[0].match(/<c[^>]*>[\s\S]*?<\/c>/g) || [];
  const headers = headerCells.map(cell => {
    const type = (cell.match(/t="([^"]+)"/) || [])[1] || "n";
    const val = (cell.match(/<v>([^<]+)<\/v>/) || [])[1] || "";
    return type === "s" ? strings[parseInt(val)] : val;
  });

  // Parse data rows
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < rowBlocks.length; r++) {
    const cells = rowBlocks[r].match(/<c[^>]*>[\s\S]*?<\/c>/g) || [];
    const row: Record<string, string> = {};
    for (let c = 0; c < cells.length; c++) {
      const ref = (cells[c].match(/r="([^"]+)"/) || [])[1] || "";
      const colLetter = ref.replace(/\d+/g, "");
      const colIdx = colLetter.split("").reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const type = (cells[c].match(/t="([^"]+)"/) || [])[1] || "n";
      const val = (cells[c].match(/<v>([^<]+)<\/v>/) || [])[1] || "";
      const resolved = type === "s" ? strings[parseInt(val)] : val;
      if (colIdx < headers.length) {
        row[headers[colIdx]] = resolved;
      }
    }
    if (row["FIPStxt"]) rows.push(row);
  }

  return rows;
}

async function main() {
  console.log("=== USDA County Typology Codes (2025) ===\n");

  // Download XLSX if not cached
  if (!existsSync(XLSX_FILE)) {
    console.log(`Downloading from USDA ERS...`);
    const res = await fetch(XLSX_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${XLSX_URL}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(XLSX_FILE, buf);
    console.log(`Saved: ${XLSX_FILE} (${(buf.length / 1024).toFixed(0)} KB)\n`);
  } else {
    console.log(`Using cached: ${XLSX_FILE}\n`);
  }

  // Parse
  const rows = parseXlsx(XLSX_FILE);
  console.log(`Parsed ${rows.length} counties from XLSX\n`);

  // Map to Supabase rows
  const upsertRows = rows.map(r => ({
    fips: r["FIPStxt"],
    state_abbr: r["State"],
    county_name: r["County_Name"],
    metro: r["Metro2023"] === "1",
    farming: r["High_Farming_2025"] === "1",
    mining: r["High_Mining_2025"] === "1",
    manufacturing: r["High_Manufacturing_2025"] === "1",
    government: r["High_Government_2025"] === "1",
    recreation: r["High_Recreation_2025"] === "1",
    nonspecialized: r["Nonspecialized_2025"] === "1",
    industry_dependence: parseInt(r["Industry_Dependence_2025"] || "0"),
    low_education: r["Low_PostSecondary_Ed_2025"] === "1",
    low_employment: r["Low_Employment_2025"] === "1",
    population_loss: r["Population_Loss_2025"] === "1",
    housing_stress: r["Housing_Stress_2025"] === "1",
    retirement_destination: r["Retirement_Destination_2025"] === "1",
    persistent_poverty: r["Persistent_Poverty_1721"] === "1",
  }));

  // Print distribution
  const counts = {
    farming: 0, mining: 0, manufacturing: 0,
    government: 0, recreation: 0, nonspecialized: 0, metro: 0,
    persistent_poverty: 0, retirement_destination: 0, population_loss: 0,
  };
  for (const r of upsertRows) {
    if (r.farming) counts.farming++;
    if (r.mining) counts.mining++;
    if (r.manufacturing) counts.manufacturing++;
    if (r.government) counts.government++;
    if (r.recreation) counts.recreation++;
    if (r.nonspecialized) counts.nonspecialized++;
    if (r.metro) counts.metro++;
    if (r.persistent_poverty) counts.persistent_poverty++;
    if (r.retirement_destination) counts.retirement_destination++;
    if (r.population_loss) counts.population_loss++;
  }
  console.log("Distribution:");
  for (const [key, count] of Object.entries(counts)) {
    console.log(`  ${key}: ${count}`);
  }
  console.log();

  // Upsert
  await batchUpsert("raw_usda_typology", upsertRows, 500);
  console.log(`\n=== Done: ${upsertRows.length} counties upserted to raw_usda_typology ===`);
}

main().catch(err => { console.error(err); process.exit(1); });
