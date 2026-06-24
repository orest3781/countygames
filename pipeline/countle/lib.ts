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
  if (!pop) return "N/A";
  if (pop >= 1_000_000) return `${(pop / 1_000_000).toFixed(2)}M`;
  if (pop >= 1_000) return `${(pop / 1_000).toFixed(1)}K`;
  return pop.toString();
}

export function formatMoney(val: number | null): string {
  if (!val || val < 0) return "N/A"; // Census uses -666666666 as "no data"
  return "$" + val.toLocaleString("en-US");
}

export function formatArea(sqmi: number | null): string {
  if (!sqmi) return "N/A";
  return `${sqmi.toLocaleString("en-US", { maximumFractionDigits: 0 })} sq mi`;
}

export function formatDisasters(count: number | null): string {
  if (!count) return "0 declared";
  return `${count} declared`;
}

export function formatLifeExpectancy(years: number | null): string {
  if (!years) return "N/A";
  return `${years.toFixed(1)} yr life exp`;
}

export function formatEducation(pct: number | null): string {
  if (pct === null || Number.isNaN(pct)) return "N/A";
  return `${Math.round(pct)}% bachelor's+`;
}
