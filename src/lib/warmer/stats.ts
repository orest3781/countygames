import type { WarmerState } from "./types";
import { GUESS_BUCKETS } from "./game";

export interface WarmerStats {
  played: number;
  solvePct: number;
  currentStreak: number;
  maxStreak: number;
  best: number | null;
  distribution: { bucket: string; count: number }[];
}

export function warmerStats(state: WarmerState): WarmerStats {
  const played = state.gamesPlayed;
  return {
    played,
    solvePct: played > 0 ? Math.round((state.solves / played) * 100) : 0,
    currentStreak: state.streak,
    maxStreak: state.maxStreak,
    best: state.bestGuesses,
    distribution: GUESS_BUCKETS.map((bucket) => ({ bucket, count: state.guessDistribution[bucket] ?? 0 })),
  };
}
