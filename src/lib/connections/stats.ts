import type { ConnectionsState } from "./types";

export interface ConnectionsStats {
  played: number;
  winPct: number;
  currentStreak: number;
  maxStreak: number;
  perfect: number;
}

export function connectionsStats(state: ConnectionsState): ConnectionsStats {
  const played = state.gamesPlayed;
  return {
    played,
    winPct: played > 0 ? Math.round((state.wins / played) * 100) : 0,
    currentStreak: state.streak,
    maxStreak: state.maxStreak,
    perfect: state.perfectGames,
  };
}
