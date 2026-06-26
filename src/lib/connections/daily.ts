import type { ConnectionsPayload, ConnectionsPuzzle } from "./types";
import { hashString } from "../countle/daily";

export function getDailyPuzzle(payload: ConnectionsPayload, dateKey: string): ConnectionsPuzzle {
  if (payload.puzzles.length === 0) throw new Error("empty connections pool");
  return payload.puzzles[hashString(dateKey) % payload.puzzles.length];
}

export function puzzleCards(puzzle: ConnectionsPuzzle): string[] {
  return puzzle.groups.flatMap((g) => g.fips);
}

/** Deterministic shuffle of the 16 cards seeded by the date (so the grid isn't pre-grouped). */
export function dailyCardOrder(puzzle: ConnectionsPuzzle, dateKey: string): string[] {
  const cards = puzzleCards(puzzle);
  // Decorate-sort-undecorate by a per-card hash; stable + deterministic.
  return cards
    .map((fips) => ({ fips, key: hashString(`${dateKey}:${fips}`) }))
    .sort((a, b) => a.key - b.key || a.fips.localeCompare(b.fips))
    .map((x) => x.fips);
}
