import type { CountleState } from "./types";
import { GUESS_LIMIT } from "./constants";
import { prevDateKey } from "./daily";

export function initialState(): CountleState {
  return {
    schemaVersion: 1,
    lastPlayedDateKey: null,
    today: null,
    streak: 0,
    maxStreak: 0,
    gamesPlayed: 0,
    guessDistribution: Array(GUESS_LIMIT).fill(0),
    fails: 0,
    solvedCounties: [],
    encounteredCounties: [],
  };
}

export function parseState(raw: string | null): CountleState {
  if (!raw) return initialState();
  try {
    const obj = JSON.parse(raw);
    if (!obj || obj.schemaVersion !== 1) return initialState();
    // Trust v1 shape; fill any missing arrays defensively.
    return { ...initialState(), ...obj };
  } catch {
    return initialState();
  }
}

export function serializeState(s: CountleState): string {
  return JSON.stringify(s);
}

/** Ensure `today` matches dateKey; fresh slate on a new day. */
export function startDay(s: CountleState, dateKey: string): CountleState {
  if (s.today && s.today.dateKey === dateKey) return s;
  return { ...s, today: { dateKey, guesses: [], solved: false, finished: false } };
}

function addUnique(list: string[], fips: string): string[] {
  return list.includes(fips) ? list : [...list, fips];
}

export function recordGuess(
  s: CountleState,
  fips: string,
  opts: { isCorrect: boolean; dateKey: string; answerFips: string }
): CountleState {
  const today = s.today ?? { dateKey: opts.dateKey, guesses: [], solved: false, finished: false };
  if (today.finished) return s; // ignore post-game guesses

  const guesses = [...today.guesses, fips];
  const encounteredCounties = addUnique(s.encounteredCounties, fips);
  const willFinish = opts.isCorrect || guesses.length >= GUESS_LIMIT;

  if (!willFinish) {
    return { ...s, encounteredCounties, today: { ...today, guesses } };
  }

  // Finalize the game.
  const solved = opts.isCorrect;
  const playedYesterday = s.lastPlayedDateKey === prevDateKey(opts.dateKey);
  const streak = solved ? (playedYesterday ? s.streak + 1 : 1) : 0;
  const guessDistribution = [...s.guessDistribution];
  if (solved) guessDistribution[guesses.length - 1] += 1;

  return {
    ...s,
    today: { ...today, guesses, solved, finished: true },
    streak,
    maxStreak: Math.max(s.maxStreak, streak),
    gamesPlayed: s.gamesPlayed + 1,
    guessDistribution,
    fails: solved ? s.fails : s.fails + 1,
    solvedCounties: solved ? addUnique(s.solvedCounties, opts.answerFips) : s.solvedCounties,
    encounteredCounties,
    lastPlayedDateKey: opts.dateKey,
  };
}
