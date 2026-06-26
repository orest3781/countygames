import { describe, it, expect } from "vitest";
import { getDailyPuzzle, puzzleCards, dailyCardOrder } from "./daily";
import type { ConnectionsPayload, ConnectionsPuzzle } from "./types";

function puzzle(id: number, base: number): ConnectionsPuzzle {
  const f = (n: number) => String(base + n).padStart(5, "0");
  return { id, groups: [
    { label: "A", color: "yellow", fips: [f(0), f(1), f(2), f(3)] },
    { label: "B", color: "green",  fips: [f(4), f(5), f(6), f(7)] },
    { label: "C", color: "blue",   fips: [f(8), f(9), f(10), f(11)] },
    { label: "D", color: "purple", fips: [f(12), f(13), f(14), f(15)] },
  ] };
}
const payload: ConnectionsPayload = { schemaVersion: 1, generatedAt: "x", count: 3,
  puzzles: [puzzle(1, 1000), puzzle(2, 2000), puzzle(3, 3000)] };

describe("getDailyPuzzle", () => {
  it("is deterministic and in range", () => {
    const a = getDailyPuzzle(payload, "2026-06-26");
    const b = getDailyPuzzle(payload, "2026-06-26");
    expect(a.id).toBe(b.id);
    expect([1, 2, 3]).toContain(a.id);
  });
});

describe("puzzleCards", () => {
  it("returns all 16 fips", () => {
    expect(puzzleCards(puzzle(1, 1000))).toHaveLength(16);
  });
});

describe("dailyCardOrder", () => {
  it("is a deterministic permutation of the 16 cards", () => {
    const p = puzzle(1, 1000);
    const a = dailyCardOrder(p, "2026-06-26");
    const b = dailyCardOrder(p, "2026-06-26");
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([...puzzleCards(p)].sort());
  });
  it("usually does NOT leave the cards grouped (shuffled)", () => {
    const p = puzzle(1, 1000);
    expect(dailyCardOrder(p, "2026-06-26")).not.toEqual(puzzleCards(p));
  });
});
