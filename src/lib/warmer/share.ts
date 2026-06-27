import type { HeatTier } from "./types";

export function tierEmoji(tier: HeatTier): string {
  switch (tier) {
    case "found": return "🟩";
    case "hot": return "🔥";
    case "warm": return "🟨";
    case "tepid": return "🟦";
    case "cold": return "❄️";
  }
}

export function buildShareText(opts: {
  puzzleNumber: number;
  stateName: string;
  guessCount: number;
  solved: boolean;
  tiers: HeatTier[];
}): string {
  const emoji = opts.tiers.map((t) => tierEmoji(t)).join("");
  const status = opts.solved ? `${opts.guessCount} guess${opts.guessCount === 1 ? "" : "es"}` : `${opts.guessCount} guesses`;
  const header = `Warmer #${opts.puzzleNumber} (${opts.stateName}) ${status} ${opts.solved ? "✓" : "✗"}`;
  return [header, emoji, "warmer.app"].join("\n");
}
