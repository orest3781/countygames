import { describe, it, expect } from "vitest";
import {
  percentileRank,
  formatPopulation,
  formatMoney,
  formatArea,
  formatDisasters,
  formatLifeExpectancy,
  formatEducation,
  computeStatsAndRarity,
  STATE_CAPITAL_FIPS,
  ICONIC_FIPS,
  topNPopulousPerState,
  buildAnswerPool,
  type RawCounty,
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
    expect(formatPopulation(0)).toBe("0");
    expect(formatPopulation(null)).toBe("N/A");
  });
  it("formatMoney (Census -666666666 sentinel = N/A)", () => {
    expect(formatMoney(54300)).toBe("$54,300");
    expect(formatMoney(-666666666)).toBe("N/A");
    expect(formatMoney(0)).toBe("$0");
    expect(formatMoney(null)).toBe("N/A");
  });
  it("formatArea", () => {
    expect(formatArea(4753)).toBe("4,753 sq mi");
    expect(formatArea(0)).toBe("0 sq mi");
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

function blankRaw(fips: string): RawCounty {
  return {
    fips, name: `County ${fips}`, state_abbr: "XX", state_name: "X",
    land_area_sq_mi: null, population: null, median_household_income: null,
    gdp_total: null, gdp_per_capita: null, pct_bachelors_or_higher: null,
    unemployment_rate: null, life_expectancy: null,
    primary_care_physicians_rate: null, pct_uninsured: null,
    violent_crime_rate: null, total_disasters: null,
  };
}

describe("computeStatsAndRarity", () => {
  const rows: RawCounty[] = [
    { ...blankRaw("01001"), population: 100, median_household_income: 30000, gdp_per_capita: 20000, land_area_sq_mi: 100, pct_bachelors_or_higher: 10 },
    { ...blankRaw("01003"), population: 1000, median_household_income: 60000, gdp_per_capita: 60000, land_area_sq_mi: 500, pct_bachelors_or_higher: 40 },
    { ...blankRaw("01005"), population: 5000, median_household_income: 90000, gdp_per_capita: 90000, land_area_sq_mi: 2000, pct_bachelors_or_higher: 60 },
  ];
  const result = computeStatsAndRarity(rows);

  it("returns one entry per input keyed by fips", () => {
    expect(result.size).toBe(3);
    expect(result.has("01005")).toBe(true);
  });
  it("all stats are integers within 1-100", () => {
    for (const { stats } of result.values()) {
      for (const v of Object.values(stats)) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
  it("richer county ranks higher on wealth", () => {
    expect(result.get("01005")!.stats.wealth).toBeGreaterThan(result.get("01001")!.stats.wealth);
  });
  it("assigns the top total-score county the highest rarity tier", () => {
    expect(result.get("01005")!.rarity).toBe("legendary");
    expect(result.get("01001")!.rarity).toBe("common");
  });
});

describe("answer pool", () => {
  it("has 51 capitals and 40 iconic", () => {
    expect(STATE_CAPITAL_FIPS.length).toBe(51);
    expect(ICONIC_FIPS.length).toBe(40);
  });

  it("topNPopulousPerState picks the n largest per state", () => {
    const pop = new Map<string, number>([
      ["01001", 100], ["01003", 300], ["01005", 200], // AL
      ["02001", 50], // AK
    ]);
    const top2 = topNPopulousPerState(pop, 2);
    expect(top2.has("01003")).toBe(true); // largest AL
    expect(top2.has("01005")).toBe(true); // 2nd AL
    expect(top2.has("01001")).toBe(false); // 3rd AL excluded
    expect(top2.has("02001")).toBe(true); // only AK
  });

  it("buildAnswerPool = (capitals ∪ iconic ∪ top5pop) ∩ allFips", () => {
    const pop = new Map<string, number>([["04013", 4_000_000]]); // Maricopa (capital+iconic)
    const pool = buildAnswerPool({ allFips: ["04013", "01001"], populationByFips: pop });
    expect(pool.has("04013")).toBe(true);  // famous
    expect(pool.has("01001")).toBe(false); // not famous
  });

  it("includes a famous county regardless of art availability", () => {
    const pool = buildAnswerPool({ allFips: ["36061"], populationByFips: new Map() }); // Manhattan, art-optional
    expect(pool.has("36061")).toBe(true);
  });

  it("excludes a famous county absent from allFips", () => {
    const pool = buildAnswerPool({ allFips: [], populationByFips: new Map([["04013", 4_000_000]]) });
    expect(pool.has("04013")).toBe(false);
  });
});
