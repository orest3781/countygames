import type { WarmerState } from "./types";
import { guessBucket } from "./game";
import { prevDateKey } from "../countle/daily";

export function initialState(): WarmerState {
  return {
    schemaVersion: 1, lastPlayedDateKey: null, today: null,
    streak: 0, maxStreak: 0, gamesPlayed: 0, solves: 0, bestGuesses: null, guessDistribution: {},
  };
}

export function parseState(raw: string | null): WarmerState {
  if (!raw) return initialState();
  try {
    const o = JSON.parse(raw);
    if (!o || o.schemaVersion !== 1) return initialState();
    return { ...initialState(), ...o };
  } catch {
    return initialState();
  }
}

export function serializeState(s: WarmerState): string {
  return JSON.stringify(s);
}

export function startDay(s: WarmerState, dateKey: string): WarmerState {
  if (s.today && s.today.dateKey === dateKey) return s;
  return { ...s, today: { dateKey, guesses: [], solved: false, gaveUp: false } };
}

export function recordGuess(s: WarmerState, fips: string, targetFips: string, dateKey: string): WarmerState {
  const today = s.today ?? { dateKey, guesses: [], solved: false, gaveUp: false };
  if (today.solved || today.gaveUp) return s;

  const guesses = today.guesses.includes(fips) ? today.guesses : [...today.guesses, fips];
  const solved = fips === targetFips;
  const nextToday = { ...today, guesses, solved };
  if (!solved) return { ...s, today: nextToday };

  const count = guesses.length;
  const playedYesterday = s.lastPlayedDateKey === prevDateKey(dateKey);
  const streak = playedYesterday ? s.streak + 1 : 1;
  const bucket = guessBucket(count);
  return {
    ...s,
    today: nextToday,
    streak,
    maxStreak: Math.max(s.maxStreak, streak),
    gamesPlayed: s.gamesPlayed + 1,
    solves: s.solves + 1,
    bestGuesses: s.bestGuesses == null ? count : Math.min(s.bestGuesses, count),
    guessDistribution: { ...s.guessDistribution, [bucket]: (s.guessDistribution[bucket] ?? 0) + 1 },
    lastPlayedDateKey: dateKey,
  };
}

export function giveUp(s: WarmerState, dateKey: string): WarmerState {
  const today = s.today ?? { dateKey, guesses: [], solved: false, gaveUp: false };
  if (today.solved || today.gaveUp) return s;
  return {
    ...s,
    today: { ...today, gaveUp: true },
    streak: 0,
    gamesPlayed: s.gamesPlayed + 1,
    lastPlayedDateKey: dateKey,
  };
}
