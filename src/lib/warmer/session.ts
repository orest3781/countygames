import type { CountyEntry, Dataset } from "../countle/types";
import type { GuessFeedback, WarmerState } from "./types";
import { getDailyTarget } from "./daily";
import { evaluateGuess } from "./game";
import { startDay, recordGuess } from "./state";
import { tierEmoji, buildShareText } from "./share";
import { puzzleNumber } from "../countle/daily";

export interface WarmerSession {
  dateKey: string;
  puzzleNumber: number;
  guesses: GuessFeedback[];   // closest-first
  guessCount: number;
  closest: GuessFeedback | null;
  solved: boolean;
  gaveUp: boolean;
  finished: boolean;
  target: CountyEntry | null; // revealed only when finished
  streak: number;
  shareRows: string[];        // tier emoji per guess, in play order
  shareText: string;
}

export function buildWarmerSession(dataset: Dataset, state: WarmerState, dateKey: string): WarmerSession {
  const target = getDailyTarget(dataset, dateKey);
  const today = state.today && state.today.dateKey === dateKey ? state.today : null;
  const order = today?.guesses ?? [];
  const feedbacks = order.map((f) => evaluateGuess(target, dataset.byFips.get(f)!));
  const sorted = [...feedbacks].sort((a, b) => a.miles - b.miles);
  const solved = today?.solved ?? false;
  const gaveUp = today?.gaveUp ?? false;
  const finished = solved || gaveUp;
  const pn = puzzleNumber(dateKey);
  return {
    dateKey,
    puzzleNumber: pn,
    guesses: sorted,
    guessCount: order.length,
    closest: sorted.length ? sorted[0] : null,
    solved, gaveUp, finished,
    target: finished ? target : null,
    streak: state.streak,
    shareRows: feedbacks.map((fb) => tierEmoji(fb.tier)),
    shareText: buildShareText({ puzzleNumber: pn, stateName: target.state_name, guessCount: order.length, solved, tiers: feedbacks.map((f) => f.tier) }),
  };
}

export type ApplyGuessResult = { ok: true; state: WarmerState } | { ok: false; reason: "duplicate" | "unknown" | "finished" };

export function applyGuess(dataset: Dataset, state: WarmerState, dateKey: string, fips: string): ApplyGuessResult {
  if (!dataset.byFips.has(fips)) return { ok: false, reason: "unknown" };
  const target = getDailyTarget(dataset, dateKey);
  const started = startDay(state, dateKey);
  if (started.today!.solved || started.today!.gaveUp) return { ok: false, reason: "finished" };
  if (started.today!.guesses.includes(fips)) return { ok: false, reason: "duplicate" };
  return { ok: true, state: recordGuess(started, fips, target.fips, dateKey) };
}
