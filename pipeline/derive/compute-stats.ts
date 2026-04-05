/**
 * compute-stats.ts — Derive battle stats for curated counties.
 *
 * Reads all raw tables, computes 6 stats via weighted composites,
 * percentile-ranks them 1-100, assigns rarity tiers, and populates the cards table.
 */
import { supabase, STATE_FIPS } from "../config.js";

interface CountyRaw {
  fips: string;
  name: string;
  state_abbr: string;
  land_area_sq_mi: number | null;
  // Census
  population: number | null;
  median_household_income: number | null;
  per_capita_income: number | null;
  pct_bachelors_or_higher: number | null;
  unemployment_rate: number | null;
  // GDP
  gdp_total: number | null;
  gdp_per_capita: number | null;
  // Health
  health_outcomes_rank: number | null;
  violent_crime_rate: number | null;
  primary_care_physicians_rate: number | null;
  pct_uninsured: number | null;
  life_expectancy: number | null;
  // FEMA
  total_disasters: number | null;
}

/** Percentile rank an array of values. Returns ranks 1-100. */
function percentileRank(values: (number | null)[]): number[] {
  const validPairs = values
    .map((v, i) => ({ v, i }))
    .filter((p) => p.v !== null && !isNaN(p.v!)) as { v: number; i: number }[];

  validPairs.sort((a, b) => a.v - b.v);

  const ranks = new Array(values.length).fill(10); // null data = low rank (not median)

  validPairs.forEach((p, sortIdx) => {
    // Percentile: position / total * 100, clamped to 1-100
    const pctl = Math.round(((sortIdx + 1) / validPairs.length) * 100);
    ranks[p.i] = Math.max(1, Math.min(100, pctl));
  });

  return ranks;
}

function formatPopulation(pop: number | null): string {
  if (!pop) return "N/A";
  if (pop >= 1_000_000) return `${(pop / 1_000_000).toFixed(2)}M`;
  if (pop >= 1_000) return `${(pop / 1_000).toFixed(1)}K`;
  return pop.toString();
}

function formatMoney(val: number | null): string {
  if (!val || val < 0) return "N/A"; // Census uses -666666666 as "no data" sentinel
  return "$" + val.toLocaleString("en-US");
}

