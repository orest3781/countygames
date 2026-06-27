export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

/** Percentile rank an array of values. Returns ranks 1-100; null/NaN → 10. */
export function percentileRank(values: (number | null)[]): number[] {
  const validPairs = values
    .map((v, i) => ({ v, i }))
    .filter((p) => p.v !== null && !Number.isNaN(p.v)) as { v: number; i: number }[];

  validPairs.sort((a, b) => a.v - b.v);

  const ranks = new Array(values.length).fill(10);
  validPairs.forEach((p, sortIdx) => {
    const pctl = Math.round(((sortIdx + 1) / validPairs.length) * 100);
    ranks[p.i] = Math.max(1, Math.min(100, pctl));
  });
  return ranks;
}

export function formatPopulation(pop: number | null): string {
  if (pop == null) return "N/A";
  if (pop >= 1_000_000) return `${(pop / 1_000_000).toFixed(2)}M`;
  if (pop >= 1_000) return `${(pop / 1_000).toFixed(1)}K`;
  return pop.toString();
}

export function formatMoney(val: number | null): string {
  if (val == null || val < 0) return "N/A"; // any negative (incl. Census -666666666 sentinel) → N/A
  return "$" + val.toLocaleString("en-US");
}

export function formatArea(sqmi: number | null): string {
  if (sqmi == null) return "N/A";
  return `${sqmi.toLocaleString("en-US", { maximumFractionDigits: 0 })} sq mi`;
}

export function formatDisasters(count: number | null): string {
  if (!count) return "0 declared";
  return `${count} declared`;
}

export function formatLifeExpectancy(years: number | null): string {
  if (years == null) return "N/A";
  return `${years.toFixed(1)} yr life exp`;
}

export function formatEducation(pct: number | null): string {
  if (pct === null || Number.isNaN(pct)) return "N/A";
  return `${Math.round(pct)}% bachelor's+`;
}

export interface RawCounty {
  fips: string;
  name: string;
  state_abbr: string;
  state_name: string;
  land_area_sq_mi: number | null;
  population: number | null;
  median_household_income: number | null;
  gdp_total: number | null;
  gdp_per_capita: number | null;
  pct_bachelors_or_higher: number | null;
  unemployment_rate: number | null;
  life_expectancy: number | null;
  primary_care_physicians_rate: number | null;
  pct_uninsured: number | null;
  violent_crime_rate: number | null;
  total_disasters: number | null;
}

export interface StatBlock {
  wealth: number;
  health: number;
  people: number;
  land: number;
  danger: number;
  education: number;
}

/**
 * Compute the 6 stats (percentile-ranked across ALL input rows) plus a
 * total-score rarity tier. Mirrors the legacy compute-stats.ts weights, but
 * ranks across every county (not just a curated subset) and renames stats.
 */
