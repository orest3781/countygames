/**
 * 02-bea-gdp.ts — GDP by county from BEA.
 * Uses the CAGDP1__ALL_AREAS CSV from the zip.
 * LineCode 3 = "Current-dollar GDP (thousands of current dollars)"
 */
import { downloadBuffer, parseCSV, batchUpsert, STATE_FIPS, supabase, fetchAllCountyFips } from "../config.js";
import AdmZip from "adm-zip";

const BEA_URL = "https://apps.bea.gov/regional/zip/CAGDP1.zip";

async function main() {
  console.log("=== 02-bea-gdp: Loading GDP data ===");

  const zipBuf = await downloadBuffer(BEA_URL, "CAGDP1.zip");
  const zip = new AdmZip(zipBuf);
  const entries = zip.getEntries();

  // Use the ALL_AREAS file (contains every county in one file)
  const csvEntry = entries.find(
    (e) => e.entryName.includes("ALL_AREAS") && e.entryName.endsWith(".csv")
  );
  if (!csvEntry) {
    console.log("  Available:", entries.map((e) => e.entryName));
    throw new Error("Could not find ALL_AREAS CSV in zip");
  }

  console.log(`  Extracting ${csvEntry.entryName}`);
  const csvText = csvEntry.getData().toString("utf-8");
  const records = parseCSV(csvText);
  console.log(`  Parsed ${records.length} raw records`);

  // Find the latest year column
  const yearCols = Object.keys(records[0]).filter((k) => /^\d{4}$/.test(k));
  const latestYear = yearCols[yearCols.length - 1];
  console.log(`  Using year: ${latestYear}`);

  // Filter: LineCode = "3" for current-dollar GDP, county-level FIPS
  const countyGDP = new Map<string, number>();

  for (const r of records) {
    const lineCode = (r["LineCode"] || "").trim();
    if (lineCode !== "3") continue;

    let fips = (r["GeoFIPS"] || "").replace(/"/g, "").trim();
    if (fips.length < 5) continue;
    fips = fips.padStart(5, "0");
    if (fips.endsWith("000")) continue; // State/national totals

    const stateFips = fips.substring(0, 2);
    if (!STATE_FIPS[stateFips]) continue;

    const gdpStr = (r[latestYear] || "").replace(/,/g, "").replace(/\(.*\)/, "").trim();
    const gdp = parseInt(gdpStr);
    if (!isNaN(gdp) && gdp > 0) {
      countyGDP.set(fips, gdp); // thousands of dollars
    }
  }

  console.log(`  Found GDP for ${countyGDP.size} counties`);

  // Get existing county FIPS to avoid FK violations
  const existingFips = await fetchAllCountyFips();

  // Get population from raw_census to compute per-capita (paginated)
  const popMap = new Map<string, number>();
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("raw_census")
      .select("fips, population")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.population) popMap.set(r.fips.trim(), r.population);
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`  Population data for ${popMap.size} counties`);

  const rows = Array.from(countyGDP.entries())
    .filter(([fips]) => existingFips.has(fips))
    .map(([fips, gdp]) => {
      const pop = popMap.get(fips);
      const gdpPerCapita = pop && pop > 0 ? (gdp * 1000) / pop : null;
      return {
        fips,
        gdp_total: gdp,
        gdp_per_capita: gdpPerCapita ? Math.round(gdpPerCapita) : null,
      };
    });

  console.log(`  After FK filter: ${rows.length} (dropped ${countyGDP.size - rows.length})`);
  const count = await batchUpsert("raw_gdp", rows);
  console.log(`=== Done: ${count} GDP records loaded ===`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
