import type { HeatTier } from "./types";

const EMOJI: Record<HeatTier, string> = { found: "🟩", hot: "🟥", warm: "🟧", tepid: "🟨", cold: "🟦" };

export function tierEmoji(tier: HeatTier): string {
  return EMOJI[tier];
}

export function buildShareText(opts: {
  puzzleNumber: number; stateName: string; guessCount: number; solved: boolean; tiers: HeatTier[];
}): string {
  const head = opts.solved
    ? `Warmer #${opts.puzzleNumber} — found it in ${opts.stateName} in ${opts.guessCount}`
    : `Warmer #${opts.puzzleNumber} — gave up (${opts.stateName})`;
  return `${head}\n${opts.tiers.map((t) => EMOJI[t]).join("")}\ncounty.games`;
}
