import { describe, it, expect } from "vitest";
import { warmerDateKey, getDailyTarget } from "./daily";
import { getDailyCounty } from "../countle/daily";
import type { CountyEntry, Dataset } from "../countle/types";

function mk(fips: string): CountyEntry {
  return {
    fips, name: `C${fips}`, state_abbr: "ZZ", state_name: "Zed", region: "Midwest", county_seat: null,
    lat: 40, lng: -89, stats: { wealth: 50, health: 50, people: 50, land: 50, danger: 50, education: 50 },
    display: { wealth: "", health: "", people: "", land: "", danger: "", education: "" },
    rarity: "common", hasArt: false, isAnswerPool: true, notable_person: null, notable_person_desc: null, flavor: null,
  };
}
function dataset(fipsList: string[]): Dataset {
  const all = fipsList.map(mk);
  return { byFips: new Map(all.map((c) => [c.fips, c])), all, answerPoolFips: [...fipsList].sort() };
}

describe("warmerDateKey", () => {
  it("salts the date key", () => {
    expect(warmerDateKey("2026-06-27")).toBe("2026-06-27:warmer");
  });
});

describe("getDailyTarget", () => {
  const ds = dataset(["01001", "06037", "17031", "48201", "48453", "53033"]);

  it("returns a county from the answer pool, deterministically", () => {
    const a = getDailyTarget(ds, "2026-06-27");
    const b = getDailyTarget(ds, "2026-06-27");
    expect(a.fips).toBe(b.fips);
    expect(ds.answerPoolFips).toContain(a.fips);
  });

  it("diverges from Countle's unsalted daily pick on at least one of several days", () => {
    const days = ["2026-06-27", "2026-06-28", "2026-06-29", "2026-06-30", "2026-07-01"];
    const anyDifferent = days.some((d) => getDailyTarget(ds, d).fips !== getDailyCounty(ds, d).fips);
    expect(anyDifferent).toBe(true);
  });
});
