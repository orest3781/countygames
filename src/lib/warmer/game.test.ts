import { describe, it, expect } from "vitest";
import { heatTier, isSolved, evaluateGuess, guessBucket, GUESS_BUCKETS } from "./game";
import type { CountyEntry } from "../countle/types";

function county(over: Partial<CountyEntry> & { fips: string; lat: number; lng: number }): CountyEntry {
  return {
    name: "Test County", state_abbr: "ZZ", state_name: "Zedland", region: "Midwest",
    county_seat: "Seat", stats: { wealth: 50, health: 50, people: 50, land: 50, danger: 50, education: 50 },
    display: { wealth: "", health: "", people: "", land: "", danger: "", education: "" },
    rarity: "common", hasArt: false, isAnswerPool: true, notable_person: null, notable_person_desc: null, flavor: null,
    ...over,
  };
}

describe("heatTier", () => {
  it("maps distance bands to tiers (boundaries inclusive-low/exclusive-high)", () => {
    expect(heatTier(0)).toBe("found");
    expect(heatTier(50)).toBe("hot");
    expect(heatTier(74.9)).toBe("hot");
    expect(heatTier(75)).toBe("warm");
    expect(heatTier(249.9)).toBe("warm");
    expect(heatTier(250)).toBe("tepid");
    expect(heatTier(699.9)).toBe("tepid");
    expect(heatTier(700)).toBe("cold");
    expect(heatTier(3000)).toBe("cold");
  });
});

describe("isSolved", () => {
  it("is true only when the fips matches the target", () => {
    const t = county({ fips: "17031", lat: 41.8, lng: -87.7 });
    expect(isSolved(t, "17031")).toBe(true);
    expect(isSolved(t, "06037")).toBe(false);
  });
});

describe("evaluateGuess", () => {
  const target = county({ fips: "17031", lat: 40.0, lng: -89.0 }); // central IL

  it("returns found / 0 miles when guessing the target itself", () => {
    const fb = evaluateGuess(target, target);
    expect(fb.tier).toBe("found");
    expect(fb.miles).toBe(0);
    expect(fb.fips).toBe("17031");
  });

  it("a ~48-mile guess is hot", () => {
    const g = county({ fips: "00001", lat: 40.7, lng: -89.0 }); // ~48 mi north
    const fb = evaluateGuess(target, g);
    expect(fb.tier).toBe("hot");
    expect(fb.miles).toBeGreaterThan(40);
    expect(fb.miles).toBeLessThan(60);
  });

  it("a ~138-mile guess is warm", () => {
    const g = county({ fips: "00002", lat: 42.0, lng: -89.0 }); // ~138 mi north
    const fb = evaluateGuess(target, g);
    expect(fb.tier).toBe("warm");
  });

  it("a cross-country guess is cold with a sensible westward arrow", () => {
    const la = county({ fips: "06037", lat: 34.0, lng: -118.2 });
    const fb = evaluateGuess(target, la);          // from LA toward central IL → east-ish
    expect(fb.tier).toBe("cold");
    expect(fb.miles).toBeGreaterThan(1400);
    expect(["→", "↗", "↘"]).toContain(fb.arrow);   // generally eastward
    expect(fb.bearingDeg).toBeGreaterThan(0);
  });
});

describe("guessBucket", () => {
  it("buckets a solve's guess count", () => {
    expect(GUESS_BUCKETS).toEqual(["1-3", "4-6", "7-9", "10+"]);
    expect(guessBucket(1)).toBe("1-3");
    expect(guessBucket(3)).toBe("1-3");
    expect(guessBucket(4)).toBe("4-6");
    expect(guessBucket(9)).toBe("7-9");
    expect(guessBucket(10)).toBe("10+");
    expect(guessBucket(25)).toBe("10+");
  });
});
