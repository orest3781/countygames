/**
 * select-500.ts — Curate ~500 counties for the launch set.
 *
 * Selection criteria (in priority order):
 * 1. All 50 state capitals (~50)
 * 2. Top 5 most populous counties per state (~250)
 * 3. Counties with extreme/notable stats (~100)
 * 4. Fill to reach 500 with geographic diversity (min 8 per state)
 */
import { supabase, STATE_FIPS, fetchAllCountyFips } from "../config.js";

/** Paginated fetch from a table (bypasses 1000-row limit). */
async function fetchAll<T extends Record<string, unknown>>(
  table: string,
  select: string,
  options?: { order?: string; ascending?: boolean; filter?: [string, string, unknown] }
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    let query = supabase.from(table).select(select).range(offset, offset + limit - 1);
    if (options?.order) query = query.order(options.order, { ascending: options.ascending ?? true });
    if (options?.filter) query = query.not(options.filter[0], options.filter[1] as any, options.filter[2]);
    const { data } = await query;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < limit) break;
    offset += limit;
  }
  return all;
}

// State capitals mapped to their county FIPS codes
const STATE_CAPITAL_FIPS: string[] = [
  "01101", // Montgomery, AL
  "02020", // Anchorage, AK (Anchorage Municipality)
  "04013", // Maricopa, AZ (Phoenix)
  "05119", // Pulaski, AR (Little Rock)
  "06067", // Sacramento, CA
  "08031", // Denver, CO
  "09003", // Hartford, CT
  "10003", // Kent, DE (Dover)
  "11001", // District of Columbia
  "12073", // Leon, FL (Tallahassee)
  "13121", // Fulton, GA (Atlanta)
  "15003", // Honolulu, HI
  "16001", // Ada, ID (Boise)
  "17167", // Sangamon, IL (Springfield)
  "18097", // Marion, IN (Indianapolis)
  "19153", // Polk, IA (Des Moines)
  "20177", // Shawnee, KS (Topeka)
  "21073", // Franklin, KY (Frankfort)
  "22033", // East Baton Rouge, LA
  "23011", // Kennebec, ME (Augusta)
  "24003", // Anne Arundel, MD (Annapolis)
  "25025", // Suffolk, MA (Boston)
  "26065", // Ingham, MI (Lansing)
  "27123", // Ramsey, MN (St. Paul)
  "28049", // Hinds, MS (Jackson)
  "29051", // Cole, MO (Jefferson City)
  "30049", // Lewis and Clark, MT (Helena)
  "31109", // Lancaster, NE (Lincoln)
  "32510", // Carson City, NV
  "33013", // Merrimack, NH (Concord)
  "34021", // Mercer, NJ (Trenton)
  "35049", // Santa Fe, NM
  "36001", // Albany, NY
  "37183", // Wake, NC (Raleigh)
  "38015", // Burleigh, ND (Bismarck)
  "39049", // Franklin, OH (Columbus)
  "40109", // Oklahoma, OK (Oklahoma City)
  "41047", // Marion, OR (Salem)
  "42043", // Dauphin, PA (Harrisburg)
  "44007", // Providence, RI
  "45079", // Richland, SC (Columbia)
  "46065", // Hughes, SD (Pierre)
  "47037", // Davidson, TN (Nashville)
  "48453", // Travis, TX (Austin)
  "49035", // Salt Lake, UT
  "50021", // Washington, VT (Montpelier)
  "51760", // Richmond city, VA
  "53067", // Thurston, WA (Olympia)
  "54039", // Kanawha, WV (Charleston)
  "55025", // Dane, WI (Madison)
  "56021", // Laramie, WY (Cheyenne)
];

// Famous/iconic county FIPS to always include
const ICONIC_FIPS: string[] = [
  "36061", // New York County (Manhattan)
  "06037", // Los Angeles County
  "17031", // Cook County (Chicago)
  "12086", // Miami-Dade
  "48201", // Harris (Houston)
  "04013", // Maricopa (Phoenix)
  "32003", // Clark (Las Vegas)
  "06073", // San Diego
  "48029", // Bexar (San Antonio)
  "06065", // Riverside, CA
  "36047", // Kings (Brooklyn)
  "36081", // Queens
  "36005", // Bronx
  "36085", // Staten Island (Richmond)
  "06075", // San Francisco
  "25017", // Middlesex, MA
  "42101", // Philadelphia
  "53033", // King (Seattle)
  "08035", // Douglas, CO (wealthiest county)
  "48301", // Loving, TX (smallest pop)
  "15001", // Hawaii County (Big Island)
  "02185", // North Slope, AK (largest by area)
  "06071", // San Bernardino (largest in lower 48)
  "51013", // Arlington, VA
  "24031", // Montgomery, MD
  "12011", // Broward, FL (Fort Lauderdale)
  "12095", // Orange, FL (Orlando)
  "26163", // Wayne, MI (Detroit)
  "29189", // St. Louis County, MO
  "27053", // Hennepin, MN (Minneapolis)
  "41005", // Clackamas, OR (Portland metro)
  "55079", // Milwaukee, WI
  "39035", // Cuyahoga, OH (Cleveland)
  "18089", // Lake, IN (Gary)
  "22071", // Orleans, LA (New Orleans)
  "48141", // El Paso, TX
  "35001", // Bernalillo, NM (Albuquerque)
  "16055", // Kootenai, ID (Coeur d'Alene)
  "30031", // Gallatin, MT (Bozeman)
  "56039", // Teton, WY (Jackson Hole)
];