export function computeStatsAndRarity(
  rows: RawCounty[]
): Map<string, { stats: StatBlock; rarity: Rarity; totalScore: number }> {
  const pctlGdpPerCapita = percentileRank(rows.map((m) => m.gdp_per_capita));
  const pctlMedianIncome = percentileRank(rows.map((m) => m.median_household_income));
  const pctlPop = percentileRank(rows.map((m) => (m.population ? Math.log10(m.population) : null)));
  const pctlGDP = percentileRank(rows.map((m) => m.gdp_total));
  const pctlLifeExp = percentileRank(rows.map((m) => m.life_expectancy));
  const pctlPhysicians = percentileRank(rows.map((m) => m.primary_care_physicians_rate));
  const pctlInvUninsured = percentileRank(rows.map((m) => (m.pct_uninsured != null ? -m.pct_uninsured : null)));
  const pctlArea = percentileRank(rows.map((m) => m.land_area_sq_mi));
  const pctlDisasters = percentileRank(rows.map((m) => m.total_disasters));
  const pctlCrime = percentileRank(rows.map((m) => m.violent_crime_rate));
  const pctlEducation = percentileRank(rows.map((m) => m.pct_bachelors_or_higher));
  const pctlLowUnemp = percentileRank(rows.map((m) => (m.unemployment_rate != null ? -m.unemployment_rate : null)));

  const computed = rows.map((m, i) => {
    const stats: StatBlock = {
      wealth: Math.round(0.5 * pctlGdpPerCapita[i] + 0.5 * pctlMedianIncome[i]),
      people: Math.round(0.7 * pctlPop[i] + 0.3 * pctlGDP[i]),
      health: Math.round(0.4 * pctlLifeExp[i] + 0.3 * pctlPhysicians[i] + 0.3 * pctlInvUninsured[i]),
      land: Math.round(pctlArea[i]),
      danger: Math.round(0.6 * pctlDisasters[i] + 0.4 * pctlCrime[i]),
      education: Math.round(0.6 * pctlEducation[i] + 0.4 * pctlLowUnemp[i]),
    };
    const totalScore = stats.wealth + stats.health + stats.people + stats.land + stats.danger + stats.education;
    return { fips: m.fips, stats, totalScore };
  });

  // Rarity by total-score percentile (same thresholds as legacy pipeline).
  const byScore = [...computed].sort((a, b) => a.totalScore - b.totalScore);
  const n = byScore.length;
  const rarityByFips = new Map<string, Rarity>();
  byScore.forEach((c, idx) => {
    const pctl = ((idx + 1) / n) * 100;
    const rarity: Rarity =
      pctl <= 40 ? "common" : pctl <= 70 ? "uncommon" : pctl <= 90 ? "rare" : pctl <= 97 ? "epic" : "legendary";
    rarityByFips.set(c.fips, rarity);
  });

  const out = new Map<string, { stats: StatBlock; rarity: Rarity; totalScore: number }>();
  for (const c of computed) {
    out.set(c.fips, { stats: c.stats, rarity: rarityByFips.get(c.fips)!, totalScore: c.totalScore });
  }
  return out;
}

/** State-capital county FIPS (one per state + DC). */
export const STATE_CAPITAL_FIPS: string[] = [
  "01101", "02020", "04013", "05119", "06067", "08031", "09003", "10003",
  "11001", "12073", "13121", "15003", "16001", "17167", "18097", "19153",
  "20177", "21073", "22033", "23011", "24003", "25025", "26065", "27123",
  "28049", "29051", "30049", "31109", "32510", "33013", "34021", "35049",
  "36001", "37183", "38015", "39049", "40109", "41047", "42043", "44007",
  "45079", "46065", "47037", "48453", "49035", "50023", "51760", "53067",
  "54039", "55025", "56021",
];

/** Famous / iconic county FIPS to always include. */
export const ICONIC_FIPS: string[] = [
  "36061", "06037", "17031", "12086", "48201", "04013", "32003", "06073",
  "48029", "06065", "36047", "36081", "36005", "36085", "06075", "25017",
  "42101", "53033", "08035", "48301", "15001", "02185", "06071", "51013",
  "24031", "12011", "12095", "26163", "29189", "27053", "41005", "55079",
  "39035", "18089", "22071", "48141", "35001", "16055", "30031", "56039",
];

/** Pick the n most-populous county FIPS within each state (state = first 2 of fips). */
export function topNPopulousPerState(populationByFips: Map<string, number>, n: number): Set<string> {
  const byState = new Map<string, { fips: string; pop: number }[]>();
  for (const [fips, pop] of populationByFips) {
    const st = fips.substring(0, 2);
    const arr = byState.get(st) ?? [];
    arr.push({ fips, pop });
    byState.set(st, arr);
  }
  const out = new Set<string>();
  for (const arr of byState.values()) {
    arr.sort((a, b) => b.pop - a.pop);
    for (const { fips } of arr.slice(0, n)) out.add(fips);
  }
  return out;
}

/**
 * The Countle daily answer pool: recognizable counties (state capitals ∪
 * iconic ∪ top-5-most-populous-per-state) that exist in the dataset.
 * ART-OPTIONAL — counties without art use an in-game fallback card, so art
 * is NOT a gate here. `hasArt` is tracked separately per county.
 */
export function buildAnswerPool(opts: {
  allFips: string[];
  populationByFips: Map<string, number>;
}): Set<string> {
  const famous = new Set<string>([
    ...STATE_CAPITAL_FIPS,
    ...ICONIC_FIPS,
    ...topNPopulousPerState(opts.populationByFips, 5),
  ]);
  const allSet = new Set(opts.allFips);
  const pool = new Set<string>();
  for (const fips of famous) {
    if (allSet.has(fips)) pool.add(fips);
  }
  return pool;
}
