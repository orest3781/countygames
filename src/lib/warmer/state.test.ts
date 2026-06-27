import { describe, it, expect } from "vitest";
import { initialState, parseState, serializeState, startDay, recordGuess, giveUp } from "./state";

const DATE = "2026-06-27";
const TARGET = "17031";

describe("parse/serialize", () => {
  it("returns initial state for null or malformed", () => {
    expect(parseState(null)).toEqual(initialState());
    expect(parseState("{not json")).toEqual(initialState());
    expect(parseState(JSON.stringify({ schemaVersion: 2 }))).toEqual(initialState());
  });
  it("round-trips", () => {
    const s = { ...initialState(), gamesPlayed: 3, solves: 2, streak: 2 };
    expect(parseState(serializeState(s))).toEqual(s);
  });
});

describe("startDay", () => {
  it("creates today's slate and is idempotent for the same day", () => {
    const s1 = startDay(initialState(), DATE);
    expect(s1.today).toEqual({ dateKey: DATE, guesses: [], solved: false, gaveUp: false });
    expect(startDay(s1, DATE)).toBe(s1);
  });
  it("replaces a stale day", () => {
    const s1 = startDay(initialState(), "2026-06-26");
    const s2 = startDay(s1, DATE);
    expect(s2.today!.dateKey).toBe(DATE);
    expect(s2.today!.guesses).toEqual([]);
  });
});

describe("recordGuess", () => {
  it("appends a non-target guess without solving", () => {
    const s = recordGuess(startDay(initialState(), DATE), "06037", TARGET, DATE);
    expect(s.today!.guesses).toEqual(["06037"]);
    expect(s.today!.solved).toBe(false);
    expect(s.gamesPlayed).toBe(0);
  });
  it("does not append a duplicate guess", () => {
    let s = recordGuess(startDay(initialState(), DATE), "06037", TARGET, DATE);
    s = recordGuess(s, "06037", TARGET, DATE);
    expect(s.today!.guesses).toEqual(["06037"]);
  });
  it("solving finalizes: solved, gamesPlayed/solves +1, bestGuesses, distribution, streak", () => {
    let s = startDay(initialState(), DATE);
    s = recordGuess(s, "06037", TARGET, DATE); // guess 1
    s = recordGuess(s, "48201", TARGET, DATE); // guess 2
    s = recordGuess(s, TARGET, TARGET, DATE);  // guess 3 = solve
    expect(s.today!.solved).toBe(true);
    expect(s.gamesPlayed).toBe(1);
    expect(s.solves).toBe(1);
    expect(s.bestGuesses).toBe(3);
    expect(s.guessDistribution["1-3"]).toBe(1);
    expect(s.streak).toBe(1);
    expect(s.maxStreak).toBe(1);
    expect(s.lastPlayedDateKey).toBe(DATE);
  });
  it("continues the streak when yesterday was played", () => {
    const base = { ...initialState(), streak: 4, maxStreak: 4, lastPlayedDateKey: "2026-06-26" };
    const s = recordGuess(startDay(base, DATE), TARGET, TARGET, DATE);
    expect(s.streak).toBe(5);
    expect(s.maxStreak).toBe(5);
  });
  it("accumulates guessDistribution across two solves", () => {
    let s = startDay(initialState(), "2026-06-26");
    s = recordGuess(s, TARGET, TARGET, "2026-06-26");           // 1 guess → "1-3" = 1
    s = startDay(s, DATE);
    s = recordGuess(s, "06037", TARGET, DATE);
    s = recordGuess(s, TARGET, TARGET, DATE);                    // 2 guesses → "1-3" = 2
    expect(s.guessDistribution["1-3"]).toBe(2);
  });
  it("recordGuess after solve is a no-op", () => {
    const s = recordGuess(startDay(initialState(), DATE), TARGET, TARGET, DATE);
    const s2 = recordGuess(s, "06037", TARGET, DATE);
    expect(s2).toBe(s);
  });
});

describe("giveUp", () => {
  it("marks gaveUp, breaks the streak, counts as played, no solve", () => {
    const base = { ...initialState(), streak: 3, lastPlayedDateKey: "2026-06-26" };
    const s = giveUp(startDay(base, DATE), DATE);
    expect(s.today!.gaveUp).toBe(true);
    expect(s.today!.solved).toBe(false);
    expect(s.streak).toBe(0);
    expect(s.gamesPlayed).toBe(1);
    expect(s.solves).toBe(0);
  });
  it("giveUp is idempotent on an already-finished day", () => {
    const s = giveUp(startDay(initialState(), DATE), DATE);
    const s2 = giveUp(s, DATE);
    expect(s2).toBe(s); // same reference
  });
});
