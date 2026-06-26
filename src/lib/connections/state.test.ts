import { describe, it, expect } from "vitest";
import { initialState, parseState, serializeState, startDay, recordSubmission } from "./state";
import type { SubmissionResult } from "./types";

const correct = (color: any, gi: number): SubmissionResult => ({ kind: "correct", color, groupIndex: gi });
const wrong: SubmissionResult = { kind: "wrong" };
const oneAway: SubmissionResult = { kind: "one-away" };

describe("initial / parse / serialize", () => {
  it("initial is empty", () => {
    const s = initialState();
    expect(s.gamesPlayed).toBe(0);
    expect(s.today).toBeNull();
  });
  it("parse falls back on null/garbage/wrong version", () => {
    expect(parseState(null).gamesPlayed).toBe(0);
    expect(parseState("{nope").gamesPlayed).toBe(0);
    expect(parseState(JSON.stringify({ schemaVersion: 9 })).gamesPlayed).toBe(0);
  });
  it("round-trips", () => {
    const s = startDay(initialState(), "2026-06-26");
    expect(parseState(serializeState(s)).today!.dateKey).toBe("2026-06-26");
  });
});

describe("startDay", () => {
  it("fresh today on a new day, preserves same-day", () => {
    const a = startDay(initialState(), "2026-06-26");
    expect(a.today).toEqual({ dateKey: "2026-06-26", submissions: [], solvedColors: [], mistakes: 0, finished: false, won: false });
    const b = recordSubmission(a, ["1", "2", "3", "4"], wrong, "2026-06-26");
    expect(startDay(b, "2026-06-26").today!.submissions).toHaveLength(1);
    expect(startDay(b, "2026-06-27").today!.submissions).toHaveLength(0);
  });
});

describe("recordSubmission", () => {
  it("solving all four groups wins, bumps streak + perfect, records colors", () => {
    let s = startDay(initialState(), "2026-06-26");
    s = recordSubmission(s, ["a"], correct("yellow", 0), "2026-06-26");
    s = recordSubmission(s, ["b"], correct("green", 1), "2026-06-26");
    s = recordSubmission(s, ["c"], correct("blue", 2), "2026-06-26");
    s = recordSubmission(s, ["d"], correct("purple", 3), "2026-06-26");
    expect(s.today!.won).toBe(true);
    expect(s.today!.finished).toBe(true);
    expect(s.today!.solvedColors).toEqual(["yellow", "green", "blue", "purple"]);
    expect(s.gamesPlayed).toBe(1);
    expect(s.wins).toBe(1);
    expect(s.perfectGames).toBe(1);
    expect(s.streak).toBe(1);
  });
  it("wrong and one-away both cost a mistake; 4 mistakes ends as a loss (no perfect)", () => {
    let s = startDay(initialState(), "2026-06-26");
    for (const r of [wrong, oneAway, wrong, oneAway]) s = recordSubmission(s, ["x", "y", "z", "w"], r, "2026-06-26");
    expect(s.today!.mistakes).toBe(4);
    expect(s.today!.finished).toBe(true);
    expect(s.today!.won).toBe(false);
    expect(s.wins).toBe(0);
    expect(s.perfectGames).toBe(0);
    expect(s.streak).toBe(0);
  });
  it("ignores submissions after the game is finished", () => {
    let s = startDay(initialState(), "2026-06-26");
    for (const r of [wrong, wrong, wrong, wrong]) s = recordSubmission(s, ["x"], r, "2026-06-26");
    const after = recordSubmission(s, ["x"], wrong, "2026-06-26");
    expect(after.today!.submissions).toHaveLength(4);
  });
  it("a win after a win on the next day continues the streak; a missed day resets", () => {
    const winDay = (s: any, key: string) => {
      let st = startDay(s, key);
      st = recordSubmission(st, ["a"], correct("yellow", 0), key);
      st = recordSubmission(st, ["b"], correct("green", 1), key);
      st = recordSubmission(st, ["c"], correct("blue", 2), key);
      st = recordSubmission(st, ["d"], correct("purple", 3), key);
      return st;
    };
    let s = winDay(initialState(), "2026-06-26");
    s = winDay(s, "2026-06-27");
    expect(s.streak).toBe(2);
    s = winDay(s, "2026-06-29"); // skipped 28th
    expect(s.streak).toBe(1);
  });
});