async function main() {
  console.log("=== Curating ~500 counties ===");

  // Reset all curation flags
  await supabase.from("counties").update({ is_curated: false }).neq("fips", "");

  const selectedFips = new Set<string>();

  // 1. State capitals
  for (const fips of STATE_CAPITAL_FIPS) {
    selectedFips.add(fips);
  }
  console.log(`  After capitals: ${selectedFips.size}`);

  // 2. Iconic counties
  for (const fips of ICONIC_FIPS) {
    selectedFips.add(fips);
  }
  console.log(`  After iconic: ${selectedFips.size}`);

  // 3. Top 5 most populous per state (need all counties, paginated)
  const censusData = await fetchAll<{ fips: string; population: number }>(
    "raw_census", "fips, population",
    { order: "population", ascending: false, filter: ["population", "is", null] }
  );

  const stateCount = new Map<string, number>();
  for (const r of censusData) {
    const stateFips = r.fips.trim().substring(0, 2);
    const count = stateCount.get(stateFips) || 0;
    if (count < 5) {
      selectedFips.add(r.fips.trim());
      stateCount.set(stateFips, count + 1);
    }
  }
  console.log(`  After top-5-per-state: ${selectedFips.size}`);

  // 4. Counties with most FEMA disasters (top 50)
  const { data: femaData } = await supabase
    .from("raw_fema")
    .select("fips, total_disasters")
    .not("total_disasters", "is", null)
    .order("total_disasters", { ascending: false })
    .limit(50);

  if (femaData) {
    for (const r of femaData) {
      selectedFips.add(r.fips.trim());
    }
  }
  console.log(`  After top disasters: ${selectedFips.size}`);

  // 5. Highest GDP counties (top 30)
  const { data: gdpData } = await supabase
    .from("raw_gdp")
    .select("fips, gdp_total")
    .not("gdp_total", "is", null)
    .order("gdp_total", { ascending: false })
    .limit(30);

  if (gdpData) {
    for (const r of gdpData) {
      selectedFips.add(r.fips.trim());
    }
  }
  console.log(`  After top GDP: ${selectedFips.size}`);

  // 6. Largest by land area (top 30)
  const { data: areaData } = await supabase
    .from("counties")
    .select("fips, land_area_sq_mi")
    .not("land_area_sq_mi", "is", null)
    .order("land_area_sq_mi", { ascending: false })
    .limit(30);

  if (areaData) {
    for (const r of areaData) {
      selectedFips.add(r.fips.trim());
    }
  }
  console.log(`  After largest area: ${selectedFips.size}`);

  // 7. Smallest population counties (top 20) — interesting outliers
  if (censusData) {
    const smallest = [...censusData].reverse().slice(0, 20);
    for (const r of smallest) {
      selectedFips.add(r.fips.trim());
    }
  }
  console.log(`  After smallest pop: ${selectedFips.size}`);

  // 8. Fill to ensure minimum 8 per state, up to 500 total
  const allCounties = await fetchAll<{ fips: string; state_fips: string }>(
    "counties", "fips, state_fips", { order: "fips" }
  );

  if (selectedFips.size < 500) {
    // Count per state
    const stateSelected = new Map<string, string[]>();
    for (const fips of selectedFips) {
      const st = fips.substring(0, 2);
      const arr = stateSelected.get(st) || [];
      arr.push(fips);
      stateSelected.set(st, arr);
    }

    // For each state with < 8, add random counties with census data
    const censusSet = new Set(censusData.map((r) => r.fips.trim()));
    for (const [stFips] of Object.entries(STATE_FIPS)) {
      const current = stateSelected.get(stFips) || [];
      if (current.length >= 8) continue;

      const needed = 8 - current.length;
      const candidates = allCounties
        .filter(
          (c) =>
            c.state_fips.trim() === stFips &&
            !selectedFips.has(c.fips.trim()) &&
            censusSet.has(c.fips.trim())
        )
        .slice(0, needed);

      for (const c of candidates) {
        selectedFips.add(c.fips.trim());
        if (selectedFips.size >= 500) break;
      }
      if (selectedFips.size >= 500) break;
    }
  }
  console.log(`  Final selection: ${selectedFips.size} counties`);

  // Update is_curated flag
  const fipsArray = Array.from(selectedFips);
  // Batch update in groups of 100 (Supabase filter limit)
  for (let i = 0; i < fipsArray.length; i += 100) {
    const batch = fipsArray.slice(i, i + 100);
    const { error } = await supabase
      .from("counties")
      .update({ is_curated: true })
      .in("fips", batch);
    if (error) throw error;
  }

  // Print state distribution
  const stateDist = new Map<string, number>();
  for (const fips of selectedFips) {
    const st = fips.substring(0, 2);
    stateDist.set(st, (stateDist.get(st) || 0) + 1);
  }
  console.log("\n  State distribution:");
  for (const [st, count] of [...stateDist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`    ${STATE_FIPS[st]?.abbr}: ${count}`);
  }

  console.log(`\n=== Done: ${selectedFips.size} counties curated ===`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
