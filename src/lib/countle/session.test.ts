import { describe, it, expect } from "vitest";
import { buildSession, submitGuess } from "./session";
import { buildDataset } from "./data";
import { initialState } from "./state";
import type { CountiesPayload, CountyEntry, StatKey } from "./types";

function county(fips: string, name: string, lat: number, lng: number, pool: boolean, stats: Record<StatKey, number>, notable: string | null = null): CountyEntry {
  return { fips, name, state_abbr: "XX", state_name: "X", region: "Pacific", county_seat: null, lat, lng,
    stats, display: { wealth: "", health: "", people: "", land: "", danger: "", education: "" },
    rarity: "common", hasArt: false, isAnswerPool: pool, notable_person: notable, notable_person_desc: null, flavor: null };
}
const even = { wealth: 50, health: 50, people: 50, land: 50, danger: 50, education: 50 };
const payload: CountiesPayload = { schemaVersion: 1, generatedAt: "x", count: 3, answerPoolCount: 1,
  counties: {
    "06037": county("06037", "Los Angeles County", 34.05, -118.24, true, even, "Some Person"),
    "36061": county("36061", "New York County", 40.71, -74.0, false, even),
    "17031": county("17031", "Cook County", 41.88, -87.63, false, even),
  } };
const ds = buildDataset(payload); // answer pool = ["06037"], so the daily is always LA
const KEY = "2026-06-25";

describe("buildSession (fresh)", () => {
  const s = buildSession(ds, initialState(), KEY);
  it("exposes the daily mystery, puzzle number, full blur, no guesses", () => {
    expect(s.mystery.fips).toBe("06037");
    expect(s.puzzleNumber).toBe(1);
    expect(s.guessesUsed).toBe(0);
    expect(s.guessesLeft).toBe(6);
    expect(s.latest).toBeNull();
    expect(s.blur).toBe(24);
    expect(s.finished).toBe(false);
    expect(s.clueAvailable).toBe(false);
  });
});

describe("submitGuess", () => {
  it("rejects an unknown fips", () => {
    const r = submitGuess(ds, initialState(), KEY, "99999");
    expect(r).toEqual({ ok: false, reason: "unknown" });
  });
  it("records a wrong guess and reflects it in the next session", () => {
    const r = submitGuess(ds, initialState(), KEY, "36061");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = buildSession(ds, r.state, KEY);
    expect(s.guessesUsed).toBe(1);
    expect(s.latest!.guess.fips).toBe("36061");
    expect(s.latest!.isCorrect).toBe(false);
    expect(s.solved).toBe(false);
    expect(s.shareRows.length).toBe(1);
  });
  it("rejects a duplicate guess", () => {
    const r1 = submitGuess(ds, initialState(), KEY, "36061");
    if (!r1.ok) throw new Error("setup");
    expect(submitGuess(ds, r1.state, KEY, "36061")).toEqual({ ok: false, reason: "duplicate" });
  });
  it("a correct guess solves and finishes the session", () => {
    const r = submitGuess(ds, initialState(), KEY, "06037");
    if (!r.ok) throw new Error("setup");
    const s = buildSession(ds, r.state, KEY);
    expect(s.solved).toBe(true);
    expect(s.finished).toBe(true);
    expect(s.streak).toBe(1);
    expect(s.shareText).toContain("Countle #1  1/6");
  });
  it("rejects guesses after the game is finished", () => {
    const r = submitGuess(ds, initialState(), KEY, "06037");
    if (!r.ok) throw new Error("setup");
    expect(submitGuess(ds, r.state, KEY, "36061")).toEqual({ ok: false, reason: "finished" });
  });
  it("does not expose the clue before NOTABLE_CLUE_GUESS-1 wrong guesses", () => {
    let st = initialState();
    for (const w of ["36061", "17031"]) { const r = submitGuess(ds, st, KEY, w); if (r.ok) st = r.state; }
    expect(buildSession(ds, st, KEY).clueAvailable).toBe(false);
  });
});