function formatGDP(gdpThousands: number | null): string {
  if (!gdpThousands) return "N/A";
  const dollars = gdpThousands * 1000;
  if (dollars >= 1_000_000_000_000) return `$${(dollars / 1_000_000_000_000).toFixed(1)}T`;
  if (dollars >= 1_000_000_000) return `$${(dollars / 1_000_000_000).toFixed(1)}B`;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(0)}M`;
  return `$${(dollars / 1_000).toFixed(0)}K`;
}

function formatArea(sqmi: number | null): string {
  if (!sqmi) return "N/A";
  return `${sqmi.toLocaleString("en-US", { maximumFractionDigits: 0 })} sq mi`;
}

function formatDisasters(count: number | null): string {
  if (!count) return "0 declared";
  return `${count} declared`;
}

async function main() {
  console.log("=== compute-stats: Deriving battle stats ===");

  // Fetch ALL counties (paginated to handle 3,144+ rows)
  const counties: any[] = [];
  let countyOffset = 0;
  while (true) {
    const { data } = await supabase
      .from("counties")
      .select("fips, name, state_abbr, land_area_sq_mi")
      .eq("is_curated", true)
      .range(countyOffset, countyOffset + 999);
    if (!data || data.length === 0) break;
    counties.push(...data);
    if (data.length < 1000) break;
    countyOffset += 1000;
  }

  if (counties.length === 0) {
    throw new Error("No counties found.");
  }
  console.log(`  ${counties.length} counties to process`);

  const fipsList = counties.map((c) => c.fips.trim());

  // Fetch raw data in batches (Supabase .in() can have URL length limits)
  async function fetchInBatches(table: string, fipsList: string[]) {
    const all: Record<string, unknown>[] = [];
    for (let i = 0; i < fipsList.length; i += 200) {
      const batch = fipsList.slice(i, i + 200);
      const { data } = await supabase.from(table).select("*").in("fips", batch);
      if (data) all.push(...data);
    }
    return all;
  }

  const [censusAll, gdpAll, healthAll, femaAll] = await Promise.all([
    fetchInBatches("raw_census", fipsList),
    fetchInBatches("raw_gdp", fipsList),
    fetchInBatches("raw_health", fipsList),
    fetchInBatches("raw_fema", fipsList),
  ]);

  // Build lookup maps
  const censusMap = new Map(censusAll.map((r: any) => [r.fips.trim(), r]));
  const gdpMap = new Map(gdpAll.map((r: any) => [r.fips.trim(), r]));
  const healthMap = new Map(healthAll.map((r: any) => [r.fips.trim(), r]));
  const femaMap = new Map(femaAll.map((r: any) => [r.fips.trim(), r]));

  // Merge into unified records
  const merged: CountyRaw[] = counties.map((c) => {
    const fips = c.fips.trim();
    const census = censusMap.get(fips);
    const gdp = gdpMap.get(fips);
    const health = healthMap.get(fips);
    const fema = femaMap.get(fips);

    return {
      fips,
      name: c.name,
      state_abbr: c.state_abbr.trim(),
      land_area_sq_mi: c.land_area_sq_mi,
      population: census?.population ?? null,
      median_household_income: census?.median_household_income ?? null,
      per_capita_income: census?.per_capita_income ?? null,
      pct_bachelors_or_higher: census?.pct_bachelors_or_higher ?? null,
      unemployment_rate: census?.unemployment_rate ?? null,
      gdp_total: gdp?.gdp_total ?? null,
      gdp_per_capita: gdp?.gdp_per_capita ?? null,
      health_outcomes_rank: health?.health_outcomes_rank ?? null,
      violent_crime_rate: health?.violent_crime_rate ?? null,
      primary_care_physicians_rate: health?.primary_care_physicians_rate ?? null,
      pct_uninsured: health?.pct_uninsured ?? null,
      life_expectancy: health?.life_expectancy ?? null,
      total_disasters: fema?.total_disasters ?? null,
    };
  });

  // Compute percentile ranks for each raw metric
  // ECONOMIC (per-capita — decouples from population)
  const pctlGdpPerCapita = percentileRank(merged.map((m) => m.gdp_per_capita));
  const pctlMedianIncome = percentileRank(merged.map((m) => m.median_household_income));
  // SCALE (total size)
  const pctlPop = percentileRank(merged.map((m) => m.population ? Math.log10(m.population) : null));
  const pctlGDP = percentileRank(merged.map((m) => m.gdp_total));
  // HEALTH (pure health metrics, no income overlap)
  const pctlLifeExp = percentileRank(merged.map((m) => m.life_expectancy));
  const pctlPhysicians = percentileRank(merged.map((m) => m.primary_care_physicians_rate));
  const pctlInvUninsured = percentileRank(
    merged.map((m) => m.pct_uninsured ? -m.pct_uninsured : null) // lower uninsured = better
  );
  // GEOGRAPHY
  const pctlArea = percentileRank(merged.map((m) => m.land_area_sq_mi));
  // DANGER
  const pctlDisasters = percentileRank(merged.map((m) => m.total_disasters));
  const pctlCrime = percentileRank(merged.map((m) => m.violent_crime_rate));
  // IDENTITY
  const pctlEducation = percentileRank(merged.map((m) => m.pct_bachelors_or_higher));
  const pctlOwnerOcc = percentileRank(merged.map((m) => m.unemployment_rate ? -m.unemployment_rate : null)); // lower unemployment = better

  // Derive 6 battle stats — designed for ORTHOGONAL tradeoffs
  const cards = merged.map((m, i) => {
    // POWER: Per-capita wealth (favors small rich counties like Manhattan, NOT big cities)
    const statPower = Math.round(
      0.5 * pctlGdpPerCapita[i] + 0.5 * pctlMedianIncome[i]
    );

    // POPULATION: Raw scale — big cities are tanks (favors LA, Cook, Harris)
    const statPopulation = Math.round(
      0.7 * pctlPop[i] + 0.3 * pctlGDP[i]
    );

    // RESILIENCE: Pure health — life expectancy, doctors, insurance (not income!)
    const statResilience = Math.round(
      0.4 * pctlLifeExp[i] + 0.3 * pctlPhysicians[i] + 0.3 * pctlInvUninsured[i]
    );

    // TERRAIN: Land area — big rural counties (Alaska boroughs, San Bernardino)
    const statTerrain = pctlArea[i];

    // CHAOS: Disasters + crime — danger zones (Florida coast, Tornado Alley)
    const statChaos = Math.round(0.6 * pctlDisasters[i] + 0.4 * pctlCrime[i]);

    // CULTURE: Education + low unemployment — community strength
    const statCulture = Math.round(
      0.6 * pctlEducation[i] + 0.4 * pctlOwnerOcc[i]
    );

    const totalScore =
      statPower + statResilience + statPopulation + statTerrain + statChaos + statCulture;

    return {
      fips: m.fips,
      display_population: formatPopulation(m.population),
      display_income: formatMoney(m.median_household_income),
      display_gdp: formatGDP(m.gdp_total),
      display_area: formatArea(m.land_area_sq_mi),
      display_disasters: formatDisasters(m.total_disasters),
      display_landmarks: null, // Phase 2
      stat_power: statPower,
      stat_resilience: statResilience,
      stat_population: statPopulation,
      stat_terrain: statTerrain,
      stat_chaos: statChaos,
      stat_culture: statCulture,
      total_score: totalScore,
      rarity: "", // assigned below
      county_type: null, // Phase 2
      flavor_text: null, // Phase 2
    };
  });

  // Assign rarity based on total_score percentile
  const scoreSorted = [...cards].sort((a, b) => a.total_score - b.total_score);
  const n = scoreSorted.length;
  scoreSorted.forEach((card, idx) => {
    const pctl = ((idx + 1) / n) * 100;
    if (pctl <= 40) card.rarity = "common";
    else if (pctl <= 70) card.rarity = "uncommon";
    else if (pctl <= 90) card.rarity = "rare";
    else if (pctl <= 97) card.rarity = "epic";
    else card.rarity = "legendary";
  });

  // Upsert to cards table (batch of 100 since rows are larger)
  let total = 0;
  for (let i = 0; i < cards.length; i += 100) {
    const batch = cards.slice(i, i + 100);
    const { error } = await supabase.from("cards").upsert(batch);
    if (error) {
      console.error(`  [error] batch ${i}:`, error.message);
      throw error;
    }
    total += batch.length;
    console.log(`  [upserted] ${total}/${cards.length} cards`);
  }

  // Print stats summary
  const rarityCount = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
  for (const c of cards) {
    rarityCount[c.rarity as keyof typeof rarityCount]++;
  }
  console.log("\n  Rarity distribution:");
  for (const [tier, count] of Object.entries(rarityCount)) {
    console.log(`    ${tier}: ${count}`);
  }

  // Print legendary counties
  const legendaries = cards
    .filter((c) => c.rarity === "legendary")
    .sort((a, b) => b.total_score - a.total_score);

  console.log("\n  Legendary counties:");
  for (const l of legendaries) {
    const m = merged.find((m) => m.fips === l.fips)!;
    console.log(
      `    ${m.name}, ${m.state_abbr} — Score: ${l.total_score} | PWR:${l.stat_power} RES:${l.stat_resilience} POP:${l.stat_population} TER:${l.stat_terrain} CHA:${l.stat_chaos} CUL:${l.stat_culture}`
    );
  }

  // Print stat ranges
  const statNames = ["stat_power", "stat_resilience", "stat_population", "stat_terrain", "stat_chaos", "stat_culture"] as const;
  console.log("\n  Stat ranges:");
  for (const stat of statNames) {
    const vals = cards.map((c) => c[stat]);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    console.log(`    ${stat}: min=${min} max=${max} avg=${avg}`);
  }

  console.log(`\n=== Done: ${total} cards created ===`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
