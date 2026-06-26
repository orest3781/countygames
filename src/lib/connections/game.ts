import type { ConnectionsPuzzle, SubmissionResult } from "./types";
import { COLOR_EMOJI } from "./types";

export function groupIndexOf(puzzle: ConnectionsPuzzle, fips: string): number {
  return puzzle.groups.findIndex((g) => g.fips.includes(fips));
}

export function evaluateSubmission(puzzle: ConnectionsPuzzle, fips4: string[]): SubmissionResult {
  const counts = [0, 0, 0, 0];
  for (const fips of fips4) {
    const gi = groupIndexOf(puzzle, fips);
    if (gi >= 0) counts[gi]++;
  }
  const best = Math.max(...counts);
  if (best === 4) {
    const groupIndex = counts.indexOf(4);
    return { kind: "correct", color: puzzle.groups[groupIndex].color, groupIndex };
  }
  if (best === 3) return { kind: "one-away" };
  return { kind: "wrong" };
}

export function shareRow(puzzle: ConnectionsPuzzle, fips4: string[]): string {
  return fips4
    .map((fips) => {
      const gi = groupIndexOf(puzzle, fips);
      return gi >= 0 ? COLOR_EMOJI[puzzle.groups[gi].color] : "⬛";
    })
    .join("");
}

export function buildShareText(opts: { puzzleNumber: number; solved: boolean; mistakes: number; rows: string[] }): string {
  const header = opts.solved ? `County Connections #${opts.puzzleNumber}` : `County Connections #${opts.puzzleNumber} — missed`;
  return [header, ...opts.rows, "county.games"].join("\n");
}
