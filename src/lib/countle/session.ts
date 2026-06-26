import type { CountleState, CountyEntry, Dataset, GuessResult } from "./types";
import { GUESS_LIMIT, NOTABLE_CLUE_GUESS } from "./constants";
import { getDailyCounty, puzzleNumber } from "./daily";
import { evaluateGuess, blurForGuess } from "./feedback";
import { buildShareText } from "./share";
import { startDay, recordGuess } from "./state";

export interface Session {
  dateKey: string;
  puzzleNumber: number;
  mystery: CountyEntry;
  guessResults: GuessResult[];
  latest: GuessResult | null;
  solved: boolean;
  finished: boolean;
  guessesUsed: number;
  guessesLeft: number;
  blur: number;
  clueAvailable: boolean;
  shareRows: string[];
  shareText: string;
  streak: number;
}

export type SubmitResult =
  | { ok: true; state: CountleState; result: GuessResult }
  | { ok: false; reason: "unknown" | "duplicate" | "finished" };

function todaysGuesses(state: CountleState, dateKey: string): string[] {
  return state.today && state.today.dateKey === dateKey ? state.today.guesses : [];
}

export function buildSession(dataset: Dataset, state: CountleState, dateKey: string): Session {
  const mystery = getDailyCounty(dataset, dateKey);
  const guesses = todaysGuesses(state, dateKey);
  const guessResults = guesses.map((fips) => evaluateGuess(mystery, dataset.byFips.get(fips)!));
  const solved = !!(state.today && state.today.dateKey === dateKey && state.today.solved);
  const finished = !!(state.today && state.today.dateKey === dateKey && state.today.finished);
  const guessesUsed = guesses.length;
  const shareRows = guessResults.map((r) => r.shareRow);
  return {
    dateKey,
    puzzleNumber: puzzleNumber(dateKey),
    mystery,
    guessResults,
    latest: guessResults.length ? guessResults[guessResults.length - 1] : null,
    solved,
    finished,
    guessesUsed,
    guessesLeft: GUESS_LIMIT - guessesUsed,
    blur: blurForGuess(guessesUsed),
    clueAvailable: !solved && guessesUsed >= NOTABLE_CLUE_GUESS - 1 && mystery.notable_person != null,
    shareRows,
    shareText: buildShareText({ puzzleNumber: puzzleNumber(dateKey), solved, guessCount: guessesUsed, streak: state.streak, rows: shareRows }),
    streak: state.streak,
  };
}

export function submitGuess(dataset: Dataset, state: CountleState, dateKey: string, fips: string): SubmitResult {
  const mystery = getDailyCounty(dataset, dateKey);
  const guess = dataset.byFips.get(fips);
  if (!guess) return { ok: false, reason: "unknown" };
  const started = startDay(state, dateKey);
  if (started.today!.finished) return { ok: false, reason: "finished" };
  if (started.today!.guesses.includes(fips)) return { ok: false, reason: "duplicate" };
  const result = evaluateGuess(mystery, guess);
  const next = recordGuess(started, fips, { isCorrect: result.isCorrect, dateKey, answerFips: mystery.fips });
  return { ok: true, state: next, result };
}
