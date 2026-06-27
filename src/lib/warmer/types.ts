export type HeatTier = "found" | "hot" | "warm" | "tepid" | "cold";

export interface GuessFeedback {
  fips: string;
  miles: number;
  bearingDeg: number;
  arrow: string;
  label: string;
  tier: HeatTier;
}

export interface WarmerState {
  schemaVersion: 1;
  lastPlayedDateKey: string | null;
  today: { dateKey: string; guesses: string[]; solved: boolean; gaveUp: boolean } | null; // guesses = fips, in order
  streak: number;
  maxStreak: number;
  gamesPlayed: number;
  solves: number;
  bestGuesses: number | null;                 // fewest guesses to a solve, all-time
  guessDistribution: Record<string, number>;  // bucket label -> count
}
