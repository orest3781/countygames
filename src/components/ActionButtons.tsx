"use client";

import { REWARDS } from "@/lib/battle";

interface Props {
  canOpenDaily: boolean;
  cooldownDisplay: string | null;
  onOpenPack: () => void;
  onBattle: () => void;
  onQuiz: () => void;
}

export default function ActionButtons({
  canOpenDaily,
  cooldownDisplay,
  onOpenPack,
  onBattle,
  onQuiz,
}: Props) {
  return (
    <>
      {/* Mobile: fixed bottom bar */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-20 bg-[#0a0e17]/95 backdrop-blur-sm border-t border-zinc-800 px-3 py-3 flex items-center gap-2">
        {/* Daily Pack — primary, takes ~65% */}
        <button
          onClick={onOpenPack}
          className={`flex-[2] flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-bold text-sm transition-all ${
            canOpenDaily
              ? "bg-emerald-600 hover:bg-emerald-500 text-white ring-2 ring-emerald-400/30 animate-pulse-subtle"
              : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
          }`}
        >
          <span className="text-lg">&#x1F4E6;</span>
          <span>
            {canOpenDaily
              ? "Open Daily Pack"
              : cooldownDisplay
              ? cooldownDisplay
              : "Packs"}
          </span>
        </button>

        {/* Quick Battle */}
        <button
          onClick={onBattle}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 text-zinc-200 font-bold text-sm transition-all"
        >
          <span className="text-lg">&#x2694;&#xFE0F;</span>
          <span>{REWARDS.battleWin}&#x2B21;</span>
        </button>

        {/* Quiz */}
        <button
          onClick={onQuiz}
          className="w-12 h-12 shrink-0 flex items-center justify-center rounded-2xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-cyan-600 text-lg transition-all"
        >
          &#x2753;
        </button>
      </div>

      {/* Desktop: floating centered pills below map */}
      <div className="hidden sm:flex fixed bottom-6 left-1/2 -translate-x-1/2 z-20 items-center gap-3">
        {/* Open Daily Pack */}
        <button
          onClick={onOpenPack}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm transition-all shadow-lg ${
            canOpenDaily
              ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40 ring-2 ring-emerald-400/30 animate-pulse-subtle"
              : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
          }`}
        >
          <span className="text-lg">&#x1F4E6;</span>
          <span>
            {canOpenDaily
              ? "Open Daily Pack"
              : cooldownDisplay
              ? cooldownDisplay
              : "Packs"}
          </span>
        </button>

        {/* Quick Battle */}
        <button
          onClick={onBattle}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 text-zinc-200 font-bold text-sm transition-all shadow-lg"
        >
          <span className="text-lg">&#x2694;&#xFE0F;</span>
          <span>Quick Battle {REWARDS.battleWin}&#x2B21;</span>
        </button>

        {/* Quiz */}
        <button
          onClick={onQuiz}
          className="w-12 h-12 rounded-full bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 hover:border-cyan-600 flex items-center justify-center text-lg transition-all hover:scale-110 shadow-lg"
          title="Daily Quiz"
        >
          &#x2753;
        </button>
      </div>
    </>
  );
}
