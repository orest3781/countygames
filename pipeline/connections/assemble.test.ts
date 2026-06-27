import { describe, it, expect } from "vitest";
import { mulberry32, assemblePuzzles } from "./assemble";
import { validateConnections } from "../../src/lib/connections/validate";
import type { CandidateGroup } from "./families";
import type { CountyEntry, StatKey } from "../../src/lib/countle/types";

function county(fips: string, st: string, region: string): CountyEntry {
  const z: Record<StatKey, number> = { wealth: 1, health: 1, people: 1, land: 1, danger: 1, education: 1 };
  return { fips, name: fips, state_abbr: st, state_name: st, region, county_seat: null, lat: 0, lng: 0,
    stats: z, display: { wealth: "", health: "", people: "", land: "", danger: "", education: "" },
    rarity: "common", hasArt: false, isAnswerPool: true, notable_person: null, notable_person_desc: null, flavor: null };
}

// Six non-disjoint groups (some cards belong to multiple predicates) → assembler can find unique puzzles with trap cards.
const fipsOf = (p: string, n: number) => `${p}${String(n).padStart(3, "0")}`;
const mk = (family: any, key: string, n: number, base: string): CandidateGroup => ({
  family, key, label: key, members: Array.from({ length: 5 }, (_, i) => fipsOf(base, n * 10 + i)),
  predicate: (c) => c.state_abbr.includes(key), // use includes() to allow cards to match multiple groups
});
const groups: CandidateGroup[] = [
  mk("sameState", "S1", 1, "10"), mk("sameState", "S2", 2, "20"),
  mk("sameRegion", "R1", 3, "30"), mk("stateCapital", "C1", 4, "40"),
  mk("presidentName", "P1", 5, "50"), mk("sharedName", "N1", 6, "60"),
];
const allFips = groups.flatMap((g) => g.members);
const byFips = new Map(allFips.map((f) => [f, county(f, "X", "Midwest")]));
// give each card a state tag that may match multiple groups (to create trap cards)
// S1 cards: pure S1 except 10014 also matches R1
// S2 cards: pure S2 except 20024 also matches C1
// R1 cards: pure R1 except 30034 also matches S1
// C1 cards: pure C1 except 40043 also matches S2
for (let i = 0; i < 5; i++) {
  const fips1 = fipsOf("10", 1 * 10 + i);
  byFips.get(fips1)!.state_abbr = i === 4 ? "S1R1" : "S1";
}
for (let i = 0; i < 5; i++) {
  const fips2 = fipsOf("20", 2 * 10 + i);
  byFips.get(fips2)!.state_abbr = i === 4 ? "S2C1" : "S2";
}
for (let i = 0; i < 5; i++) {
  const fips3 = fipsOf("30", 3 * 10 + i);
  byFips.get(fips3)!.state_abbr = i === 4 ? "R1S1" : "R1";
}
for (let i = 0; i < 5; i++) {
  const fips4 = fipsOf("40", 4 * 10 + i);
  byFips.get(fips4)!.state_abbr = i === 4 ? "C1S2" : "C1";
}
for (let i = 0; i < 5; i++) {
  byFips.get(fipsOf("50", 5 * 10 + i))!.state_abbr = "P1";
}
for (let i = 0; i < 5; i++) {
  byFips.get(fipsOf("60", 6 * 10 + i))!.state_abbr = "N1";
}

describe("mulberry32", () => {
  it("is deterministic", () => {
    const a = mulberry32(42), b = mulberry32(42);
    expect(a()).toBe(b());
  });
});

describe("assemblePuzzles", () => {
  const puzzles = assemblePuzzles(groups, byFips, { seed: 1, target: 3, attempts: 500 });
  it("produces valid puzzles that pass the engine validator", () => {
    expect(puzzles.length).toBeGreaterThan(0);
    expect(validateConnections({ schemaVersion: 1, generatedAt: "x", count: puzzles.length, puzzles }).ok).toBe(true);
  });
  it("every emitted puzzle is structurally valid (16 distinct cards, 4 groups × 4)", () => {
    for (const p of puzzles) {
      expect(new Set(p.groups.flatMap((g) => g.fips)).size).toBe(16);
      expect(p.groups.every((g) => g.fips.length === 4)).toBe(true);
    }
    // (Uniqueness + trap correctness is proven in solver.test.ts; the assembler only emits puzzles that pass it.)
  });
});
