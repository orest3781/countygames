import { describe, it, expect } from "vitest";
import { warmerStats } from "./stats";
import { initialState } from "./state";
import type { WarmerState } from "./types";

const st = (over: Partial<WarmerState>): WarmerState => ({ ...initialState(), ...over });

describe("warmerStats", () => {
  it("0 solve rate when unplayed; rounded otherwise", () => {
    expect(warmerStats(st({})).solvePct).toBe(0);
    expect(warmerStats(st({ gamesPlayed: 4, solves: 3 })).solvePct).toBe(75);
  });
  it("passes through streak/best and emits all buckets in order", () => {
    const s = warmerStats(st({ gamesPlayed: 5, solves: 5, streak: 2, maxStreak: 4, bestGuesses: 3, guessDistribution: { "1-3": 2, "7-9": 1 } }));
    expect(s.currentStreak).toBe(2);
    expect(s.maxStreak).toBe(4);
    expect(s.best).toBe(3);
    expect(s.distribution).toEqual([
      { bucket: "1-3", count: 2 }, { bucket: "4-6", count: 0 }, { bucket: "7-9", count: 1 }, { bucket: "10+", count: 0 },
    ]);
  });
});
