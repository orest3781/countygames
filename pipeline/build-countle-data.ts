import AdmZip from "adm-zip";
import { downloadAndCache, downloadBuffer, REGION_MAP, supabase } from "./config";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import {
  parseGazetteer,
  parseCensus,
  parseGdp,
  parseHealth,
  parseFema,
  type CensusRow,
} from "./countle/parse";
import {
  computeStatsAndRarity,
  buildAnswerPool,
  formatMoney,
  formatPopulation,
  formatArea,
  formatDisasters,
  formatLifeExpectancy,
  formatEducation,
  type RawCounty,
} from "./countle/lib";

const CENSUS_URL =
  "https://api.census.gov/data/2022/acs/acs5?get=NAME,B01003_001E,B19013_001E,B19301_001E,B15003_022E,B15003_001E,B15003_017E,B23025_003E,B23025_005E,B25001_001E,B25003_002E,B25003_001E,B01002_001E&for=county:*&in=state:*";
const GAZETTEER_URL =
  "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_counties_national.zip";
const BEA_URL = "https://apps.bea.gov/regional/zip/CAGDP1.zip";
const HEALTH_URL =
  "https://www.countyhealthrankings.org/sites/default/files/media/document/analytic_data2024.csv";
const FEMA_URL =
  "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$select=fipsStateCode,fipsCountyCode,incidentType,fyDeclared,declarationType&$top=1000";

const DATA_DIR = join(process.cwd(), "data");
const CENSUS_CACHE = join(DATA_DIR, "census_acs.json");
// Secondary cache: Supabase-sourced rows (never touches Census API)
const CENSUS_SUPABASE_CACHE = join(DATA_DIR, "census_supabase.json");

interface EnrichmentEntry {
  flavor: string | null;
  person_name: string | null;
  person_desc: string | null;
  county_seat: string | null;
}

/** Unzip the gazetteer zip and return the text of the single .txt entry. */
function unzipTxt(buf: Buffer): string {
  const zip = new AdmZip(buf);
  const entry = zip.getEntries().find((e) => e.entryName.endsWith(".txt"));
  if (!entry) throw new Error("Gazetteer zip: no .txt entry found");
  return entry.getData().toString("utf-8");
}

/**
 * Return census rows — tries the Census API cache first, then falls back to
 * fetching from the Supabase raw_census table (which was populated by
 * pipeline/sources/01-census-acs.ts) and writing a local cache.
 *
 * NOTE: The Census Bureau API now requires a free API key for all requests.
 * Since no CENSUS_API_KEY is present in .env.local, we fall back to the
 * Supabase raw_census table which was populated by the existing pipeline.
 */
async function fetchCensusRows(): Promise<CensusRow[]> {
  // Try the standard Census API cache (valid JSON, not HTML).
  if (existsSync(CENSUS_CACHE)) {
    const text = readFileSync(CENSUS_CACHE, "utf-8");
    if (text.trimStart().startsWith("[")) {
      console.log("  [cache hit] census_acs.json");
      return parseCensus(text);
    }
    console.log("  [census_acs.json] invalid (Census API returned HTML — key required)");
  }

  // Try local Supabase-sourced cache.
  if (existsSync(CENSUS_SUPABASE_CACHE)) {
    console.log("  [cache hit] census_supabase.json");
    return JSON.parse(readFileSync(CENSUS_SUPABASE_CACHE, "utf-8")) as CensusRow[];
  }

  // Fetch from Supabase raw_census (already populated by pipeline stage 01).
  console.log("  [census] Census API requires key — reading from Supabase raw_census");
  const PAGE = 1000;
  const rows: CensusRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("raw_census")
      .select("fips,population,median_household_income,pct_bachelors_or_higher,unemployment_rate")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Supabase raw_census: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data) {
      rows.push({
        fips: r.fips as string,
        population: (r.population as number) ?? null,
        median_household_income: (r.median_household_income as number) ?? null,
        pct_bachelors_or_higher: (r.pct_bachelors_or_higher as number) ?? null,
        unemployment_rate: (r.unemployment_rate as number) ?? null,
      });
    }
    console.log(`  [census/supabase] ${rows.length} rows`);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  writeFileSync(CENSUS_SUPABASE_CACHE, JSON.stringify(rows));
  console.log(`  [census] cached ${rows.length} rows → census_supabase.json`);
  return rows;
}

async function fetchFema(): Promise<
  { fipsStateCode: string; fipsCountyCode: string }[]
> {
  const cache = join(DATA_DIR, "fema_disasters.json");
  if (existsSync(cache)) {
    console.log("  [cache hit] fema_disasters.json");
    return JSON.parse(readFileSync(cache, "utf-8"));
  }
  const all: { fipsStateCode: string; fipsCountyCode: string }[] = [];
  let skip = 0;
  while (true) {
    const res = await fetch(`${FEMA_URL}&$skip=${skip}&$orderby=id`);
    if (!res.ok) throw new Error(`FEMA HTTP ${res.status}`);
    const json = await res.json();
    const recs = json.DisasterDeclarationsSummaries as {
      fipsStateCode: string;
      fipsCountyCode: string;
    }[];
    if (!recs || recs.length === 0) break;
    all.push(...recs);
    console.log(`  [fema] ${all.length} records`);
    skip += 1000;
    await new Promise((r) => setTimeout(r, 200));
  }
  writeFileSync(cache, JSON.stringify(all));
  return all;
}

