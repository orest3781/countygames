import { describe, it, expect } from "vitest";
import { dateKeyUTC, prevDateKey, daysBetween, puzzleNumber, hashString, pickDailyFips, getDailyCounty } from "./daily";
import { buildDataset } from "./data";
import type { CountiesPayload, CountyEntry } from "./types";

describe("date utils", () => {
  it("dateKeyUTC formats UTC YYYY-MM-DD", () => {
    expect(dateKeyUTC(new Date("2026-06-25T23:59:00Z"))).toBe("2026-06-25");
    expect(dateKeyUTC(new Date("2026-12-01T00:00:00Z"))).toBe("2026-12-01");
  });
  it("prevDateKey crosses month boundary", () => {
    expect(prevDateKey("2026-07-01")).toBe("2026-06-30");
    expect(prevDateKey("2026-01-01")).toBe("2025-12-31");
  });
  it("daysBetween counts whole UTC days", () => {
    expect(daysBetween("2026-06-25", "2026-06-25")).toBe(0);
    expect(daysBetween("2026-06-25", "2026-06-28")).toBe(3);
  });
  it("puzzleNumber starts at 1 on epoch", () => {
    expect(puzzleNumber("2026-06-25")).toBe(1);
    expect(puzzleNumber("2026-06-26")).toBe(2);
  });
});

describe("daily selection", () => {
  it("hashString is deterministic and non-negative", () => {
    expect(hashString("2026-06-25")).toBe(hashString("2026-06-25"));
    expect(hashString("2026-06-25")).toBeGreaterThanOrEqual(0);
  });
  it("pickDailyFips is deterministic and in-pool", () => {
    const pool = ["01001", "06037", "17031", "36061"];
    const a = pickDailyFips(pool, "2026-06-25");
    const b = pickDailyFips(pool, "2026-06-25");
    expect(a).toBe(b);
    expect(pool).toContain(a);
  });
  it("different dates can select different counties across the pool", () => {
    const pool = ["01001", "06037", "17031", "36061", "48201"];
    const picks = new Set(Array.from({ length: 30 }, (_, i) => pickDailyFips(pool, `2026-07-${String(i + 1).padStart(2, "0")}`)));
    expect(picks.size).toBeGreaterThan(1);
  });
});

describe("getDailyCounty", () => {
  function entry(fips: string, pool: boolean): CountyEntry {
    return { fips, name: fips, state_abbr: "XX", state_name: "X", region: "Midwest", county_seat: null, lat: 0, lng: 0,
      stats: { wealth: 1, health: 1, people: 1, land: 1, danger: 1, education: 1 },
      display: { wealth: "", health: "", people: "", land: "", danger: "", education: "" },
      rarity: "common", hasArt: false, isAnswerPool: pool, notable_person: null, notable_person_desc: null, flavor: null };
  }
  const payload: CountiesPayload = { schemaVersion: 1, generatedAt: "x", count: 3, answerPoolCount: 2,
    counties: { "06037": entry("06037", true), "17031": entry("17031", true), "99999": entry("99999", false) } };
  it("only ever returns an answer-pool county", () => {
    const ds = buildDataset(payload);
    for (let i = 1; i <= 20; i++) {
      const c = getDailyCounty(ds, `2026-08-${String(i).padStart(2, "0")}`);
      expect(c.isAnswerPool).toBe(true);
    }
  });
});
