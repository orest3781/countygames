import { describe, it, expect } from "vitest";
import { groupIndexOf, evaluateSubmission, shareRow, buildShareText } from "./game";
import type { ConnectionsPuzzle } from "./types";

const p: ConnectionsPuzzle = { id: 1, groups: [
  { label: "A", color: "yellow", fips: ["00001", "00002", "00003", "00004"] },
  { label: "B", color: "green",  fips: ["00005", "00006", "00007", "00008"] },
  { label: "C", color: "blue",   fips: ["00009", "00010", "00011", "00012"] },
  { label: "D", color: "purple", fips: ["00013", "00014", "00015", "00016"] },
] };

describe("groupIndexOf", () => {
  it("finds the group, or -1", () => {
    expect(groupIndexOf(p, "00006")).toBe(1);
    expect(groupIndexOf(p, "99999")).toBe(-1);
  });
});

describe("evaluateSubmission", () => {
  it("all four from one group → correct + color", () => {
    const r = evaluateSubmission(p, ["00001", "00002", "00003", "00004"]);
    expect(r).toEqual({ kind: "correct", color: "yellow", groupIndex: 0 });
  });
  it("three from one group, one other → one-away", () => {
    expect(evaluateSubmission(p, ["00001", "00002", "00003", "00009"]).kind).toBe("one-away");
  });
  it("a 2-2 split → wrong", () => {
    expect(evaluateSubmission(p, ["00001", "00002", "00009", "00010"]).kind).toBe("wrong");
  });
});

describe("shareRow", () => {
  it("maps each card to its true group color emoji", () => {
    // one from each group → yellow green blue purple
    expect(shareRow(p, ["00001", "00005", "00009", "00013"])).toBe("🟨🟩🟦🟪");
  });
});

describe("buildShareText", () => {
  it("solved header + rows + footer", () => {
    const rows = ["🟩🟩🟩🟩", "🟨🟦🟨🟨", "🟨🟨🟨🟨"];
    expect(buildShareText({ puzzleNumber: 12, solved: true, mistakes: 1, rows })).toBe(
      ["County Connections #12", "🟩🟩🟩🟩", "🟨🟦🟨🟨", "🟨🟨🟨🟨", "county.games"].join("\n")
    );
  });
  it("failed header notes it", () => {
    expect(buildShareText({ puzzleNumber: 12, solved: false, mistakes: 4, rows: [] }).split("\n")[0])
      .toBe("County Connections #12 — missed");
  });
});
