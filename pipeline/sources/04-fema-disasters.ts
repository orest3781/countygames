/**
 * 04-fema-disasters.ts — FEMA disaster declarations per county.
 * Uses the OpenFEMA API (no key, paginated at 1000 records).
 */
import { batchUpsert, STATE_FIPS, fetchAllCountyFips } from "../config.js";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const BASE_URL =
  "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries";
const CACHE_FILE = join(process.cwd(), "data", "fema_disasters.json");

interface FemaRecord {
  fipsStateCode: string;
  fipsCountyCode: string;
  incidentType: string;
  fyDeclared: number;
  declarationType: string;
}

async function fetchAllFema(): Promise<FemaRecord[]> {
  // Check cache
  if (existsSync(CACHE_FILE)) {
    console.log("  [cache hit] fema_disasters.json");
    return JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
  }

  const allRecords: FemaRecord[] = [];
  let skip = 0;
  const limit = 1000;

  console.log("  [downloading] FEMA disaster declarations (paginated)...");

  while (true) {
    const url = `${BASE_URL}?$select=fipsStateCode,fipsCountyCode,incidentType,fyDeclared,declarationType&$top=${limit}&$skip=${skip}&$orderby=id`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);

    const json = await res.json();
    const records = json.DisasterDeclarationsSummaries as FemaRecord[];

    if (!records || records.length === 0) break;

    allRecords.push(...records);
    console.log(`  [fetched] ${allRecords.length} records (batch at skip=${skip})`);
    skip += limit;

    // Rate limiting courtesy
    await new Promise((r) => setTimeout(r, 200));
  }

  // Cache results
  writeFileSync(CACHE_FILE, JSON.stringify(allRecords));
  console.log(`  [saved] fema_disasters.json (${allRecords.length} records)`);

  return allRecords;
}

async function main() {
  console.log("=== 04-fema-disasters: Loading disaster data ===");

  const records = await fetchAllFema();
  console.log(`  Total FEMA records: ${records.length}`);

  // Aggregate by county FIPS
  const countyMap = new Map<
    string,
    { count: number; types: Set<string>; latestYear: number }
  >();

  for (const r of records) {
    const stateFips = (r.fipsStateCode || "").padStart(2, "0");
    const countyFips = (r.fipsCountyCode || "").padStart(3, "0");

    // Skip if county code is "000" (state-wide declarations)
    if (countyFips === "000") continue;
    if (!STATE_FIPS[stateFips]) continue;

    const fips = stateFips + countyFips;
    const existing = countyMap.get(fips) || {
      count: 0,
      types: new Set<string>(),
      latestYear: 0,
    };

    existing.count++;
    if (r.incidentType) existing.types.add(r.incidentType);
    if (r.fyDeclared > existing.latestYear) existing.latestYear = r.fyDeclared;

    countyMap.set(fips, existing);
  }

  console.log(`  Aggregated to ${countyMap.size} counties`);

  // Filter to only FIPS that exist in counties table
  const existingFips = await fetchAllCountyFips();
  const rows = Array.from(countyMap.entries())
    .filter(([fips]) => existingFips.has(fips))
    .map(([fips, data]) => ({
      fips,
      total_disasters: data.count,
      disaster_types: Array.from(data.types),
      most_recent_disaster_year: data.latestYear || null,
    }));

  console.log(`  After FK filter: ${rows.length} (dropped ${countyMap.size - rows.length})`);
  const count = await batchUpsert("raw_fema", rows);
  console.log(`=== Done: ${count} FEMA records loaded ===`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
