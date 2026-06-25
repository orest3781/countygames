import type { CountyEntry, StatFeedback, Closeness, Direction } from "./types";
import { STAT_KEYS } from "./types";
import { MAG_THRESHOLD, CLOSE_THRESHOLD, BLUR_SCHEDULE } from "./constants";

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
