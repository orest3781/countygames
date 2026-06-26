import type { CountleState, Dataset } from "./types";

export type CountyStatus = "solved" | "encountered" | "untouched";
export interface RegionProgress { region: string; solved: number; total: number; }
export interface StatsSummary {
  played: number; wins: number; winPct: number;
  distribution: number[]; maxBucket: number;
  currentStreak: number; maxStreak: number;
}

export function countyStatus(state: CountleState, fips: string): CountyStatus {
  if (state.solvedCounties.includes(fips)) return "solved";
  if (state.encounteredCounties.includes(fips)) return "encountered";
  return "untouched";
}

export function regionProgress(dataset: Dataset, state: CountleState): RegionProgress[] {
  const solved = new Set(state.solvedCounties);
  const totals = new Map<string, number>();
  const got = new Map<string, number>();
  for (const c of dataset.all) {
    if (!c.isAnswerPool) continue;
    totals.set(c.region, (totals.get(c.region) ?? 0) + 1);
    if (solved.has(c.fips)) got.set(c.region, (got.get(c.region) ?? 0) + 1);
  }
  return [...totals.entries()]
    .map(([region, total]) => ({ region, total, solved: got.get(region) ?? 0 }))
    .sort((a, b) => b.solved - a.solved || a.region.localeCompare(b.region));
}

export function statsSummary(state: CountleState): StatsSummary {
  const wins = state.guessDistribution.reduce((a, b) => a + b, 0);
  const played = state.gamesPlayed;
  return {
    played,
    wins,
    winPct: played > 0 ? Math.round((wins / played) * 100) : 0,
    distribution: state.guessDistribution,
    maxBucket: Math.max(1, ...state.guessDistribution),
    currentStreak: state.streak,
    maxStreak: state.maxStreak,
  };
}
