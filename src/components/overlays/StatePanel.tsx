"use client";

import { useMemo } from "react";
import CountyCard from "@/components/CountyCard";
import { US_STATES, STATE_COUNTY_COUNTS } from "@/lib/store";
import { type CountyCard as CardType } from "@/lib/supabase";

interface Props {
  stateAbbr: string;
  cards: CardType[];
  onClose: () => void;
}

export default function StatePanel({ stateAbbr, cards, onClose }: Props) {
  const stateName = US_STATES[stateAbbr] || stateAbbr;
  const total = STATE_COUNTY_COUNTS[stateAbbr] || 0;
  const pct = total > 0 ? Math.round((cards.length / total) * 100) : 0;

  const sorted = useMemo(() => {
    const rarityOrder: Record<string, number> = {
      legendary: 5,
      epic: 4,
      rare: 3,
      uncommon: 2,
      common: 1,
    };
    return [...cards].sort(
      (a, b) =>
        (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0) ||
        b.total_score - a.total_score
    );
  }, [cards]);

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md bg-[#0a0e17] border-l border-zinc-800 shadow-2xl flex flex-col animate-slide-right">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-white">{stateName}</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {cards.length} / {total} counties collected ({pct}%)
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
        >
          &#10005;
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-5 py-3 border-b border-zinc-800/50 shrink-0">
        <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              pct >= 100
                ? "bg-amber-400"
                : pct >= 50
                ? "bg-emerald-400"
                : pct > 0
                ? "bg-emerald-600"
                : "bg-zinc-700"
            }`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-5xl mb-4 opacity-30">&#x1F5FA;&#xFE0F;</div>
            <p className="text-zinc-500 text-sm">
              {total} counties waiting to be discovered in {stateName}!
            </p>
            <p className="text-zinc-600 text-xs mt-1">
              Open packs to start your collection.
            </p>
          </div>
        ) : (
          <>
            {cards.length > 0 && cards.length < total && (
              <div className="mb-3 px-3 py-2 bg-amber-900/20 rounded-lg border border-amber-800/30">
                <span className="text-amber-400 text-xs font-medium">
                  {total - cards.length} more to complete {stateName}! (+500&#x2B21; bonus)
                </span>
              </div>
            )}
            <div className="flex flex-wrap gap-3 justify-center">
              {sorted.map((card) => (
                <CountyCard
                  key={card.fips}
                  card={card}
                  flipped={true}
                  compact={true}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer stats */}
      {sorted.length > 0 && (
        <div className="px-5 py-3 border-t border-zinc-800 shrink-0">
          <div className="flex justify-between text-[10px] text-zinc-500">
            <span>
              Rarest:{" "}
              <span className="text-zinc-300">{sorted[0]?.rarity || "---"}</span>
            </span>
            <span>
              Best score:{" "}
              <span className="text-zinc-300">{sorted[0]?.total_score || 0}</span>
            </span>
            <span>
              Counties left:{" "}
              <span className="text-zinc-300">{total - cards.length}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
