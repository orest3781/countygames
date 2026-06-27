import { describe, it, expect } from "vitest";
import { countAssignments, isUniqueSolution, trapScore } from "./solver";

// 4 categories, predicates by membership sets.
function preds(sets: string[][]) {
  return sets.map((s) => (fips: string) => s.includes(fips));
}

describe("countAssignments", () => {
  it("a clean partition (each card fits exactly one category) is unique", () => {
    const cards = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p"];
    const sets = [["a", "b", "c", "d"], ["e", "f", "g", "h"], ["i", "j", "k", "l"], ["m", "n", "o", "p"]];
    expect(countAssignments(cards, preds(sets))).toBe(1);
  });
  it("a trap that still forces a unique solution counts 1", () => {
    // 'a' fits cat0 AND cat1, but cat1 already has its 4 (e,f,g,h) and cat0 needs a → forced.
    const cards = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p"];
    const sets = [["a", "b", "c", "d"], ["a", "e", "f", "g", "h"], ["i", "j", "k", "l"], ["m", "n", "o", "p"]];
    expect(countAssignments(cards, preds(sets))).toBe(1);
  });
  it("a genuinely ambiguous set counts >= 2", () => {
    // 'a' and 'e' can swap between cat0 and cat1 → two valid assignments.
    const cards = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p"];
    const sets = [["a", "e", "b", "c", "d"], ["a", "e", "f", "g", "h"], ["i", "j", "k", "l"], ["m", "n", "o", "p"]];
    expect(countAssignments(cards, preds(sets))).toBeGreaterThanOrEqual(2);
  });
});

describe("isUniqueSolution", () => {
  it("true for the forced-trap case, false for the ambiguous case", () => {
    const cards = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p"];
    expect(isUniqueSolution(cards, preds([["a", "b", "c", "d"], ["a", "e", "f", "g", "h"], ["i", "j", "k", "l"], ["m", "n", "o", "p"]]))).toBe(true);
    expect(isUniqueSolution(cards, preds([["a", "e", "b", "c", "d"], ["a", "e", "f", "g", "h"], ["i", "j", "k", "l"], ["m", "n", "o", "p"]]))).toBe(false);
  });
});

describe("trapScore", () => {
  it("counts cards that satisfy more than one category", () => {
    const cards = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p"];
    // 'a' fits cat0 + cat1 → 1 trap card.
    expect(trapScore(cards, preds([["a", "b", "c", "d"], ["a", "e", "f", "g", "h"], ["i", "j", "k", "l"], ["m", "n", "o", "p"]]))).toBe(1);
    // clean → 0 traps.
    expect(trapScore(cards, preds([["a", "b", "c", "d"], ["e", "f", "g", "h"], ["i", "j", "k", "l"], ["m", "n", "o", "p"]]))).toBe(0);
  });
});
