import { describe, it, expect } from "vitest";
import { buildWarmerSession, applyGuess } from "./session";
import { initialState } from "./state";
import { getDailyTarget } from "./daily";
import type { CountyEntry, Dataset } from "../countle/types";

function mk(fips: string, lat: number, lng: number, state_name = "Zed"): CountyEntry {
  return {
    fips, name: `C${fips}`, state_abbr: "ZZ", state_name, region: "Midwest", county_seat: null,
    lat, lng, stats: { wealth: 50, health: 50, people: 50, land: 50, danger: 50, education: 50 },
    display: { wealth: "", health: "", people: "", land: "", danger: "", education: "" },
    rarity: "common", hasArt: false, isAnswerPool: true, notable_person: null, notable_person_desc: null, flavor: null,
  };
}
// Spread the answer pool out so daily selection + distances are meaningful.
const POOL: CountyEntry[] = [
  mk("06037", 34.0, -118.2), mk("17031", 41.8, -87.7), mk("48201", 29.8, -95.4),
  mk("48453", 30.3, -97.7), mk("36061", 40.8, -74.0), mk("53033", 47.5, -122.3),
];
const ds: Dataset = { byFips: new Map(POOL.map((c) => [c.fips, c])), all: POOL, answerPoolFips: POOL.map((c) => c.fips).sort() };
const DATE = "2026-06-27";
const TARGET = getDailyTarget(ds, DATE); // whatever the salted pick lands on

describe("buildWarmerSession", () => {
  it("fresh state: no guesses, no closest, not finished, target hidden", () => {
    const v = buildWarmerSession(ds, initialState(), DATE);
    expect(v.guesses).toHaveLength(0);
    expect(v.guessCount).toBe(0);
    expect(v.closest).toBeNull();
    expect(v.finished).toBe(false);
    expect(v.target).toBeNull();
  });

  it("after one non-winning guess: 1 guess, closest set, target still hidden", () => {
    const other = ds.all.find((c) => c.fips !== TARGET.fips)!;
    const r = applyGuess(ds, initialState(), DATE, other.fips);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = buildWarmerSession(ds, r.state, DATE);
    expect(v.guessCount).toBe(1);
    expect(v.closest?.fips).toBe(other.fips);
    expect(v.finished).toBe(false);
    expect(v.target).toBeNull();
  });

  it("orders guesses closest-first", () => {
    let s = initialState();
    for (const c of ds.all.filter((c) => c.fips !== TARGET.fips)) {
      const r = applyGuess(ds, s, DATE, c.fips);
      if (r.ok) s = r.state;
    }
    const v = buildWarmerSession(ds, s, DATE);
    const miles = v.guesses.map((g) => g.miles);
    expect([...miles]).toEqual([...miles].sort((a, b) => a - b));
  });

  it("on solve: solved + finished true, target revealed, share text names the state", () => {
    const r = applyGuess(ds, initialState(), DATE, TARGET.fips);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = buildWarmerSession(ds, r.state, DATE);
    expect(v.solved).toBe(true);
    expect(v.finished).toBe(true);
    expect(v.target?.fips).toBe(TARGET.fips);
    expect(v.shareText).toContain(TARGET.state_name);
    expect(v.shareText).toContain("🟩");
    expect(v.shareText).toContain("found it in");
    expect(v.shareText).toContain("county.games");
  });
});

describe("applyGuess", () => {
  it("rejects an unknown fips", () => {
    const r = applyGuess(ds, initialState(), DATE, "99999");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("unknown");
  });
  it("rejects a duplicate guess", () => {
    const other = ds.all.find((c) => c.fips !== TARGET.fips)!;
    const first = applyGuess(ds, initialState(), DATE, other.fips);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const dup = applyGuess(ds, first.state, DATE, other.fips);
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.reason).toBe("duplicate");
  });
  it("rejects a new guess on a finished day with reason 'finished'", () => {
    const solved = applyGuess(ds, initialState(), DATE, TARGET.fips);
    expect(solved.ok).toBe(true);
    if (!solved.ok) return;
    const other = ds.all.find((c) => c.fips !== TARGET.fips)!;
    const after = applyGuess(ds, solved.state, DATE, other.fips);
    expect(after.ok).toBe(false);
    if (after.ok) return;
    expect(after.reason).toBe("finished");
  });
});