async function main() {
  console.log(
    "=== build-countle-data: assembling public/data/counties.json ==="
  );

  // 1. Download + parse all sources (downloadAndCache/Buffer reuse data/ cache).
  const gazBuf = await downloadBuffer(GAZETTEER_URL, "gazetteer_counties.zip");
  const gaz = parseGazetteer(unzipTxt(gazBuf));

  const census = await fetchCensusRows();
  const gdp = parseGdp(await downloadBuffer(BEA_URL, "CAGDP1.zip"));
  const health = parseHealth(
    await downloadAndCache(HEALTH_URL, "health_rankings_2024.csv")
  );
  const fema = parseFema(await fetchFema());

  console.log(
    `  parsed: ${gaz.length} counties, ${census.length} census, ${gdp.size} gdp, ${health.length} health, ${fema.size} fema`
  );

  // 2. Build lookup maps.
  const censusByFips = new Map(census.map((c) => [c.fips, c]));
  const healthByFips = new Map(health.map((h) => [h.fips, h]));
  const populationByFips = new Map<string, number>();
  for (const c of census) if (c.population) populationByFips.set(c.fips, c.population);

  // 3. Build a lat/lng map from gazetteer for direct use during assembly.
  const gazByFips = new Map(gaz.map((g) => [g.fips, g]));

  // 4. Merge into RawCounty rows (gazetteer is the spine — every US county).
  const merged: RawCounty[] = gaz.map((g) => {
    const c = censusByFips.get(g.fips);
    const h = healthByFips.get(g.fips);
    const gdpTotal = gdp.get(g.fips) ?? null;
    const pop = c?.population ?? null;
    return {
      fips: g.fips,
      name: g.name,
      state_abbr: g.state_abbr,
      state_name: g.state_name,
      land_area_sq_mi: g.land_area_sq_mi,
      population: pop,
      median_household_income: c?.median_household_income ?? null,
      gdp_total: gdpTotal,
      gdp_per_capita: gdpTotal && pop ? (gdpTotal * 1000) / pop : null,
      pct_bachelors_or_higher: c?.pct_bachelors_or_higher ?? null,
      unemployment_rate: c?.unemployment_rate ?? null,
      life_expectancy: h?.life_expectancy ?? null,
      primary_care_physicians_rate: h?.primary_care_physicians_rate ?? null,
      pct_uninsured: h?.pct_uninsured ?? null,
      violent_crime_rate: h?.violent_crime_rate ?? null,
      total_disasters: fema.get(g.fips) ?? null,
    };
  });

  // 5. Compute stats + rarity across ALL counties.
  const statResult = computeStatsAndRarity(merged);

  // 6. Art availability + answer pool.
  const artDir = join(process.cwd(), "data", "card-art");
  const hasArt = (fips: string) => existsSync(join(artDir, `${fips}.png`));
  const answerPool = buildAnswerPool({
    allFips: merged.map((m) => m.fips),
    populationByFips,
    hasArt,
  });

  // 7. Enrichment (surviving local file).
  const enrichmentPath = join(process.cwd(), "data", "enrichment.json");
  const enrichment: Record<string, EnrichmentEntry> = existsSync(enrichmentPath)
    ? (JSON.parse(readFileSync(enrichmentPath, "utf-8")) as Record<
        string,
        EnrichmentEntry
      >)
    : {};

  // 8. Assemble CountyEntry map.
  const counties: Record<string, unknown> = {};
  for (const m of merged) {
    const sr = statResult.get(m.fips)!;
    const e = enrichment[m.fips];
    const g = gazByFips.get(m.fips);
    const region = REGION_MAP[m.state_abbr]?.name ?? "Unknown";
    counties[m.fips] = {
      fips: m.fips,
      name: m.name,
      state_abbr: m.state_abbr,
      state_name: m.state_name,
      region,
      county_seat: e?.county_seat ?? null,
      lat: g?.lat ?? 0,
      lng: g?.lng ?? 0,
      stats: sr.stats,
      display: {
        wealth: formatMoney(m.median_household_income),
        health: formatLifeExpectancy(m.life_expectancy),
        people: formatPopulation(m.population),
        land: formatArea(m.land_area_sq_mi),
        danger: formatDisasters(m.total_disasters),
        education: formatEducation(m.pct_bachelors_or_higher),
      },
      rarity: sr.rarity,
      hasArt: hasArt(m.fips),
      isAnswerPool: answerPool.has(m.fips),
      notable_person: e?.person_name ?? null,
      notable_person_desc: e?.person_desc ?? null,
      flavor: e?.flavor ?? null,
    };
  }

  // 9. Write the deliverable.
  const outDir = join(process.cwd(), "public", "data");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    count: Object.keys(counties).length,
    answerPoolCount: answerPool.size,
    counties,
  };
  writeFileSync(join(outDir, "counties.json"), JSON.stringify(payload));
  console.log(
    `=== Done: ${payload.count} counties, ${payload.answerPoolCount} in answer pool ===`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
