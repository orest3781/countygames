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
  const pctlInvUninsured = percentileRank(rows.map((m) => (m.pct_uninsured ? -m.pct_uninsured : null)));
  const pctlArea = percentileRank(rows.map((m) => m.land_area_sq_mi));
  const pctlDisasters = percentileRank(rows.map((m) => m.total_disasters));
  const pctlCrime = percentileRank(rows.map((m) => m.violent_crime_rate));
  const pctlEducation = percentileRank(rows.map((m) => m.pct_bachelors_or_higher));
  const pctlLowUnemp = percentileRank(rows.map((m) => (m.unemployment_rate ? -m.unemployment_rate : null)));

  const computed = rows.map((m, i) => {
    const stats: StatBlock = {
      wealth: Math.round(0.5 * pctlGdpPerCapita[i] + 0.5 * pctlMedianIncome[i]),
      people: Math.round(0.7 * pctlPop[i] + 0.3 * pctlGDP[i]),
      health: Math.round(0.4 * pctlLifeExp[i] + 0.3 * pctlPhysicians[i] + 0.3 * pctlInvUninsured[i]),
      land: pctlArea[i],
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
