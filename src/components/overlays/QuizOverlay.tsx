"use client";

import { useState, useEffect, useRef } from "react";
import CountyCard from "@/components/CountyCard";
import OverlayShell from "@/components/overlays/OverlayShell";
import { getTodayString, US_STATES, type GameState } from "@/lib/store";
import {
  supabase,
  CARD_SELECT,
  parseCardRow,
  type CountyCard as CardType,
} from "@/lib/supabase";
import { hashString, REWARDS } from "@/lib/battle";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
type QuizType = "state" | "population" | "size";

interface Props {
  gameState: GameState;
  onFinish: (correct: boolean, coins: number, card: CardType | null) => void;
  onClose: () => void;
}

export default function QuizOverlay({ gameState, onFinish, onClose }: Props) {
  const [phase, setPhase] = useState<"loading" | "question" | "result">(
    "loading"
  );
  const [dailyCard, setDailyCard] = useState<CardType | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [quizType, setQuizType] = useState<QuizType>("state");
  const [questionText, setQuestionText] = useState("");
  const [comparisonCard, setComparisonCard] = useState<CardType | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    async function init() {
      // Check if already done today
      if (gameState.lastQuizDate === getTodayString()) {
        setAlreadyDone(true);
        const fips = await getDailyCountyFips();
        if (fips) {
          const card = await fetchCardByFips(fips);
          setDailyCard(card);
        }
        setPhase("result");
        return;
      }

      // Fetch daily card
      const fips = await getDailyCountyFips();
      if (!fips) {
        setPhase("result");
        return;
      }
      const card = await fetchCardByFips(fips);
      if (!card) {
        setPhase("result");
        return;
      }
      setDailyCard(card);

      // Pick a random question type
      const roll = Math.random();
      const countyShort = card.name
        .replace(/ County$/i, "")
        .replace(/ Parish$/i, "");

      if (roll < 0.34) {
        // Type 1: "What state is this county in?"
        setQuizType("state");
        const correctState = card.state_abbr;
        setCorrectAnswer(correctState);
        setQuestionText(`What state is ${countyShort} in?`);
        const allStates = Object.keys(US_STATES).filter(
          (s) => s !== correctState
        );
        const wrong = shuffle(allStates).slice(0, 3);
        setOptions(shuffle([correctState, ...wrong]));
      } else if (roll < 0.67) {
        // Type 2: "Is this county's population above or below [threshold]?"
        setQuizType("population");
        const pop = card.stat_population;
        const thresholds = [25, 50, 75, 100, 150, 200, 300, 500];
        const threshold = thresholds.reduce((prev, curr) =>
          Math.abs(curr - pop) < Math.abs(prev - pop) ? curr : prev
        );
        const adjustedThreshold = pop >= threshold ? threshold : threshold;
        const answer = pop >= adjustedThreshold ? "Above" : "Below";
        setCorrectAnswer(answer);
        setQuestionText(
          `Is ${countyShort}'s population score above or below ${adjustedThreshold}?`
        );
        setOptions(["Above", "Below"]);
      } else {
        // Type 3: "Which county is bigger?" — compare stat_terrain
        setQuizType("size");
        const { data: randData } = await supabase
          .from("cards")
          .select(CARD_SELECT)
          .neq("fips", card.fips)
          .limit(20);
        const pool = (randData || []).map(parseCardRow);
        const other = pool.length > 0 ? shuffle(pool)[0] : null;
        if (other) {
          setComparisonCard(other);
          const otherShort = other.name
            .replace(/ County$/i, "")
            .replace(/ Parish$/i, "");
          const answer =
            card.stat_terrain >= other.stat_terrain ? countyShort : otherShort;
          setCorrectAnswer(answer);
          setQuestionText("Which county is bigger by area?");
          setOptions(shuffle([countyShort, otherShort]));
        } else {
          // Fallback to state question
          setQuizType("state");
          const correctState = card.state_abbr;
          setCorrectAnswer(correctState);
          setQuestionText(`What state is ${countyShort} in?`);
          const allStates = Object.keys(US_STATES).filter(
            (s) => s !== correctState
          );
          const wrong = shuffle(allStates).slice(0, 3);
          setOptions(shuffle([correctState, ...wrong]));
        }
      }

      setPhase("question");
    }
    init();
  }, [gameState.lastQuizDate]);

  function handlePick(answer: string) {
    if (picked) return;
    setPicked(answer);
    const correct = answer === correctAnswer;
    const coins = correct ? REWARDS.quizCorrect : 0;
    setTimeout(() => {
      setPhase("result");
      onFinish(correct, coins, dailyCard);
    }, 800);
  }

  const wasCorrect = alreadyDone
    ? gameState.lastQuizResult === true
    : picked === correctAnswer;

  return (
    <OverlayShell onClose={onClose} maxWidth="max-w-md">
      <button
        onClick={onClose}
        className="absolute -top-2 -right-2 z-20 w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
      >
        &#10005;
      </button>

      <div className="bg-[#0a0e17] rounded-2xl border border-zinc-800 p-6">
        <h2 className="text-center text-sm font-bold text-cyan-400 uppercase tracking-wider mb-4">
          &#x2753; Daily Quiz
        </h2>

        {/* ---- LOADING ---- */}
        {phase === "loading" && (
          <div className="flex flex-col items-center py-8">
            <div className="text-2xl animate-pulse mb-2">&#x2753;</div>
            <div className="text-zinc-500 text-xs">Loading...</div>
          </div>
        )}

        {/* ---- QUESTION ---- */}
        {phase === "question" && dailyCard && (
          <>
            {/* For "state" question: don't show card (state is visible on it) */}
            {quizType === "state" && (
              <div className="flex justify-center mb-4">
                <div className="px-4 py-3 bg-zinc-900 rounded-xl border border-zinc-700 text-center">
                  <div className="text-xs text-zinc-500 mb-1">
                    County of the Day
                  </div>
                  <div className="text-lg font-bold text-white">
                    {dailyCard.name
                      .replace(/ County$/i, "")
                      .replace(/ Parish$/i, "")}
                  </div>
                </div>
              </div>
            )}

            {/* For population/size questions: show card face-down */}
            {(quizType === "population" || quizType === "size") && (
              <div className="flex justify-center mb-4">
                <CountyCard
                  card={dailyCard}
                  flipped={false}
                  compact={true}
                  isDaily={true}
                />
              </div>
            )}

            <p className="text-center text-white font-medium text-sm mb-4">
              {questionText}
            </p>

            <div
              className={`grid gap-2 ${
                options.length === 2 ? "grid-cols-2" : "grid-cols-2"
              }`}
            >
              {options.map((opt) => {
                const isCorrect = opt === correctAnswer;
                const isPicked = opt === picked;
                let btnClass =
                  "border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-600 text-zinc-300";
                if (picked) {
                  if (isCorrect)
                    btnClass =
                      "border-emerald-500 bg-emerald-950/50 text-emerald-300";
                  else if (isPicked)
                    btnClass =
                      "border-red-500 bg-red-950/50 text-red-300";
                  else
                    btnClass =
                      "border-zinc-800 bg-zinc-900/50 text-zinc-600";
                }
                return (
                  <button
                    key={opt}
                    onClick={() => handlePick(opt)}
                    disabled={!!picked}
                    className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${btnClass}`}
                  >
                    {quizType === "state" ? US_STATES[opt] || opt : opt}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ---- RESULT ---- */}
        {phase === "result" && (
          <div className="text-center">
            {dailyCard && (
              <div className="flex justify-center mb-4">
                <CountyCard
                  card={dailyCard}
                  flipped={true}
                  compact={true}
                  isDaily={true}
                />
              </div>
            )}

            {alreadyDone ? (
              <>
                <p className="text-zinc-400 text-sm mb-2">
                  {wasCorrect
                    ? "You already aced today's quiz!"
                    : "You already took today's quiz."}
                </p>
                {dailyCard && (
                  <p className="text-xs text-zinc-500">
                    {dailyCard.name}, {US_STATES[dailyCard.state_abbr]}
                  </p>
                )}
              </>
            ) : (
              <>
                {wasCorrect ? (
                  <>
                    <div className="text-3xl mb-2">&#x2705;</div>
                    <p className="text-emerald-400 font-bold mb-1">Correct!</p>
                    <p className="text-amber-400 font-bold text-lg mb-2">
                      +{REWARDS.quizCorrect}&#x2B21;
                    </p>
                  </>
                ) : (
                  <>
                    <div className="text-3xl mb-2">&#x274C;</div>
                    <p className="text-red-400 font-bold mb-1">Wrong!</p>
                    {dailyCard && (
                      <p className="text-zinc-400 text-sm mb-2">
                        Answer:{" "}
                        {quizType === "state"
                          ? US_STATES[correctAnswer]
                          : correctAnswer}
                      </p>
                    )}
                  </>
                )}
                {dailyCard && (
                  <p className="text-xs text-zinc-500 mb-3">
                    County Wars Daily:{" "}
                    {wasCorrect ? "\u2705" : "\u274C"} {dailyCard.name},{" "}
                    {US_STATES[dailyCard.state_abbr]}
                  </p>
                )}
              </>
            )}

            <div className="flex justify-center gap-3 mt-4">
              <button
                onClick={onClose}
                className="px-5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-300 hover:text-white transition-colors"
              >
                Back to Map
              </button>
              {!alreadyDone && dailyCard && (
                <button
                  onClick={() => {
                    const text = `County Wars Daily: ${
                      wasCorrect ? "\u2705" : "\u274C"
                    } ${dailyCard.name}, ${dailyCard.state_abbr}`;
                    navigator.clipboard?.writeText(text);
                  }}
                  className="px-4 py-2 bg-zinc-800 rounded-lg text-xs text-zinc-300 hover:bg-zinc-700"
                >
                  Share Result
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </OverlayShell>
  );
}
