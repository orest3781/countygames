"use client";

import { useState, useEffect, useRef } from "react";
import CountyCard from "@/components/CountyCard";
import OverlayShell from "@/components/overlays/OverlayShell";
import { type GameState } from "@/lib/store";
import {
  supabase,
  CARD_SELECT,
  parseCardRow,
  type CountyCard as CardType,
} from "@/lib/supabase";
import {
  getMatchQuestions,
  resolveRound,
  cpuPickCard,
  getDisplayValue,
  REWARDS,
  type Question,
} from "@/lib/battle";

/* ------------------------------------------------------------------ */
/*  Helper: shuffle array                                              */
/* ------------------------------------------------------------------ */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
interface Props {
  gameState: GameState;
  onFinish: (coinsWon: number, again?: boolean) => void;
  onClose: () => void;
}

export default function BattleOverlay({
  gameState,
  onFinish,
  onClose,
}: Props) {
  const [phase, setPhase] = useState<"loading" | "pick" | "resolve" | "done">(
    "loading"
  );
  const [questions, setQuestions] = useState<Question[]>([]);
  const [round, setRound] = useState(0);
  const [playerHand, setPlayerHand] = useState<CardType[]>([]);
  const [cpuHand, setCpuHand] = useState<CardType[]>([]);
  const [playerScore, setPlayerScore] = useState(0);
  const [cpuScore, setCpuScore] = useState(0);
  const [selectedCard, setSelectedCard] = useState<CardType | null>(null);
  const [roundResult, setRoundResult] = useState<{
    playerCard: CardType;
    cpuCard: CardType;
    playerWins: boolean;
    playerVal: number;
    cpuVal: number;
  } | null>(null);
  const initRef = useRef(false);

  // Init: pick cards and questions
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    async function init() {
      const qs = getMatchQuestions();
      setQuestions(qs);

      // Player hand: prefer owned cards, fallback to random from DB
      let pHand: CardType[] = [];
      if (gameState.collection.length >= 3) {
        pHand = shuffle(gameState.collection).slice(0, 3);
      } else {
        const { data } = await supabase
          .from("cards")
          .select(CARD_SELECT)
          .limit(20);
        const pool = (data || []).map(parseCardRow);
        pHand = shuffle(pool).slice(0, 3);
      }

      // CPU hand: always random from DB, deduplicated against player hand
      const pHandFips = new Set(pHand.map((c) => c.fips));
      const { data: cpuData } = await supabase
        .from("cards")
        .select(CARD_SELECT)
        .limit(30);
      const cpuPool = (cpuData || []).map(parseCardRow);
      const cHand = shuffle(
        cpuPool.filter((c) => !pHandFips.has(c.fips))
      ).slice(0, 3);

      setPlayerHand(pHand);
      setCpuHand(cHand);
      setPhase("pick");
    }
    init();
  }, [gameState.collection]);

  function handlePickCard(card: CardType) {
    if (phase !== "pick" || !questions[round]) return;
    setSelectedCard(card);

    const q = questions[round];
    const cpu = cpuPickCard(cpuHand, q);
    const result = resolveRound(q, card, cpu);

    setRoundResult({
      playerCard: card,
      cpuCard: cpu,
      playerWins: result.playerWins,
      playerVal: result.playerVal,
      cpuVal: result.cpuVal,
    });

    if (result.playerWins) setPlayerScore((s) => s + 1);
    else setCpuScore((s) => s + 1);

    // Remove used cards
    setPlayerHand((h) => h.filter((c) => c.fips !== card.fips));
    setCpuHand((h) => h.filter((c) => c.fips !== cpu.fips));

    setPhase("resolve");
  }

  function nextRound() {
    if (round >= 2) {
      setPhase("done");
    } else {
      setRound((r) => r + 1);
      setSelectedCard(null);
      setRoundResult(null);
      setPhase("pick");
    }
  }

  const won = playerScore > cpuScore;
  const coinsWon = won ? REWARDS.battleWin : REWARDS.battleLoss;

  return (
    <OverlayShell
      onClose={onClose}
      fullScreenOnMobile={true}
      maxWidth="max-w-3xl"
    >
      <button
        onClick={onClose}
        className="absolute top-2 right-2 z-20 w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
      >
        &#10005;
      </button>

      <div className="bg-[#0a0e17] rounded-2xl border border-zinc-800 p-6">
        {/* Scoreboard */}
        <div className="flex items-center justify-center gap-6 mb-4">
          <div className="text-center">
            <div className="text-xs text-zinc-500 uppercase tracking-wider">
              You
            </div>
            <div className="text-2xl font-bold text-emerald-400">
              {playerScore}
            </div>
          </div>
          <div className="text-zinc-600 font-bold">VS</div>
          <div className="text-center">
            <div className="text-xs text-zinc-500 uppercase tracking-wider">
              CPU
            </div>
            <div className="text-2xl font-bold text-red-400">{cpuScore}</div>
          </div>
        </div>

        {/* ---- LOADING ---- */}
        {phase === "loading" && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="text-3xl animate-pulse mb-3">&#x2694;&#xFE0F;</div>
            <div className="text-zinc-400 text-sm">Preparing battle...</div>
          </div>
        )}

        {/* ---- PICK PHASE ---- */}
        {phase === "pick" && questions[round] && (
          <>
            <div className="text-center mb-4">
              <div className="text-xs text-zinc-500 mb-1">
                Round {round + 1} / 3
              </div>
              <div className="text-lg font-bold text-white">
                {questions[round].icon} {questions[round].text}
              </div>
            </div>
            <p className="text-xs text-zinc-500 text-center mb-4">
              Pick your card:
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              {playerHand.map((card) => (
                <div
                  key={card.fips}
                  className="flex flex-col items-center gap-1"
                >
                  <CountyCard
                    card={card}
                    flipped={true}
                    onClick={() => handlePickCard(card)}
                    compact={true}
                  />
                  <span className="text-[10px] text-zinc-500">
                    {questions[round].icon}{" "}
                    {getDisplayValue(card, questions[round].stat)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ---- RESOLVE PHASE ---- */}
        {phase === "resolve" && roundResult && questions[round] && (
          <>
            <div className="text-center mb-4">
              <div className="text-xs text-zinc-500 mb-1">
                Round {round + 1} / 3
              </div>
              <div className="text-lg font-bold text-white">
                {questions[round].icon} {questions[round].text}
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 mb-4">
              {/* Player card */}
              <div className="flex flex-col items-center">
                <CountyCard
                  card={roundResult.playerCard}
                  flipped={true}
                  compact={true}
                />
                <div
                  className={`mt-2 text-sm font-bold ${
                    roundResult.playerWins
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  {getDisplayValue(
                    roundResult.playerCard,
                    questions[round].stat
                  )}
                </div>
              </div>

              <div className="text-2xl font-bold text-zinc-600">VS</div>

              {/* CPU card */}
              <div className="flex flex-col items-center">
                <CountyCard
                  card={roundResult.cpuCard}
                  flipped={true}
                  compact={true}
                />
                <div
                  className={`mt-2 text-sm font-bold ${
                    !roundResult.playerWins
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  {getDisplayValue(
                    roundResult.cpuCard,
                    questions[round].stat
                  )}
                </div>
              </div>
            </div>

            <div className="text-center mb-4">
              <span
                className={`text-lg font-bold ${
                  roundResult.playerWins
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}
              >
                {roundResult.playerWins
                  ? "You win this round!"
                  : "CPU wins this round!"}
              </span>
            </div>

            <div className="flex justify-center">
              <button
                onClick={nextRound}
                className="px-6 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm text-white font-medium transition-colors"
              >
                {round >= 2 ? "See Results" : "Next Round"}
              </button>
            </div>
          </>
        )}

        {/* ---- DONE PHASE ---- */}
        {phase === "done" && (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">
              {won ? <>&#x1F3C6;</> : <>&#x1F622;</>}
            </div>
            <h3 className="text-xl font-bold text-white mb-2">
              {won ? "Victory!" : "Defeat!"}
            </h3>
            <div className="flex items-center justify-center gap-1 text-lg font-bold text-amber-400 mb-6">
              +{coinsWon}&#x2B21;
            </div>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => onFinish(coinsWon)}
                className="px-5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-300 hover:text-white transition-colors"
              >
                Back to Map
              </button>
              <button
                onClick={() => onFinish(coinsWon, true)}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm text-white font-bold transition-colors"
              >
                Battle Again
              </button>
            </div>
          </div>
        )}
      </div>
    </OverlayShell>
  );
}
