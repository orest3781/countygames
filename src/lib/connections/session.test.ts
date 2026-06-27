import { describe, it, expect } from "vitest";
import { buildConnectionsView, applySubmission } from "./session";
import { initialState } from "./state";
import type { ConnectionsPayload, ConnectionsPuzzle } from "./types";
import type { CountiesPayload } from "../countle/types";
import { buildDataset } from "../countle/data";

// A puzzle whose 4 groups map to 16 synthetic counties.
const PUZZLE: ConnectionsPuzzle = {
  id: 1,
  groups: [
    { label: "Group Y", color: "yellow", fips: ["00001", "00002", "00003", "00004"] },
    { label: "Group G", color: "green", fips: ["00005", "00006", "00007", "00008"] },
    { label: "Group B", color: "blue", fips: ["00009", "00010", "00011", "00012"] },
    { label: "Group P", color: "purple", fips: ["00013", "00014", "00015", "00016"] },
  ],
};
const payload: ConnectionsPayload = { schemaVersion: 1, generatedAt: "x", count: 1, puzzles: [PUZZLE] };

// Minimal counties.json covering the 16 fips.
function mkCounties(): CountiesPayload {
  const counties: Record<string, any> = {};
  for (let i = 1; i <= 16; i++) {
    const fips = String(i).padStart(5, "0");
    counties[fips] = {
      fips, name: `Test${i} County`, state_abbr: "ZZ", state_name: "ZState",
      region: "Midwest", county_seat: "Seat", lat: 0, lng: 0,
      stats: { wealth: 50, health: 50, people: 50, land: 50, danger: 50, education: 50 },
      rarity: "common", isAnswerPool: true,
    };
  }
  return { schemaVersion: 1, generatedAt: "x", count: 16, counties } as unknown as CountiesPayload;
}
const dataset = buildDataset(mkCounties());
const DATE = "2026-06-26";

describe("buildConnectionsView", () => {
  it("on a fresh state: 0 solved, 16 remaining, labels formatted, 4 mistakes left", () => {
    const v = buildConnectionsView(payload, dataset, initialState(), DATE);
    expect(v.solvedGroups).toHaveLength(0);
    expect(v.remainingFips).toHaveLength(16);
    expect([...v.remainingFips].sort()).toEqual(PUZZLE.groups.flatMap((g) => g.fips).sort());
    expect(v.mistakesLeft).toBe(4);
    expect(v.finished).toBe(false);
    // label of fips 00001 = "Test1, ZZ"
    const card = v.unsolvedGroups.flatMap((g) => g.cards).find((c) => c.fips === "00001");
    expect(card?.label).toBe("Test1, ZZ");
  });

  it("after solving the yellow group: it appears in solvedGroups and is removed from remaining", () => {
    let s = initialState();
    const r = applySubmission(payload, s, DATE, ["00001", "00002", "00003", "00004"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    const v = buildConnectionsView(payload, dataset, s, DATE);
    expect(v.solvedGroups.map((g) => g.color)).toEqual(["yellow"]);
    expect(v.remainingFips).toHaveLength(12);
    expect(v.remainingFips).not.toContain("00001");
  });
});

describe("applySubmission", () => {
  it("rejects a set that is not exactly 4 distinct fips", () => {
    expect(applySubmission(payload, initialState(), DATE, ["00001", "00002", "00003"]).ok).toBe(false);
    expect(applySubmission(payload, initialState(), DATE, ["00001", "00001", "00002", "00003"]).ok).toBe(false);
  });

  it("correct submission records the solved color without a mistake", () => {
    const r = applySubmission(payload, initialState(), DATE, ["00005", "00006", "00007", "00008"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.kind).toBe("correct");
    expect(r.state.today!.solvedColors).toEqual(["green"]);
    expect(r.state.today!.mistakes).toBe(0);
  });

  it("a 3-of-4 wrong submission is one-away and costs a mistake", () => {
    const r = applySubmission(payload, initialState(), DATE, ["00001", "00002", "00003", "00005"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.kind).toBe("one-away");
    expect(r.state.today!.mistakes).toBe(1);
  });

  it("rejects a duplicate submission set (order-insensitive) without recording", () => {
    let s = initialState();
    const first = applySubmission(payload, s, DATE, ["00001", "00002", "00003", "00005"]);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    s = first.state;
    const dup = applySubmission(payload, s, DATE, ["00005", "00003", "00002", "00001"]);
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.reason).toBe("duplicate");
  });

  it("four mistakes finishes the game as a loss; further submissions are rejected", () => {
    let s = initialState();
    const wrongs = [
      ["00001", "00002", "00003", "00005"],
      ["00001", "00002", "00003", "00006"],
      ["00001", "00002", "00003", "00007"],
      ["00001", "00002", "00003", "00008"],
    ];
    for (const w of wrongs) {
      const r = applySubmission(payload, s, DATE, w);
      expect(r.ok).toBe(true);
      if (r.ok) s = r.state;
    }
    expect(s.today!.finished).toBe(true);
    expect(s.today!.won).toBe(false);
    const after = applySubmission(payload, s, DATE, ["00009", "00010", "00011", "00012"]);
    expect(after.ok).toBe(false);
    if (after.ok) return;
    expect(after.reason).toBe("finished");
  });
});
