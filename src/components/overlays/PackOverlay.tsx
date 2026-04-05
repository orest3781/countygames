"use client";

import { useState, useMemo } from "react";
import CountyCard from "@/components/CountyCard";
import OverlayShell from "@/components/overlays/OverlayShell";
import {
  canOpenDailyPack,
  getNextPackTime,
  getTodayString,
  type GameState,
} from "@/lib/store";
import {
  openPack,
  PACK_TYPES,
  supabase,
  CARD_SELECT,
  parseCardRow,
  type CountyCard as CardType,
  type PackType,
} from "@/lib/supabase";
import { hashString } from "@/lib/battle";

/* ------------------------------------------------------------------ */
/*  Helpers (same logic that was in page.tsx)                          */
/* ------------------------------------------------------------------ */
function getYesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function fetchCardByFips(fips: string): Promise<CardType | null> {
  const { data } = await supabase
    .from("cards")
    .select(CARD_SELECT)
    .eq("fips", fips)
    .limit(1);
  if (data && data.length > 0) return parseCardRow(data[0]);
  return null;
}

async function getDailyCountyFips(): Promise<string | null> {
  const hash = hashString(getTodayString());
  const { count } = await supabase
    .from("cards")
    .select("fips", { count: "exact", head: true });
  if (!count || count === 0) return null;
  const idx = hash % count;
  const { data } = await supabase
    .from("cards")
    .select("fips")
    .range(idx, idx)
    .limit(1);
  if (data && data.length > 0) return data[0].fips.trim();
  return null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
interface Props {
  gameState: GameState;
  onCollect: (
    cards: CardType[],
    bonusCards: CardType[],
    newStreak: number,
    hasEpicPlus: boolean
  ) => void;
  onClose: () => void;
}

export default function PackOverlay({ gameState, onCollect, onClose }: Props) {
  const [phase, setPhase] = useState<
    "select" | "opening" | "reveal" | "summary"
  >("select");
  const [cards, setCards] = useState<CardType[]>([]);
  const [flipped, setFlipped] = useState<boolean[]>([]);
  const [dailyIdx, setDailyIdx] = useState<number>(-1);
  const [loading, setLoading] = useState(false);
  const [selectedPack, setSelectedPack] = useState<PackType | null>(null);
  const [streakBonusCards, setStreakBonusCards] = useState<CardType[] | null>(
    null
  );
  const [streakMsg, setStreakMsg] = useState<string | null>(null);
  const [packHasEpicPlus, setPackHasEpicPlus] = useState(false);
  const [computedStreak, setComputedStreak] = useState(0);

  const isDailyAvailable = canOpenDailyPack(gameState);

  const summaryStats = useMemo(() => {
    if (cards.length === 0)
      return { newCount: 0, dupeCount: 0, dupeCoins: 0 };
    const ownedFips = new Set(gameState.collection.map((c) => c.fips));
    let newCount = 0;
    let dupeCount = 0;
    for (const c of cards) {
      if (ownedFips.has(c.fips)) dupeCount++;
      else newCount++;
    }
    return { newCount, dupeCount, dupeCoins: dupeCount * 25 };
  }, [cards, gameState.collection]);

  async function handleOpenPack(pack: PackType) {
    setSelectedPack(pack);
    setLoading(true);
    setPhase("opening");
    try {
      const { cards: pulledCards, hasEpicPlus } = await openPack(
        pack,
        gameState.pityCounter
      );
      let result = pulledCards;
      setPackHasEpicPlus(hasEpicPlus);

      // Inject County of the Day: replace one random common card (daily pack only)
      let dailyCardIdx = -1;
      if (pack.id === "daily") {
        const dailyFips = await getDailyCountyFips();
        if (dailyFips) {
          const dailyCard = await fetchCardByFips(dailyFips);
          if (dailyCard) {
            const commonIdx = result.findIndex((c) => c.rarity === "common");
            const replaceIdx = commonIdx >= 0 ? commonIdx : 0;
            result = [...result];
            result[replaceIdx] = dailyCard;
            dailyCardIdx = replaceIdx;
          }
        }
      }

      setCards(result);
      setFlipped(new Array(result.length).fill(false));
      setDailyIdx(dailyCardIdx);

      // Calculate streak for daily packs
      let newStreak = gameState.streak;
      if (pack.id === "daily") {
        const yesterday = getYesterdayString();
        if (gameState.lastPackDate === yesterday) {
          newStreak = gameState.streak + 1;
        } else if (gameState.lastPackDate === getTodayString()) {
          newStreak = gameState.streak; // already opened today
        } else {
          newStreak = 1;
        }
        if (newStreak >= 7 && newStreak % 7 === 0) {
          setStreakMsg("7-Day Streak Bonus!");
          const bonusPack =
            PACK_TYPES.find((p) => p.id === "legendary") ||
            PACK_TYPES[PACK_TYPES.length - 1];
          const { cards: bonusCards } = await openPack(
            { ...bonusPack, cardCount: 7, cost: 0 },
            0
          );
          setStreakBonusCards(bonusCards);
        }
      }
      setComputedStreak(newStreak);

      setPhase("reveal");
    } catch (err) {
      console.error("Pack open error:", err);
      setPhase("select");
    } finally {
      setLoading(false);
    }
  }

  function flipCard(idx: number) {
    setFlipped((prev) => {
      const next = [...prev];
      next[idx] = true;
      return next;
    });
  }

  function flipAll() {
    setFlipped(cards.map(() => true));
  }

  const allFlipped = flipped.length > 0 && flipped.every(Boolean);

  function handleCollect() {
    onCollect(cards, streakBonusCards || [], computedStreak, packHasEpicPlus);
  }

  const paidPacks = PACK_TYPES.filter((p) => p.id !== "daily");

  return (
    <OverlayShell
      onClose={onClose}
      fullScreenOnMobile={true}
      maxWidth="max-w-3xl"
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-2 right-2 z-20 w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
      >
        &#10005;
      </button>

      {/* ---- SELECT PHASE ---- */}
      {phase === "select" && (
        <div className="bg-[#0a0e17] rounded-2xl border border-zinc-800 p-6">
          <h2 className="text-xl font-bold text-white text-center mb-6">
            Open a Pack
          </h2>

          {/* Daily Pack */}
          <div className="mb-6">
            <button
              onClick={() => isDailyAvailable && handleOpenPack(PACK_TYPES[0])}
              disabled={!isDailyAvailable}
              className={`w-full rounded-xl border-2 p-4 flex items-center gap-4 transition-all ${
                isDailyAvailable
                  ? "border-emerald-500 bg-emerald-950/30 hover:bg-emerald-950/50 shadow-[0_0_20px_rgba(16,185,129,0.15)] cursor-pointer"
                  : "border-zinc-700 bg-zinc-900/50 opacity-60 cursor-not-allowed"
              }`}
            >
              <span className="text-3xl">&#x1F4E6;</span>
              <div className="flex-1 text-left">
                <div className="font-bold text-white">Daily Pack (5 cards)</div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  {isDailyAvailable ? (
                    <span className="text-emerald-400 font-medium">
                      FREE - Available now!
                    </span>
                  ) : (
                    <span>Next in {getNextPackTime(gameState)}</span>
                  )}
                </div>
              </div>
              {isDailyAvailable && (
                <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>
          </div>

          {/* Paid Packs */}
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
            Premium Packs
          </div>
          <div className="grid gap-3">
            {paidPacks.map((pack) => {
              const canAfford = gameState.coins >= pack.cost;
              return (
                <button
                  key={pack.id}
                  onClick={() => canAfford && handleOpenPack(pack)}
                  disabled={!canAfford}
                  className={`rounded-xl border p-3 flex items-center gap-3 transition-all ${
                    canAfford
                      ? "border-zinc-700 bg-zinc-900/50 hover:bg-zinc-800/80 hover:border-zinc-600 cursor-pointer"
                      : "border-zinc-800 bg-zinc-900/30 opacity-40 cursor-not-allowed"
                  }`}
                >
                  <span className="text-2xl">&#x1F4E6;</span>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-white text-sm">
                      {pack.name}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {pack.description}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 bg-zinc-800 px-2.5 py-1 rounded-full">
                    <span className="text-amber-400 text-xs">&#x2B21;</span>
                    <span className="text-xs font-bold text-white">
                      {pack.cost}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- OPENING PHASE ---- */}
      {phase === "opening" && (
        <div className="bg-[#0a0e17] rounded-2xl border border-zinc-800 p-8 flex flex-col items-center justify-center min-h-[300px]">
          <div className="text-4xl animate-bounce mb-4">&#x1F4E6;</div>
          <div className="text-zinc-400 animate-pulse">Opening pack...</div>
        </div>
      )}

      {/* ---- REVEAL PHASE ---- */}
      {phase === "reveal" && (
        <div className="bg-[#0a0e17] rounded-2xl border border-zinc-800 p-6">
          <h2 className="text-lg font-bold text-white text-center mb-1">
            {selectedPack?.name || "Pack"}
          </h2>
          <p className="text-xs text-zinc-500 text-center mb-4">
            Tap each card to reveal it
          </p>

          {/* Cards */}
          <div className="flex flex-wrap gap-3 justify-center mb-4">
            {cards.map((card, i) => (
              <CountyCard
                key={card.fips + "-" + i}
                card={card}
                flipped={flipped[i]}
                onClick={() => flipCard(i)}
                isDaily={i === dailyIdx}
                compact={true}
              />
            ))}
          </div>

          {/* Daily indicator */}
          {dailyIdx >= 0 && (
            <p className="text-center text-xs text-cyan-400 mb-3">
              &#x2B50; County of the Day included!
            </p>
          )}

          {/* Flip All / Continue */}
          <div className="flex justify-center gap-3">
            {!allFlipped && (
              <button
                onClick={flipAll}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-300 hover:text-white transition-colors"
              >
                Flip All
              </button>
            )}
            {allFlipped && (
              <button
                onClick={() => setPhase("summary")}
                className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white transition-colors"
              >
                Continue
              </button>
            )}
          </div>
        </div>
      )}

      {/* ---- SUMMARY PHASE ---- */}
      {phase === "summary" && (
        <div className="bg-[#0a0e17] rounded-2xl border border-zinc-800 p-6 text-center">
          <h2 className="text-xl font-bold text-white mb-4">Pack Summary</h2>

          {streakMsg && (
            <div className="mb-4 px-4 py-2 rounded-lg bg-amber-900/30 border border-amber-700 text-amber-300 text-sm font-bold animate-pulse">
              &#x1F389; {streakMsg}
            </div>
          )}

          <div className="flex justify-center gap-6 mb-4">
            <div>
              <div className="text-2xl font-bold text-emerald-400">
                {summaryStats.newCount}
              </div>
              <div className="text-xs text-zinc-500">New</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-zinc-400">
                {summaryStats.dupeCount}
              </div>
              <div className="text-xs text-zinc-500">Dupes</div>
            </div>
            {summaryStats.dupeCoins > 0 && (
              <div>
                <div className="text-2xl font-bold text-amber-400">
                  +{summaryStats.dupeCoins}&#x2B21;
                </div>
                <div className="text-xs text-zinc-500">Dupe bonus</div>
              </div>
            )}
          </div>

          {/* Cards mini review */}
          <div className="flex flex-wrap gap-2 justify-center mb-6">
            {cards.map((card, i) => (
              <CountyCard
                key={card.fips + "-s-" + i}
                card={card}
                flipped={true}
                isDaily={i === dailyIdx}
                compact={true}
              />
            ))}
          </div>

          {streakBonusCards && streakBonusCards.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-bold text-amber-400 mb-2">
                Streak Bonus Cards!
              </h3>
              <div className="flex flex-wrap gap-2 justify-center">
                {streakBonusCards.map((card, i) => (
                  <CountyCard
                    key={card.fips + "-b-" + i}
                    card={card}
                    flipped={true}
                    compact={true}
                  />
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleCollect}
            className="px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors"
          >
            Collect
          </button>
        </div>
      )}
    </OverlayShell>
  );
}
