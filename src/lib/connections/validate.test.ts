import { describe, it, expect } from "vitest";
import { validateConnections } from "./validate";

const goodPuzzle = { id: 1, groups: [
  { label: "A", color: "yellow", fips: ["00001", "00002", "00003", "00004"] },
  { label: "B", color: "green",  fips: ["00005", "00006", "00007", "00008"] },
  { label: "C", color: "blue",   fips: ["00009", "00010", "00011", "00012"] },
  { label: "D", color: "purple", fips: ["00013", "00014", "00015", "00016"] },
] };
const payload = (p: unknown) => ({ schemaVersion: 1, generatedAt: "x", count: 1, puzzles: [p] });

describe("validateConnections", () => {
  it("accepts a well-formed pool", () => {
    expect(validateConnections(payload(goodPuzzle)).ok).toBe(true);
  });
  it("rejects a puzzle without exactly 4 groups", () => {
    const bad = { ...goodPuzzle, groups: goodPuzzle.groups.slice(0, 3) };
    expect(validateConnections(payload(bad)).ok).toBe(false);
  });
  it("rejects a group without exactly 4 fips", () => {
    const bad = { ...goodPuzzle, groups: [{ ...goodPuzzle.groups[0], fips: ["00001", "00002", "00003"] }, ...goodPuzzle.groups.slice(1)] };
    expect(validateConnections(payload(bad)).ok).toBe(false);
  });
  it("rejects a puzzle with duplicate fips across groups", () => {
    const bad = { ...goodPuzzle, groups: [{ ...goodPuzzle.groups[0], fips: ["00005", "00002", "00003", "00004"] }, ...goodPuzzle.groups.slice(1)] };
    expect(validateConnections(payload(bad)).ok).toBe(false); // 00005 also in group B → only 15 distinct
  });
});
