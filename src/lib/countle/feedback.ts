import type { CountyEntry, StatFeedback, Closeness, Direction, GuessResult } from "./types";
import { STAT_KEYS } from "./types";
import { MAG_THRESHOLD, CLOSE_THRESHOLD, BLUR_SCHEDULE } from "./constants";
import { haversineMiles, bearingDeg, compass8 } from "./geo";

function closenessOf(absDelta: number): Closeness {
  if (absDelta <= CLOSE_THRESHOLD) return "close";
  if (absDelta <= MAG_THRESHOLD) return "near";
  return "far";
}

export function compareStats(mystery: CountyEntry, guess: CountyEntry): StatFeedback[] {
  return STAT_KEYS.map((key) => {
    const delta = mystery.stats[key] - guess.stats[key]; // + = mystery higher
    const abs = Math.abs(delta);
    const direction: Direction = delta > 0 ? "up" : delta < 0 ? "down" : "equal";
    const magnitude: 1 | 2 = abs > MAG_THRESHOLD ? 2 : 1;
    return { key, guessValue: guess.stats[key], direction, magnitude, closeness: closenessOf(abs) };
  });
}

const SQUARE: Record<Closeness, string> = { close: "🟩", near: "🟨", far: "⬛" };

export function shareRow(stats: StatFeedback[]): string {
  return stats.map((s) => SQUARE[s.closeness]).join("");
}

export function blurForGuess(guessesMade: number): number {
  const i = Math.max(0, Math.min(guessesMade, BLUR_SCHEDULE.length - 1));
  return BLUR_SCHEDULE[i];
}

export function evaluateGuess(mystery: CountyEntry, guess: CountyEntry): GuessResult {
  const isCorrect = guess.fips === mystery.fips;
  const stats = compareStats(mystery, guess);
  const distanceMiles = isCorrect ? 0 : Math.round(haversineMiles(guess, mystery));
  const bearing = isCorrect ? 0 : bearingDeg(guess, mystery);
  const compass = isCorrect ? { arrow: "🎯", label: "here" } : compass8(bearing);
  return { guess, isCorrect, stats, distanceMiles, bearingDeg: bearing, compass, shareRow: shareRow(stats) };
}
