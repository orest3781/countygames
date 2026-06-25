import { GUESS_LIMIT } from "./constants";

export function buildShareText(opts: {
  puzzleNumber: number;
  solved: boolean;
  guessCount: number;
  streak: number;
  rows: string[];
}): string {
  const score = opts.solved ? String(opts.guessCount) : "X";
  const header = `Countle #${opts.puzzleNumber}  ${score}/${GUESS_LIMIT}  🔥${opts.streak}`;
  return [header, ...opts.rows, "countle.app"].join("\n");
}
