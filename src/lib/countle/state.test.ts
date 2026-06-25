import { describe, it, expect } from "vitest";
import { initialState, parseState, serializeState, startDay, recordGuess } from "./state";

describe("initialState / parse / serialize", () => {
  it("initial is empty and well-formed", () => {
    const s = initialState();
    expect(s.schemaVersion).toBe(1);
    expect(s.streak).toBe(0);
    expect(s.guessDistribution).toEqual([0, 0, 0, 0, 0, 0]);
    expect(s.today).toBeNull();
  });
  it("parseState falls back to initial on null/garbage/wrong version", () => {
    expect(parseState(null).gamesPlayed).toBe(0);
    expect(parseState("{not json").gamesPlayed).toBe(0);
    expect(parseState(JSON.stringify({ schemaVersion: 99 })).gamesPlayed).toBe(0);
  });
  it("round-trips a valid state", () => {
    const s = recordGuess(startDay(initialState(), "2026-06-25"), "06037", { isCorrect: true, dateKey: "2026-06-25", answerFips: "06037" });
    expect(parseState(serializeState(s)).streak).toBe(1);
  });
});

describe("startDay", () => {
  it("creates a fresh today on a new day, preserves an in-progress today", () => {
    const a = startDay(initialState(), "2026-06-25");
    expect(a.today).toEqual({ dateKey: "2026-06-25", guesses: [], solved: false, finished: false });
    const b = recordGuess(a, "17031", { isCorrect: false, dateKey: "2026-06-25", answerFips: "06037" });
    expect(startDay(b, "2026-06-25").today!.guesses).toEqual(["17031"]); // same day untouched
    expect(startDay(b, "2026-06-26").today!.guesses).toEqual([]);        // new day reset
  });
});

describe("recordGuess", () => {
  it("a correct guess solves, finishes, sets streak=1, records distribution + solved county", () => {
    const s = recordGuess(startDay(initialState(), "2026-06-25"), "06037", { isCorrect: true, dateKey: "2026-06-25", answerFips: "06037" });
    expect(s.today!.solved).toBe(true);
    expect(s.today!.finished).toBe(true);
    expect(s.streak).toBe(1);
    expect(s.gamesPlayed).toBe(1);
    expect(s.guessDistribution).toEqual([1, 0, 0, 0, 0, 0]); // solved in 1
    expect(s.solvedCounties).toContain("06037");
    expect(s.encounteredCounties).toContain("06037");
    expect(s.lastPlayedDateKey).toBe("2026-06-25");
  });

  it("six wrong guesses finishes as a loss: streak 0, fails++, no solved county", () => {
    let s = startDay(initialState(), "2026-06-25");
    for (let i = 0; i < 6; i++) s = recordGuess(s, `0000${i}`, { isCorrect: false, dateKey: "2026-06-25", answerFips: "06037" });
    expect(s.today!.finished).toBe(true);
    expect(s.today!.solved).toBe(false);
    expect(s.streak).toBe(0);
    expect(s.fails).toBe(1);
    expect(s.gamesPlayed).toBe(1);
    expect(s.solvedCounties).not.toContain("06037");
    expect(s.encounteredCounties.length).toBe(6);
  });

  it("guesses after the game is finished are ignored", () => {
    let s = recordGuess(startDay(initialState(), "2026-06-25"), "06037", { isCorrect: true, dateKey: "2026-06-25", answerFips: "06037" });
    s = recordGuess(s, "17031", { isCorrect: false, dateKey: "2026-06-25", answerFips: "06037" });
    expect(s.today!.guesses).toEqual(["06037"]);
    expect(s.gamesPlayed).toBe(1);
  });

  it("consecutive-day solves grow the streak; a skipped day resets it", () => {
    let s = recordGuess(startDay(initialState(), "2026-06-25"), "06037", { isCorrect: true, dateKey: "2026-06-25", answerFips: "06037" });
    s = recordGuess(startDay(s, "2026-06-26"), "17031", { isCorrect: true, dateKey: "2026-06-26", answerFips: "17031" });
    expect(s.streak).toBe(2);
    expect(s.maxStreak).toBe(2);
    // skip 06-27, play 06-28 → streak resets to 1
    s = recordGuess(startDay(s, "2026-06-28"), "36061", { isCorrect: true, dateKey: "2026-06-28", answerFips: "36061" });
    expect(s.streak).toBe(1);
    expect(s.maxStreak).toBe(2);
  });
});
