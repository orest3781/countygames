import { describe, it, expect } from "vitest";
import { validatePayload } from "./validate";

const goodEntry = {
  fips: "06037", name: "Los Angeles County", state_abbr: "CA", state_name: "California",
  region: "Pacific", county_seat: "Los Angeles", lat: 34.1, lng: -118.2,
  stats: { wealth: 60, health: 45, people: 100, land: 78, danger: 92, education: 55 },
  display: { wealth: "$70,000", health: "80.0 yr life exp", people: "9.83M", land: "4,058 sq mi", danger: "20 declared", education: "33% bachelor's+" },
  rarity: "legendary", hasArt: true, isAnswerPool: true,
  notable_person: null, notable_person_desc: null, flavor: null,
};

describe("validatePayload", () => {
  it("accepts a well-formed payload", () => {
    const res = validatePayload({ schemaVersion: 1, generatedAt: "2026-06-24T00:00:00Z", count: 1, answerPoolCount: 1, counties: { "06037": goodEntry } });
    expect(res.ok).toBe(true);
  });
  it("rejects an out-of-range stat", () => {
    const bad = { ...goodEntry, stats: { ...goodEntry.stats, wealth: 150 } };
    const res = validatePayload({ schemaVersion: 1, generatedAt: "x", count: 1, answerPoolCount: 1, counties: { "06037": bad } });
    expect(res.ok).toBe(false);
  });
  it("accepts an answer-pool county without art (art is optional)", () => {
    const ok = { ...goodEntry, isAnswerPool: true, hasArt: false };
    const res = validatePayload({ schemaVersion: 1, generatedAt: "x", count: 1, answerPoolCount: 1, counties: { "06037": ok } });
    expect(res.ok).toBe(true);
  });
});
