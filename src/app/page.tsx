"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import USMap from "@/components/USMap";
import ActionButtons from "@/components/ActionButtons";
import StatePanel from "@/components/overlays/StatePanel";
import PackOverlay from "@/components/overlays/PackOverlay";
import BattleOverlay from "@/components/overlays/BattleOverlay";
import QuizOverlay from "@/components/overlays/QuizOverlay";
import {
  loadState,
  saveState,
  addCards,
  canOpenDailyPack,
  getNextPackTime,
  getTodayString,
  STATE_COUNTY_COUNTS,
  type GameState,
} from "@/lib/store";
import { type CountyCard as CardType } from "@/lib/supabase";

const TOTAL_COUNTIES = Object.values(STATE_COUNTY_COUNTS).reduce((s, n) => s + n, 0);
type Mode = "map" | "pack" | "battle" | "quiz";

function getCollectionByState(state: GameState): Record<string, CardType[]> {
  const byState: Record<string, CardType[]> = {};
  for (const card of state.collection) {
    const arr = byState[card.state_abbr] || [];
    arr.push(card);
    byState[card.state_abbr] = arr;
  }
  return byState;
}

export default function Home() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("map");
  const [cooldownDisplay, setCooldownDisplay] = useState<string | null>(null);
  const [battleAgainFlag, setBattleAgainFlag] = useState(0);
  const [discoveryMsg, setDiscoveryMsg] = useState<string | null>(null);

  useEffect(() => { setGameState(loadState()); }, []);

  useEffect(() => {
    if (!gameState) return;
    function tick() {
      if (!gameState) return;
      setCooldownDisplay(
        canOpenDailyPack(gameState) ? null : getNextPackTime(gameState)
      );
    }
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [gameState]);

  const updateState = useCallback(
    (updater: (prev: GameState) => GameState) => {
      setGameState((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        saveState(next);
        return next;
      });
    },
    []
  );

  const handleStateClick = useCallback((abbr: string) => {
    setSelectedState(abbr);
  }, []);

  const collectionByState = useMemo(
    () => (gameState ? getCollectionByState(gameState) : {}),
    [gameState]
  );

  const totalOwned = gameState?.collection.length || 0;

  const statesStarted = useMemo(
    () => Object.keys(collectionByState).length,
    [collectionByState]
  );

  const statesCompleted = useMemo(() => {
    let count = 0;
    for (const [abbr, cards] of Object.entries(collectionByState)) {
      const total = STATE_COUNTY_COUNTS[abbr] || 0;
      if (total > 0 && cards.length >= total) count++;
    }
    return count;
  }, [collectionByState]);

  function handlePackCollect(
    cards: CardType[],
    bonusCards: CardType[],
    newStreak: number,
    hasEpicPlus: boolean
  ) {
    const allNewCards = [...cards, ...bonusCards];

    updateState((prev) => {
      let next = addCards(prev, allNewCards);
      next = {
        ...next,
        streak: newStreak,
        lastPackDate: getTodayString(),
        pityCounter: hasEpicPlus ? 0 : next.pityCounter + 1,
        totalPacksOpened: next.totalPacksOpened + 1,
      };
      return next;
    });

    const states = [...new Set(allNewCards.map((c) => c.state_abbr))];
    if (states.length > 0) {
      setDiscoveryMsg(`\u2728 New counties discovered in ${states.join(", ")}!`);
      setTimeout(() => setDiscoveryMsg(null), 3000);
    }
    setMode("map");
  }

  function handleBattleFinish(coinsWon: number, again = false) {
    updateState((prev) => ({ ...prev, coins: prev.coins + coinsWon }));
    if (again) {
      setBattleAgainFlag((f) => f + 1);
    } else {
      setMode("map");
    }
  }

  function handleQuizFinish(
    correct: boolean,
    coins: number,
    _card: CardType | null
  ) {
    updateState((prev) => ({
      ...prev,
      coins: prev.coins + coins,
      lastQuizDate: getTodayString(),
      lastQuizResult: correct,
    }));
  }

  if (!gameState) {
    return (
      <main className="min-h-screen bg-[#0a0e17] text-white flex items-center justify-center">
        <div className="text-zinc-500 animate-pulse">
          Loading your America...
        </div>
      </main>
    );
  }

  const isDailyAvailable = canOpenDailyPack(gameState);

  return (
    <main className="min-h-screen bg-[#0a0e17] text-white flex flex-col">
      {/* Header */}
      <header className="shrink-0 border-b border-zinc-800 bg-[#0a0e17]/90 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* Title & stats */}
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent font-display">
              County Wars
            </h1>
            <div className="hidden sm:flex items-center gap-3 text-xs text-zinc-400">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                {totalOwned.toLocaleString()} /{" "}
                {TOTAL_COUNTIES.toLocaleString()} counties
              </span>
              <span className="text-zinc-700">|</span>
              <span>{statesStarted}/51 states started</span>
              {statesCompleted > 0 && (
                <>
                  <span className="text-zinc-700">|</span>
                  <span className="text-amber-400">
                    &#x2605; {statesCompleted} completed
                  </span>
                </>
              )}
              {gameState.streak > 0 && (
                <>
                  <span className="text-zinc-700">|</span>
                  <span className="text-orange-400">
                    &#x1F525; {gameState.streak} day streak
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Right side: coins */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-zinc-800/80 px-3 py-1.5 rounded-full border border-zinc-700 font-display">
              <span className="text-amber-400 text-sm">&#x2B21;</span>
              <span className="text-sm font-bold tabular-nums">
                {gameState.coins.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Discovery notification after pack collect */}
      {discoveryMsg && (
        <div className="text-center py-2 bg-emerald-900/30 border-b border-emerald-700/30 animate-pulse">
          <span className="text-emerald-400 text-sm font-medium">
            {discoveryMsg}
          </span>
        </div>
      )}

      {/* Map */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 overflow-x-auto relative">
        {/* Map title */}
        <div className="text-center mb-5">
          <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-widest">
            Your America
          </h2>
          {/* Stats subtitle */}
          {totalOwned === 0 && (
            <p className="text-xs text-zinc-600 mt-1">
              Open packs to start collecting counties and fill your map!
            </p>
          )}
        </div>

        {/* The Map */}
        <USMap
          collection={gameState.collection}
          onStateClick={handleStateClick}
        />

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-4 mt-6 text-[10px] text-zinc-500">
          {([
            ["bg-zinc-800 border-zinc-700", "0%"],
            ["bg-emerald-950 border-emerald-800", "1-10%"],
            ["bg-emerald-800 border-emerald-700", "25-50%"],
            ["bg-emerald-600 border-emerald-500", "75-99%"],
            ["bg-emerald-500 border-amber-400", "100%"],
          ] as const).map(([cls, label]) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded border ${cls}`} />
              <span>{label}</span>
            </div>
          ))}
        </div>

        {/* Mobile stats */}
        <div className="sm:hidden flex items-center justify-center gap-3 text-xs text-zinc-400 mt-4">
          <span>
            {totalOwned.toLocaleString()} / {TOTAL_COUNTIES.toLocaleString()}
          </span>
          <span className="text-zinc-700">|</span>
          <span>{statesStarted}/51 states</span>
          {gameState.streak > 0 && (
            <>
              <span className="text-zinc-700">|</span>
              <span className="text-orange-400">
                &#x1F525;{gameState.streak}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      {mode === "map" && (
        <ActionButtons
          canOpenDaily={isDailyAvailable}
          cooldownDisplay={cooldownDisplay}
          onOpenPack={() => setMode("pack")}
          onBattle={() => {
            setBattleAgainFlag((f) => f + 1);
            setMode("battle");
          }}
          onQuiz={() => setMode("quiz")}
        />
      )}

      {/* Overlays */}
      {selectedState && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/40"
            onClick={() => setSelectedState(null)}
          />
          <StatePanel
            stateAbbr={selectedState}
            cards={collectionByState[selectedState] || []}
            onClose={() => setSelectedState(null)}
          />
        </>
      )}

      {mode === "pack" && (
        <PackOverlay
          gameState={gameState}
          onCollect={handlePackCollect}
          onClose={() => setMode("map")}
        />
      )}

      {mode === "battle" && (
        <BattleOverlay
          key={battleAgainFlag}
          gameState={gameState}
          onFinish={handleBattleFinish}
          onClose={() => setMode("map")}
        />
      )}

      {mode === "quiz" && (
        <QuizOverlay
          gameState={gameState}
          onFinish={handleQuizFinish}
          onClose={() => setMode("map")}
        />
      )}

    </main>
  );
}
