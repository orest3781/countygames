import { describe, it, expect } from "vitest";
import { connectionsStats } from "./stats";
import { initialState } from "./state";
import type { ConnectionsState } from "./types";

function st(over: Partial<ConnectionsState>): ConnectionsState {
  return { ...initialState(), ...over };
}

describe("connectionsStats", () => {
  it("computes win percentage rounded, 0 when unplayed", () => {
    expect(connectionsStats(st({})).winPct).toBe(0);
    expect(connectionsStats(st({ gamesPlayed: 4, wins: 3 })).winPct).toBe(75);
    expect(connectionsStats(st({ gamesPlayed: 3, wins: 1 })).winPct).toBe(33);
  });
  it("passes through streak/max/perfect/played", () => {
    const s = connectionsStats(st({ gamesPlayed: 10, wins: 7, streak: 2, maxStreak: 5, perfectGames: 3 }));
    expect(s).toEqual({ played: 10, winPct: 70, currentStreak: 2, maxStreak: 5, perfect: 3 });
  });
});
