import type { CountyEntry } from "../countle/types";
import { haversineMiles, bearingDeg, compass8 } from "../countle/geo";
import type { GuessFeedback, HeatTier } from "./types";

export function heatTier(miles: number): HeatTier {
  if (miles === 0) return "found";
  if (miles < 75) return "hot";
  if (miles < 250) return "warm";
  if (miles < 700) return "tepid";
  return "cold";
}

export function isSolved(target: CountyEntry, guessFips: string): boolean {
  return target.fips === guessFips;
}

export function evaluateGuess(target: CountyEntry, guess: CountyEntry): GuessFeedback {
  const same = guess.fips === target.fips;
  const rawMiles = same ? 0 : haversineMiles(guess, target);
  const deg = same ? 0 : bearingDeg(guess, target); // from the guess toward the target
  const { arrow, label } = compass8(deg);
  return { fips: guess.fips, miles: Math.round(rawMiles), bearingDeg: deg, arrow, label, tier: heatTier(rawMiles) };
}

export const GUESS_BUCKETS = ["1-3", "4-6", "7-9", "10+"];
export function guessBucket(n: number): string {
  if (n <= 3) return "1-3";
  if (n <= 6) return "4-6";
  if (n <= 9) return "7-9";
  return "10+";
}
