import { describe, it, expect } from "vitest";
import { countyStatus, regionProgress, statsSummary } from "./collection";
import { buildDataset } from "./data";
import { initialState } from "./state";
import type { CountiesPayload, CountyEntry, StatKey, CountleState } from "./types";

function county(fips: string, region: string, pool: boolean): CountyEntry {
  const z: Record<StatKey, number> = { wealth: 1, health: 1, people: 1, land: 1, danger: 1, education: 1 };
  return { fips, name: fips, state_abbr: "XX", state_name: "X", region, county_seat: null, lat: 0, lng: 0,
    stats: z, display: { wealth: "", health: "", people: "", land: "", danger: "", education: "" },
    rarity: "common", hasArt: false, isAnswerPool: pool, notable_person: null, notable_person_desc: null, flavor: null };
}
const payload: CountiesPayload = { schemaVersion: 1, generatedAt: "x", count: 4, answerPoolCount: 3,
  counties: {
    "06037": county("06037", "Pacific", true),
    "06075": county("06075", "Pacific", true),
    "04013": county("04013", "Southwest", true),
    "99999": county("99999", "Pacific", false),
  } };
const ds = buildDataset(payload);

describe("countyStatus", () => {
  const s: CountleState = { ...initialState(), solvedCounties: ["06037"], encounteredCounties: ["06037", "17031"] };
  it("solved > encountered > untouched", () => {
    expect(countyStatus(s, "06037")).toBe("solved");
    expect(countyStatus(s, "17031")).toBe("encountered");
    expect(countyStatus(s, "99999")).toBe("untouched");
  });
});

describe("regionProgress", () => {
  it("counts solved answer-pool counties per region over the region total", () => {
    const s: CountleState = { ...initialState(), solvedCounties: ["06037"] };
    const rp = regionProgress(ds, s);
    const pacific = rp.find((r) => r.region === "Pacific")!;
    const sw = rp.find((r) => r.region === "Southwest")!;
    expect(pacific).toEqual({ region: "Pacific", solved: 1, total: 2 }); // 06037 solved of {06037,06075}; 99999 not in pool
    expect(sw).toEqual({ region: "Southwest", solved: 0, total: 1 });
  });
});

describe("statsSummary", () => {
  it("computes wins, winPct, maxBucket from distribution + fails", () => {
    const s: CountleState = { ...initialState(), gamesPlayed: 5, fails: 1, guessDistribution: [1, 0, 2, 1, 0, 0], streak: 2, maxStreak: 3 };
    const sum = statsSummary(s);
    expect(sum.played).toBe(5);
    expect(sum.wins).toBe(4);           // 1+0+2+1
    expect(sum.winPct).toBe(80);        // 4/5
    expect(sum.maxBucket).toBe(2);
    expect(sum.currentStreak).toBe(2);
    expect(sum.maxStreak).toBe(3);
  });
  it("winPct is 0 when nothing played", () => {
    expect(statsSummary(initialState()).winPct).toBe(0);
    expect(statsSummary(initialState()).maxBucket).toBe(1); // never 0 (avoids divide-by-zero in bars)
  });
});
