import { describe, it, expect } from "vitest";
import { compareStats, shareRow, blurForGuess } from "./feedback";
import type { CountyEntry, StatKey } from "./types";

function withStats(s: Record<StatKey, number>): CountyEntry {
  return { fips: "00000", name: "T", state_abbr: "XX", state_name: "X", region: "Midwest", county_seat: null, lat: 0, lng: 0,
    stats: s, display: { wealth: "", health: "", people: "", land: "", danger: "", education: "" },
    rarity: "common", hasArt: false, isAnswerPool: false, notable_person: null, notable_person_desc: null, flavor: null };
}

describe("compareStats", () => {
  const mystery = withStats({ wealth: 80, health: 50, people: 50, land: 50, danger: 50, education: 50 });
  const guess = withStats({ wealth: 40, health: 50, people: 55, land: 90, danger: 84, education: 78 });
  const fb = compareStats(mystery, guess);

  it("returns 6 entries in STAT_KEYS order", () => {
    expect(fb.map((f) => f.key)).toEqual(["wealth", "health", "people", "land", "danger", "education"]);
  });
  it("exposes the GUESS value, not the mystery value", () => {
    expect(fb[0].guessValue).toBe(40); // wealth guess
  });
  it("wealth: mystery higher by 40 → up, double arrow, far", () => {
    expect(fb[0].direction).toBe("up");
    expect(fb[0].magnitude).toBe(2);   // |40| > 33
    expect(fb[0].closeness).toBe("far");
  });
  it("health: equal → equal direction, close", () => {
    expect(fb[1].direction).toBe("equal");
    expect(fb[1].closeness).toBe("close"); // |0| ≤ 8
  });
  it("people: mystery lower by 5 → down, single, close", () => {
    expect(fb[2].direction).toBe("down");
    expect(fb[2].magnitude).toBe(1);
    expect(fb[2].closeness).toBe("close");
  });
  it("land: mystery lower by 40 → down, double, far", () => {
    expect(fb[3].direction).toBe("down");
    expect(fb[3].magnitude).toBe(2);
    expect(fb[3].closeness).toBe("far");
  });
  it("danger: mystery lower by 34 → down, double arrow, far", () => {
    expect(fb[4].direction).toBe("down");
    expect(fb[4].magnitude).toBe(2);   // |34| > 33
    expect(fb[4].closeness).toBe("far");
  });
  it("education: mystery lower by 28 → down, single arrow, near (yellow band)", () => {
    expect(fb[5].direction).toBe("down");
    expect(fb[5].magnitude).toBe(1);   // |28| ≤ 33
    expect(fb[5].closeness).toBe("near"); // 8 < 28 ≤ 33
  });
});

describe("shareRow", () => {
  it("maps closeness to 🟩/🟨/⬛", () => {
    const fb = compareStats(
      withStats({ wealth: 50, health: 50, people: 50, land: 50, danger: 50, education: 50 }),
      withStats({ wealth: 50, health: 70, people: 90, land: 50, danger: 50, education: 50 })
    );
    // wealth Δ0 close→🟩, health Δ20 near→🟨, people Δ40 far→⬛
    expect(shareRow(fb)).toBe("🟩🟨⬛🟩🟩🟩");
    expect([...shareRow(fb)].length).toBe(6);
  });
});

describe("compareStats threshold boundaries", () => {
  const base = { wealth: 50, health: 50, people: 50, land: 50, danger: 50, education: 50 };
  it("|delta| exactly 8 → close, single arrow", () => {
    const fb = compareStats(withStats({ ...base, wealth: 58 }), withStats(base));
    expect(fb[0].closeness).toBe("close"); // |8| ≤ 8
    expect(fb[0].magnitude).toBe(1);
  });
  it("|delta| exactly 33 → near, single arrow (not far, not double)", () => {
    const fb = compareStats(withStats({ ...base, wealth: 83 }), withStats(base));
    expect(fb[0].closeness).toBe("near"); // 8 < 33 ≤ 33
    expect(fb[0].magnitude).toBe(1);      // 33 is NOT > 33
  });
  it("|delta| exactly 34 → far, double arrow", () => {
    const fb = compareStats(withStats({ ...base, wealth: 84 }), withStats(base));
    expect(fb[0].closeness).toBe("far");
    expect(fb[0].magnitude).toBe(2);
  });
});

describe("blurForGuess", () => {
  it("steps down the schedule and clamps", () => {
    expect(blurForGuess(0)).toBe(24);
    expect(blurForGuess(3)).toBe(8);
    expect(blurForGuess(6)).toBe(0);
    expect(blurForGuess(99)).toBe(0);
  });
});
