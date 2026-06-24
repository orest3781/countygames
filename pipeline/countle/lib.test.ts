import { describe, it, expect } from "vitest";
import {
  percentileRank,
  formatPopulation,
  formatMoney,
  formatArea,
  formatDisasters,
  formatLifeExpectancy,
  formatEducation,
} from "./lib";

describe("percentileRank", () => {
  it("ranks ascending, clamps 1-100, nulls become 10", () => {
    expect(percentileRank([10, 20, 30, null])).toEqual([33, 67, 100, 10]);
  });
  it("handles a single value as 100", () => {
    expect(percentileRank([42])).toEqual([100]);
  });
  it("treats NaN like null", () => {
    expect(percentileRank([NaN, 5])).toEqual([10, 100]);
  });
});

describe("formatters", () => {
  it("formatPopulation", () => {
    expect(formatPopulation(1_500_000)).toBe("1.50M");
    expect(formatPopulation(2500)).toBe("2.5K");
    expect(formatPopulation(300)).toBe("300");
    expect(formatPopulation(null)).toBe("N/A");
  });
  it("formatMoney (Census -666666666 sentinel = N/A)", () => {
    expect(formatMoney(54300)).toBe("$54,300");
    expect(formatMoney(-666666666)).toBe("N/A");
    expect(formatMoney(null)).toBe("N/A");
  });
  it("formatArea", () => {
    expect(formatArea(4753)).toBe("4,753 sq mi");
    expect(formatArea(null)).toBe("N/A");
  });
  it("formatDisasters", () => {
    expect(formatDisasters(12)).toBe("12 declared");
    expect(formatDisasters(0)).toBe("0 declared");
    expect(formatDisasters(null)).toBe("0 declared");
  });
  it("formatLifeExpectancy", () => {
    expect(formatLifeExpectancy(78.5)).toBe("78.5 yr life exp");
    expect(formatLifeExpectancy(null)).toBe("N/A");
  });
  it("formatEducation", () => {
    expect(formatEducation(32.4)).toBe("32% bachelor's+");
    expect(formatEducation(null)).toBe("N/A");
  });
});
