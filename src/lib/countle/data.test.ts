import { describe, it, expect } from "vitest";
import { buildDataset, searchCounties } from "./data";
import type { CountiesPayload, CountyEntry } from "./types";

function county(fips: string, name: string, st: string, people = 50, pool = false): CountyEntry {
  return {
    fips, name, state_abbr: st, state_name: st, region: "Midwest", county_seat: null,
    lat: 0, lng: 0,
    stats: { wealth: 50, health: 50, people, land: 50, danger: 50, education: 50 },
    display: { wealth: "", health: "", people: "", land: "", danger: "", education: "" },
    rarity: "common", hasArt: false, isAnswerPool: pool,
    notable_person: null, notable_person_desc: null, flavor: null,
  };
}

const payload: CountiesPayload = {
  schemaVersion: 1, generatedAt: "x", count: 4, answerPoolCount: 2,
  counties: {
    "17031": county("17031", "Cook County", "IL", 90, true),
    "06037": county("06037", "Los Angeles County", "CA", 100, true),
    "53061": county("53061", "Washington County", "WA", 40),
    "49053": county("49053", "Washington County", "UT", 30),
  },
};

describe("buildDataset", () => {
  const ds = buildDataset(payload);
  it("indexes by fips", () => {
    expect(ds.byFips.get("06037")!.name).toBe("Los Angeles County");
    expect(ds.all.length).toBe(4);
  });
  it("answer pool is sorted by fips ascending", () => {
    expect(ds.answerPoolFips).toEqual(["06037", "17031"]);
  });
});

describe("searchCounties", () => {
  const ds = buildDataset(payload);
  it("returns empty for blank query", () => {
    expect(searchCounties(ds, "  ")).toEqual([]);
  });
  it("matches by name, case-insensitive, prefix ranked ahead of substring", () => {
    const ds2 = buildDataset({
      schemaVersion: 1, generatedAt: "x", count: 2, answerPoolCount: 1,
      counties: {
        "06037": county("06037", "Los Angeles County", "CA", 100, true),
        "06038": county("06038", "East Los Angeles Township", "CA", 200),
      },
    });
    const r = searchCounties(ds2, "los angeles");
    expect(r.length).toBeGreaterThan(1);
    expect(r[0].fips).toBe("06037"); // prefix beats substring even though East LA has higher population
  });
  it("returns all same-name counties, disambiguable by state", () => {
    const r = searchCounties(ds, "washington");
    const states = r.map((c) => c.state_abbr).sort();
    expect(states).toEqual(["UT", "WA"]);
  });
  it("respects the limit", () => {
    expect(searchCounties(ds, "county", 1).length).toBe(1);
  });
});
