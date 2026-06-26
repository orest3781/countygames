import type { ConnectionsState, GroupColor, SubmissionResult } from "./types";
import { prevDateKey } from "../countle/daily";

const GROUPS = 4;
const MISTAKE_LIMIT = 4;

export function initialState(): ConnectionsState {
  return {
    schemaVersion: 1,
    lastPlayedDateKey: null,
    today: null,
    streak: 0,
    maxStreak: 0,
    gamesPlayed: 0,
    wins: 0,
    perfectGames: 0,
  };
}

export function parseState(raw: string | null): ConnectionsState {
  if (!raw) return initialState();
  try {
    const obj = JSON.parse(raw);
    if (!obj || obj.schemaVersion !== 1) return initialState();
    return { ...initialState(), ...obj };
  } catch {
    return initialState();
  }
}

export function serializeState(s: ConnectionsState): string {
  return JSON.stringify(s);
}

export function startDay(s: ConnectionsState, dateKey: string): ConnectionsState {
  if (s.today && s.today.dateKey === dateKey) return s;
  return { ...s, today: { dateKey, submissions: [], solvedColors: [], mistakes: 0, finished: false, won: false } };
}

export function recordSubmission(
  s: ConnectionsState,
  fips4: string[],
  result: SubmissionResult,
  dateKey: string
): ConnectionsState {
  const today = s.today ?? { dateKey, submissions: [], solvedColors: [], mistakes: 0, finished: false, won: false };
  if (today.finished) return s;

  const submissions = [...today.submissions, fips4];
  let solvedColors = today.solvedColors;
  let mistakes = today.mistakes;

  if (result.kind === "correct") {
    solvedColors = [...today.solvedColors, result.color as GroupColor];
  } else {
    mistakes = today.mistakes + 1;
  }

  const won = solvedColors.length === GROUPS;
  const finished = won || mistakes >= MISTAKE_LIMIT;

  const nextToday = { ...today, submissions, solvedColors, mistakes, finished, won };
  if (!finished) {
    return { ...s, today: nextToday };
  }

  // Finalize.
  const playedYesterday = s.lastPlayedDateKey === prevDateKey(dateKey);
  const streak = won ? (playedYesterday ? s.streak + 1 : 1) : 0;
  return {
    ...s,
    today: nextToday,
    streak,
    maxStreak: Math.max(s.maxStreak, streak),
    gamesPlayed: s.gamesPlayed + 1,
    wins: s.wins + (won ? 1 : 0),
    perfectGames: s.perfectGames + (won && mistakes === 0 ? 1 : 0),
    lastPlayedDateKey: dateKey,
  };
}
