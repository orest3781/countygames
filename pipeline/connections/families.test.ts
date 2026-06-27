import { describe, it, expect } from "vitest";
import { bareName, buildCandidateGroups } from "./families";
import type { CountyEntry, StatKey } from "../../src/lib/countle/types";

function county(fips: string, name: string, st: string, stateName: string, region: string): CountyEntry {
  const z: Record<StatKey, number> = { wealth: 1, health: 1, people: 1, land: 1, danger: 1, education: 1 };
  return { fips, name, state_abbr: st, state_name: stateName, region, county_seat: null, lat: 0, lng: 0,
    stats: z, display: { wealth: "", health: "", people: "", land: "", danger: "", education: "" },
    rarity: "common", hasArt: false, isAnswerPool: true, notable_person: null, notable_person_desc: null, flavor: null };
}

describe("bareName", () => {
  it("strips county-type suffixes", () => {
    expect(bareName("Cook County")).toBe("Cook");
    expect(bareName("Orleans Parish")).toBe("Orleans");
    expect(bareName("North Slope Borough")).toBe("North Slope");
    expect(bareName("Carson City")).toBe("Carson"); // " City" stripped
  });
});

describe("buildCandidateGroups", () => {
  // 4 Texas (Southwest), 4 Pacific (CA), 4 capitals, 4 named Washington (across states)
  const counties: CountyEntry[] = [
    county("48001", "Travis County", "TX", "Texas", "Southwest"),
    county("48002", "Harris County", "TX", "Texas", "Southwest"),
    county("48003", "Dallas County", "TX", "Texas", "Southwest"),
    county("48004", "Bexar County", "TX", "Texas", "Southwest"),
    county("06001", "Alameda County", "CA", "California", "Pacific"),
    county("06002", "Sonoma County", "CA", "California", "Pacific"),
    county("06003", "Marin County", "CA", "California", "Pacific"),
    county("06004", "Napa County", "CA", "California", "Pacific"),
    county("11001", "Washington County", "AA", "Alpha", "Northeast"),
    county("22001", "Washington County", "BB", "Beta", "South"),
    county("33001", "Washington County", "CC", "Gamma", "Midwest"),
    county("44001", "Washington County", "DD", "Delta", "Mountain"),
  ];
  const caps = new Set(["48001", "06001", "11001", "22001"]); // 4 capitals across the set
  const groups = buildCandidateGroups(counties, caps);

  it("emits a same-state group for Texas with its 4 members", () => {
    const tx = groups.find((g) => g.key === "state:TX")!;
    expect(tx.family).toBe("sameState");
    expect(tx.members.sort()).toEqual(["48001", "48002", "48003", "48004"]);
    expect(tx.predicate(counties[0])).toBe(true);
    expect(tx.predicate(counties[4])).toBe(false); // a CA county
  });
  it("emits a same-region group for Pacific", () => {
    expect(groups.find((g) => g.key === "region:Pacific")!.members).toHaveLength(4);
  });
  it("emits a single state-capitals group with the 4 capital members", () => {
    const cap = groups.find((g) => g.key === "capitals")!;
    expect(cap.members.sort()).toEqual(["06001", "11001", "22001", "48001"]);
    expect(cap.predicate(counties[0])).toBe(true);
  });
  it("emits a shared-name group for Washington (>=4 states)", () => {
    const wn = groups.find((g) => g.key === "name:Washington")!;
    expect(wn.family).toBe("sharedName");
    expect(wn.members).toHaveLength(4);
  });
  it("does NOT emit a same-state group for a state with <4 famous counties", () => {
    expect(groups.find((g) => g.key === "state:AA")).toBeUndefined();
  });
});

describe("buildCandidateGroups — presidentName", () => {
  // 5 president-named counties across distinct states/fips, plus one non-president county.
  const presidentCounties: CountyEntry[] = [
    county("01001", "Washington County", "VA", "Virginia", "South"),
    county("02001", "Jefferson County", "CO", "Colorado", "Mountain"),
    county("03001", "Lincoln County", "NM", "New Mexico", "Southwest"),
    county("04001", "Madison County", "NY", "New York", "Northeast"),
    county("05001", "Monroe County", "MI", "Michigan", "Midwest"),
    county("06001", "Greene County",  "OH", "Ohio",     "Midwest"), // not a president
  ];

  const groups = buildCandidateGroups(presidentCounties, new Set());

  it("emits a presidentName group when >=4 famous counties have president surnames", () => {
    const pg = groups.find((g) => g.family === "presidentName");
    expect(pg).toBeDefined();
    expect(pg!.members.length).toBeGreaterThanOrEqual(4);
  });

  it("presidentName predicate returns true for a president-named county and false for a non-president one", () => {
    const pg = groups.find((g) => g.family === "presidentName")!;
    expect(pg.predicate(presidentCounties[0])).toBe(true);  // Washington County → true
    expect(pg.predicate(presidentCounties[5])).toBe(false); // Greene County → false
  });
});
