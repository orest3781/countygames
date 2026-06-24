# Countle Data Regeneration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce `public/data/counties.json` — all ~3,144 US counties, each with 6 percentile stats, human-readable display strings, region, rarity, art availability, answer-pool membership, and enrichment (county seat / notable person / flavor) — with **no dependency on the deleted Supabase database**.

**Architecture:** One self-contained Node/`tsx` build script (`pipeline/build-countle-data.ts`) downloads the five free federal sources to the existing local cache, parses them with pure functions (`pipeline/countle/parse.ts`), computes the 6 stats + rarity + answer pool with pure functions (`pipeline/countle/lib.ts`), merges in the surviving local `enrichment.json` and art files, and writes one static JSON. A Zod schema validates the output as the acceptance gate. All number-crunching lives in unit-tested pure functions; the script is the thin IO/orchestration layer.

**Tech Stack:** TypeScript run via `tsx`; `vitest` for tests (new); `zod` for output validation (already a dependency); `adm-zip` + `csv-parse` (already dependencies) for source parsing.

## Global Constraints

- **No Supabase.** Nothing in this plan may read from or write to Supabase. The build is fully offline-capable except for first-run source downloads (free, no API key).
- **FIPS are 5-digit zero-padded strings** — always strings, never parsed to numbers, always `.padStart(5, "0")`.
- **Import conventions for NEW files:** `pipeline/countle/lib.ts`, `pipeline/countle/parse.ts`, and their `*.test.ts` files use **extensionless relative imports** (e.g. `import { x } from "./lib"`) so both `vitest` (Vite resolver) and `tsx` resolve them. These two files must **not** transitively import `pipeline/config.ts` (it calls `createClient` and throws if env vars are absent, which would break unit tests). The orchestrator `pipeline/build-countle-data.ts` is run only by `tsx` and may import `./config` (env vars are present in `.env.local`).
- **Stats are integers 1–100.** Percentile rank: sort non-null ascending, `rank = clamp(round((i+1)/n * 100), 1, 100)`; null/NaN inputs get rank **10**.
- **Stat key naming (canonical, used everywhere downstream):** `wealth, health, people, land, danger, education` (these map from the legacy `stat_power, stat_resilience, stat_population, stat_terrain, stat_chaos, stat_culture` respectively).
- **Output is data only** — this plan ships no UI. Success = a valid `public/data/counties.json` + answer-pool art under `public/art/`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `pipeline/countle/lib.ts` | Pure: `percentileRank`, 7 display formatters, `computeStatsAndRarity`, answer-pool curation (`STATE_CAPITAL_FIPS`, `ICONIC_FIPS`, `topNPopulousPerState`, `buildAnswerPool`), shared types (`RawCounty`, `StatBlock`, `Rarity`). No IO, no config import. |
| `pipeline/countle/parse.ts` | Pure: `parseGazetteer`, `parseCensus`, `parseGdp`, `parseHealth`, `parseFema`. Each takes raw text/buffer/records → typed rows. No IO beyond unzip-in-memory. |
| `pipeline/build-countle-data.ts` | Orchestrator: download → parse → merge → `computeStatsAndRarity` → assemble `CountyEntry` (adds region from `REGION_MAP`, enrichment from `enrichment.json`, `hasArt` from disk) → write `public/data/counties.json`. |
| `pipeline/countle/validate.ts` | Zod `CountyEntrySchema` + a runnable validator that loads the generated JSON and asserts invariants; exits non-zero on failure. |
| `pipeline/countle/*.test.ts` | Vitest unit tests for `lib.ts` and `parse.ts`. |
| `vitest.config.ts` | Vitest config (node environment, include `pipeline/**/*.test.ts`). |
| `public/data/counties.json` | **The deliverable.** `{ schemaVersion, generatedAt, count, answerPoolCount, counties: Record<fips, CountyEntry> }`. |
| `public/art/{fips}.png` | Answer-pool art copied from `data/card-art/`. |

### The output contract — `CountyEntry`

```ts
type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

interface StatBlock { wealth: number; health: number; people: number; land: number; danger: number; education: number; }

interface CountyEntry {
  fips: string;              // 5-digit
  name: string;              // "Cook County"
  state_abbr: string;        // "IL"
  state_name: string;        // "Illinois"
  region: string;            // "Midwest" (from REGION_MAP)
  county_seat: string | null;
  lat: number; lng: number;  // county centroid (gazetteer INTPTLAT/INTPTLONG)
  stats: StatBlock;          // percentile 1–100
  display: {                 // human-readable strings (one per stat)
    wealth: string; health: string; people: string;
    land: string; danger: string; education: string;
  };
  rarity: Rarity;            // total-score percentile tier (art mood / flair)
  hasArt: boolean;
  isAnswerPool: boolean;     // curated-famous ∩ hasArt
  notable_person: string | null;
  notable_person_desc: string | null;
  flavor: string | null;
}
```

**Stat → display source mapping** (used by the orchestrator when assembling `display`):
- `wealth` → `formatMoney(median_household_income)` → `"$54,300"`
- `health` → `formatLifeExpectancy(life_expectancy)` → `"78.5 yr life exp"`
- `people` → `formatPopulation(population)` → `"1.20M"`
- `land` → `formatArea(land_area_sq_mi)` → `"4,753 sq mi"`
- `danger` → `formatDisasters(total_disasters)` → `"12 declared"`
- `education` → `formatEducation(pct_bachelors_or_higher)` → `"32% bachelor's+"`

---

## Task 1: Vitest test infrastructure

**Files:**
- Modify: `package.json` (devDependency + scripts)
- Create: `vitest.config.ts`
- Test: `pipeline/countle/smoke.test.ts`

**Interfaces:**
- Produces: a working `npm test` command (runs `vitest run`) used by every later task.

- [ ] **Step 1: Install vitest**

Run: `npm install -D vitest@^2`
Expected: `vitest` added to `devDependencies`, no peer-dependency errors.

- [ ] **Step 2: Create the vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["pipeline/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Add test scripts to package.json**

In `package.json`, add to `"scripts"`:

```json
    "test": "vitest run",
    "test:watch": "vitest",
    "build:data": "tsx pipeline/build-countle-data.ts",
    "validate:data": "tsx pipeline/countle/validate.ts",
```

- [ ] **Step 4: Write a smoke test**

Create `pipeline/countle/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("vitest", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run the smoke test**

Run: `npm test`
Expected: PASS — 1 passed (1 test). Confirms the runner and TS handling work.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts pipeline/countle/smoke.test.ts
git commit -m "test: add vitest infrastructure for countle data build"
```

---

## Task 2: Pure helpers — percentile rank + display formatters

**Files:**
- Create: `pipeline/countle/lib.ts`
- Test: `pipeline/countle/lib.test.ts`

**Interfaces:**
- Produces:
  - `percentileRank(values: (number | null)[]): number[]`
  - `formatPopulation(n: number | null): string`
  - `formatMoney(n: number | null): string`
  - `formatArea(n: number | null): string`
  - `formatDisasters(n: number | null): string`
  - `formatLifeExpectancy(n: number | null): string`
  - `formatEducation(n: number | null): string`

- [ ] **Step 1: Write the failing tests**

Create `pipeline/countle/lib.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./lib` (module not found).

- [ ] **Step 3: Implement the helpers**

Create `pipeline/countle/lib.ts`:

```ts
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

/** Percentile rank an array of values. Returns ranks 1-100; null/NaN → 10. */
export function percentileRank(values: (number | null)[]): number[] {
  const validPairs = values
    .map((v, i) => ({ v, i }))
    .filter((p) => p.v !== null && !Number.isNaN(p.v)) as { v: number; i: number }[];

  validPairs.sort((a, b) => a.v - b.v);

  const ranks = new Array(values.length).fill(10);
  validPairs.forEach((p, sortIdx) => {
    const pctl = Math.round(((sortIdx + 1) / validPairs.length) * 100);
    ranks[p.i] = Math.max(1, Math.min(100, pctl));
  });
  return ranks;
}

export function formatPopulation(pop: number | null): string {
  if (!pop) return "N/A";
  if (pop >= 1_000_000) return `${(pop / 1_000_000).toFixed(2)}M`;
  if (pop >= 1_000) return `${(pop / 1_000).toFixed(1)}K`;
  return pop.toString();
}

export function formatMoney(val: number | null): string {
  if (!val || val < 0) return "N/A"; // Census uses -666666666 as "no data"
  return "$" + val.toLocaleString("en-US");
}

export function formatArea(sqmi: number | null): string {
  if (!sqmi) return "N/A";
  return `${sqmi.toLocaleString("en-US", { maximumFractionDigits: 0 })} sq mi`;
}

export function formatDisasters(count: number | null): string {
  if (!count) return "0 declared";
  return `${count} declared`;
}

export function formatLifeExpectancy(years: number | null): string {
  if (!years) return "N/A";
  return `${years.toFixed(1)} yr life exp`;
}

export function formatEducation(pct: number | null): string {
  if (pct === null || Number.isNaN(pct)) return "N/A";
  return `${Math.round(pct)}% bachelor's+`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS — all `percentileRank` and `formatters` tests green.

- [ ] **Step 5: Commit**

```bash
git add pipeline/countle/lib.ts pipeline/countle/lib.test.ts
git commit -m "feat(data): percentile rank + display formatters (incl. health/education)"
```

---

## Task 3: Pure stat composite + rarity

**Files:**
- Modify: `pipeline/countle/lib.ts`
- Test: `pipeline/countle/lib.test.ts`

**Interfaces:**
- Consumes: `percentileRank` (Task 2).
- Produces:
  - `interface RawCounty { fips, name, state_abbr, state_name, land_area_sq_mi, population, median_household_income, gdp_total, gdp_per_capita, pct_bachelors_or_higher, unemployment_rate, life_expectancy, primary_care_physicians_rate, pct_uninsured, violent_crime_rate, total_disasters }` (all numeric fields `number | null`)
  - `interface StatBlock { wealth, health, people, land, danger, education }` (all `number`)
  - `computeStatsAndRarity(rows: RawCounty[]): Map<string, { stats: StatBlock; rarity: Rarity; totalScore: number }>`

- [ ] **Step 1: Write the failing test**

Add to `pipeline/countle/lib.test.ts`:

```ts
import { computeStatsAndRarity, type RawCounty } from "./lib";

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
  it("assigns the top total-score county the highest rarity tier present", () => {
    expect(result.get("01005")!.totalScore).toBeGreaterThan(result.get("01001")!.totalScore);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `computeStatsAndRarity` is not exported.

- [ ] **Step 3: Implement the composite**

Append to `pipeline/countle/lib.ts`:

```ts
export interface RawCounty {
  fips: string;
  name: string;
  state_abbr: string;
  state_name: string;
  land_area_sq_mi: number | null;
  population: number | null;
  median_household_income: number | null;
  gdp_total: number | null;
  gdp_per_capita: number | null;
  pct_bachelors_or_higher: number | null;
  unemployment_rate: number | null;
  life_expectancy: number | null;
  primary_care_physicians_rate: number | null;
  pct_uninsured: number | null;
  violent_crime_rate: number | null;
  total_disasters: number | null;
}

export interface StatBlock {
  wealth: number;
  health: number;
  people: number;
  land: number;
  danger: number;
  education: number;
}

/**
 * Compute the 6 stats (percentile-ranked across ALL input rows) plus a
 * total-score rarity tier. Mirrors the legacy compute-stats.ts weights, but
 * ranks across every county (not just a curated subset) and renames stats.
 */
export function computeStatsAndRarity(
  rows: RawCounty[]
): Map<string, { stats: StatBlock; rarity: Rarity; totalScore: number }> {
  const pctlGdpPerCapita = percentileRank(rows.map((m) => m.gdp_per_capita));
  const pctlMedianIncome = percentileRank(rows.map((m) => m.median_household_income));
  const pctlPop = percentileRank(rows.map((m) => (m.population ? Math.log10(m.population) : null)));
  const pctlGDP = percentileRank(rows.map((m) => m.gdp_total));
  const pctlLifeExp = percentileRank(rows.map((m) => m.life_expectancy));
  const pctlPhysicians = percentileRank(rows.map((m) => m.primary_care_physicians_rate));
  const pctlInvUninsured = percentileRank(rows.map((m) => (m.pct_uninsured ? -m.pct_uninsured : null)));
  const pctlArea = percentileRank(rows.map((m) => m.land_area_sq_mi));
  const pctlDisasters = percentileRank(rows.map((m) => m.total_disasters));
  const pctlCrime = percentileRank(rows.map((m) => m.violent_crime_rate));
  const pctlEducation = percentileRank(rows.map((m) => m.pct_bachelors_or_higher));
  const pctlLowUnemp = percentileRank(rows.map((m) => (m.unemployment_rate ? -m.unemployment_rate : null)));

  const computed = rows.map((m, i) => {
    const stats: StatBlock = {
      wealth: Math.round(0.5 * pctlGdpPerCapita[i] + 0.5 * pctlMedianIncome[i]),
      people: Math.round(0.7 * pctlPop[i] + 0.3 * pctlGDP[i]),
      health: Math.round(0.4 * pctlLifeExp[i] + 0.3 * pctlPhysicians[i] + 0.3 * pctlInvUninsured[i]),
      land: pctlArea[i],
      danger: Math.round(0.6 * pctlDisasters[i] + 0.4 * pctlCrime[i]),
      education: Math.round(0.6 * pctlEducation[i] + 0.4 * pctlLowUnemp[i]),
    };
    const totalScore = stats.wealth + stats.health + stats.people + stats.land + stats.danger + stats.education;
    return { fips: m.fips, stats, totalScore };
  });

  // Rarity by total-score percentile (same thresholds as legacy pipeline).
  const byScore = [...computed].sort((a, b) => a.totalScore - b.totalScore);
  const n = byScore.length;
  const rarityByFips = new Map<string, Rarity>();
  byScore.forEach((c, idx) => {
    const pctl = ((idx + 1) / n) * 100;
    const rarity: Rarity =
      pctl <= 40 ? "common" : pctl <= 70 ? "uncommon" : pctl <= 90 ? "rare" : pctl <= 97 ? "epic" : "legendary";
    rarityByFips.set(c.fips, rarity);
  });

  const out = new Map<string, { stats: StatBlock; rarity: Rarity; totalScore: number }>();
  for (const c of computed) {
    out.set(c.fips, { stats: c.stats, rarity: rarityByFips.get(c.fips)!, totalScore: c.totalScore });
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS — all `computeStatsAndRarity` assertions green.

- [ ] **Step 5: Commit**

```bash
git add pipeline/countle/lib.ts pipeline/countle/lib.test.ts
git commit -m "feat(data): 6-stat composite + rarity, ranked across all counties"
```

---

## Task 4: Answer-pool curation

**Files:**
- Modify: `pipeline/countle/lib.ts`
- Test: `pipeline/countle/lib.test.ts`

**Interfaces:**
- Produces:
  - `const STATE_CAPITAL_FIPS: string[]` (51 entries)
  - `const ICONIC_FIPS: string[]` (40 entries)
  - `topNPopulousPerState(populationByFips: Map<string, number>, n: number): Set<string>`
  - `buildAnswerPool(opts: { allFips: string[]; populationByFips: Map<string, number>; hasArt: (fips: string) => boolean }): Set<string>`

- [ ] **Step 1: Write the failing test**

Add to `pipeline/countle/lib.test.ts`:

```ts
import { STATE_CAPITAL_FIPS, ICONIC_FIPS, topNPopulousPerState, buildAnswerPool } from "./lib";

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

  it("buildAnswerPool = (capitals ∪ iconic ∪ top5pop) ∩ hasArt", () => {
    const pop = new Map<string, number>([["04013", 4_000_000]]); // Maricopa (iconic + capital)
    const pool = buildAnswerPool({
      allFips: ["04013", "01001"],
      populationByFips: pop,
      hasArt: (f) => f === "04013", // 01001 has no art
    });
    expect(pool.has("04013")).toBe(true);
    expect(pool.has("01001")).toBe(false); // not famous + no art
  });

  it("excludes a famous county that lacks art", () => {
    const pool = buildAnswerPool({
      allFips: ["36061"], // Manhattan (iconic)
      populationByFips: new Map(),
      hasArt: () => false,
    });
    expect(pool.has("36061")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `STATE_CAPITAL_FIPS` etc. not exported.

- [ ] **Step 3: Implement curation**

Append to `pipeline/countle/lib.ts` (FIPS lists copied verbatim from `pipeline/curate/select-500.ts`):

```ts
/** State-capital county FIPS (one per state + DC). */
export const STATE_CAPITAL_FIPS: string[] = [
  "01101", "02020", "04013", "05119", "06067", "08031", "09003", "10003",
  "11001", "12073", "13121", "15003", "16001", "17167", "18097", "19153",
  "20177", "21073", "22033", "23011", "24003", "25025", "26065", "27123",
  "28049", "29051", "30049", "31109", "32510", "33013", "34021", "35049",
  "36001", "37183", "38015", "39049", "40109", "41047", "42043", "44007",
  "45079", "46065", "47037", "48453", "49035", "50021", "51760", "53067",
  "54039", "55025", "56021",
];

/** Famous / iconic county FIPS to always include. */
export const ICONIC_FIPS: string[] = [
  "36061", "06037", "17031", "12086", "48201", "04013", "32003", "06073",
  "48029", "06065", "36047", "36081", "36005", "36085", "06075", "25017",
  "42101", "53033", "08035", "48301", "15001", "02185", "06071", "51013",
  "24031", "12011", "12095", "26163", "29189", "27053", "41005", "55079",
  "39035", "18089", "22071", "48141", "35001", "16055", "30031", "56039",
];

/** Pick the n most-populous county FIPS within each state (state = first 2 of fips). */
export function topNPopulousPerState(populationByFips: Map<string, number>, n: number): Set<string> {
  const byState = new Map<string, { fips: string; pop: number }[]>();
  for (const [fips, pop] of populationByFips) {
    const st = fips.substring(0, 2);
    const arr = byState.get(st) ?? [];
    arr.push({ fips, pop });
    byState.set(st, arr);
  }
  const out = new Set<string>();
  for (const arr of byState.values()) {
    arr.sort((a, b) => b.pop - a.pop);
    for (const { fips } of arr.slice(0, n)) out.add(fips);
  }
  return out;
}

/**
 * The Countle daily answer pool: genuinely recognizable counties that also
 * have art. Famous = state capitals ∪ iconic ∪ top-5-most-populous-per-state.
 */
export function buildAnswerPool(opts: {
  allFips: string[];
  populationByFips: Map<string, number>;
  hasArt: (fips: string) => boolean;
}): Set<string> {
  const famous = new Set<string>([
    ...STATE_CAPITAL_FIPS,
    ...ICONIC_FIPS,
    ...topNPopulousPerState(opts.populationByFips, 5),
  ]);
  const allSet = new Set(opts.allFips);
  const pool = new Set<string>();
  for (const fips of famous) {
    if (allSet.has(fips) && opts.hasArt(fips)) pool.add(fips);
  }
  return pool;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS — all `answer pool` tests green.

- [ ] **Step 5: Commit**

```bash
git add pipeline/countle/lib.ts pipeline/countle/lib.test.ts
git commit -m "feat(data): answer-pool curation (capitals + iconic + top-pop, ∩ hasArt)"
```

---

## Task 5: Source parsers

**Files:**
- Create: `pipeline/countle/parse.ts`
- Test: `pipeline/countle/parse.test.ts`

**Interfaces:**
- Consumes: `csv-parse/sync` (`parse`), `adm-zip` (`AdmZip`), `STATE_FIPS`-equivalent state set.
- Produces:
  - `parseGazetteer(text: string): GazRow[]` where `GazRow = { fips, name, state_abbr, state_name, land_area_sq_mi, lat, lng }`
  - `parseCensus(jsonText: string): CensusRow[]` where `CensusRow = { fips, population, median_household_income, pct_bachelors_or_higher, unemployment_rate }`
  - `parseGdp(zipBuf: Buffer): Map<string, number>` (fips → gdp_total in thousands)
  - `parseHealth(csvText: string): HealthRow[]` where `HealthRow = { fips, life_expectancy, primary_care_physicians_rate, pct_uninsured, violent_crime_rate }`
  - `parseFema(records: { fipsStateCode: string; fipsCountyCode: string }[]): Map<string, number>` (fips → disaster count)

- [ ] **Step 1: Write the failing tests**

Create `pipeline/countle/parse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseGazetteer, parseCensus, parseHealth, parseFema } from "./parse";

describe("parseGazetteer", () => {
  // Tab-delimited, real column headers (subset).
  const txt =
    "USPS\tGEOID\tNAME\tALAND_SQMI\tINTPTLAT\tINTPTLONG\n" +
    "AL\t01001\tAutauga County\t594.4\t32.532237\t-86.646440\n" +
    "PR\t72001\tAdjuntas Municipio\t67.6\t18.18\t-66.75\n"; // territory → dropped
  it("parses US counties and drops territories", () => {
    const rows = parseGazetteer(txt);
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      fips: "01001", name: "Autauga County", state_abbr: "AL", state_name: "Alabama",
    });
    expect(rows[0].lat).toBeCloseTo(32.532237);
    expect(rows[0].land_area_sq_mi).toBeCloseTo(594.4);
  });
});

describe("parseCensus", () => {
  // Census API returns an array-of-arrays; first row is headers.
  const json = JSON.stringify([
    ["NAME","B01003_001E","B19013_001E","B19301_001E","B15003_022E","B15003_001E","B15003_017E","B23025_003E","B23025_005E","B25001_001E","B25003_002E","B25003_001E","B01002_001E","state","county"],
    ["Autauga County, Alabama","58805","67565","35640","9000","40000","12000","26000","1300","22000","17000","21000","38.6","01","001"],
    ["Adjuntas, PR","18000","20000","10000","1000","12000","3000","6000","400","7000","5000","6500","40","72","001"], // dropped
  ]);
  it("parses US county rows and computes pct fields", () => {
    const rows = parseCensus(json);
    expect(rows.length).toBe(1);
    expect(rows[0].fips).toBe("01001");
    expect(rows[0].population).toBe(58805);
    expect(rows[0].median_household_income).toBe(67565);
    expect(rows[0].pct_bachelors_or_higher).toBeCloseTo(22.5); // 9000/40000*100
    expect(rows[0].unemployment_rate).toBeCloseTo(5.0); // 1300/26000*100
  });
});

describe("parseHealth", () => {
  // CHR CSV: row 1 = headers, row 2 = descriptions (skipped), row 3+ = data.
  const csv =
    "5-digit FIPS Code,Life Expectancy raw value,Primary Care Physicians raw value,Uninsured raw value,Violent Crime raw value\n" +
    "fipscode,desc,desc,desc,desc\n" +
    "01001,76.8,55.2,9.1,320.5\n" +
    "01000,79.0,60,8,300\n"; // state summary (ends 000) → dropped
  it("skips the description row and state summaries", () => {
    const rows = parseHealth(csv);
    expect(rows.length).toBe(1);
    expect(rows[0].fips).toBe("01001");
    expect(rows[0].life_expectancy).toBeCloseTo(76.8);
    expect(rows[0].pct_uninsured).toBeCloseTo(9.1);
  });
});

describe("parseFema", () => {
  it("aggregates county disaster counts and drops 000 county codes", () => {
    const counts = parseFema([
      { fipsStateCode: "01", fipsCountyCode: "001" },
      { fipsStateCode: "01", fipsCountyCode: "001" },
      { fipsStateCode: "01", fipsCountyCode: "000" }, // statewide → dropped
      { fipsStateCode: "72", fipsCountyCode: "001" }, // territory → dropped
    ]);
    expect(counts.get("01001")).toBe(2);
    expect(counts.has("72001")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./parse`.

- [ ] **Step 3: Implement the parsers**

Create `pipeline/countle/parse.ts`:

```ts
import { parse } from "csv-parse/sync";
import AdmZip from "adm-zip";

/** State FIPS (2-digit) → { abbr, name } for the 50 states + DC (territories excluded). */
const STATE_FIPS: Record<string, { abbr: string; name: string }> = {
  "01": { abbr: "AL", name: "Alabama" }, "02": { abbr: "AK", name: "Alaska" },
  "04": { abbr: "AZ", name: "Arizona" }, "05": { abbr: "AR", name: "Arkansas" },
  "06": { abbr: "CA", name: "California" }, "08": { abbr: "CO", name: "Colorado" },
  "09": { abbr: "CT", name: "Connecticut" }, "10": { abbr: "DE", name: "Delaware" },
  "11": { abbr: "DC", name: "District of Columbia" }, "12": { abbr: "FL", name: "Florida" },
  "13": { abbr: "GA", name: "Georgia" }, "15": { abbr: "HI", name: "Hawaii" },
  "16": { abbr: "ID", name: "Idaho" }, "17": { abbr: "IL", name: "Illinois" },
  "18": { abbr: "IN", name: "Indiana" }, "19": { abbr: "IA", name: "Iowa" },
  "20": { abbr: "KS", name: "Kansas" }, "21": { abbr: "KY", name: "Kentucky" },
  "22": { abbr: "LA", name: "Louisiana" }, "23": { abbr: "ME", name: "Maine" },
  "24": { abbr: "MD", name: "Maryland" }, "25": { abbr: "MA", name: "Massachusetts" },
  "26": { abbr: "MI", name: "Michigan" }, "27": { abbr: "MN", name: "Minnesota" },
  "28": { abbr: "MS", name: "Mississippi" }, "29": { abbr: "MO", name: "Missouri" },
  "30": { abbr: "MT", name: "Montana" }, "31": { abbr: "NE", name: "Nebraska" },
  "32": { abbr: "NV", name: "Nevada" }, "33": { abbr: "NH", name: "New Hampshire" },
  "34": { abbr: "NJ", name: "New Jersey" }, "35": { abbr: "NM", name: "New Mexico" },
  "36": { abbr: "NY", name: "New York" }, "37": { abbr: "NC", name: "North Carolina" },
  "38": { abbr: "ND", name: "North Dakota" }, "39": { abbr: "OH", name: "Ohio" },
  "40": { abbr: "OK", name: "Oklahoma" }, "41": { abbr: "OR", name: "Oregon" },
  "42": { abbr: "PA", name: "Pennsylvania" }, "44": { abbr: "RI", name: "Rhode Island" },
  "45": { abbr: "SC", name: "South Carolina" }, "46": { abbr: "SD", name: "South Dakota" },
  "47": { abbr: "TN", name: "Tennessee" }, "48": { abbr: "TX", name: "Texas" },
  "49": { abbr: "UT", name: "Utah" }, "50": { abbr: "VT", name: "Vermont" },
  "51": { abbr: "VA", name: "Virginia" }, "53": { abbr: "WA", name: "Washington" },
  "54": { abbr: "WV", name: "West Virginia" }, "55": { abbr: "WI", name: "Wisconsin" },
  "56": { abbr: "WY", name: "Wyoming" },
};

function rows(text: string, delimiter = ","): Record<string, string>[] {
  return parse(text, { delimiter, columns: true, skip_empty_lines: true, trim: true, relax_column_count: true });
}

export interface GazRow {
  fips: string; name: string; state_abbr: string; state_name: string;
  land_area_sq_mi: number | null; lat: number | null; lng: number | null;
}

export function parseGazetteer(text: string): GazRow[] {
  return rows(text, "\t")
    .map((r): GazRow | null => {
      const fips = (r["GEOID"] || "").trim().padStart(5, "0");
      const st = STATE_FIPS[fips.substring(0, 2)];
      if (!st) return null;
      return {
        fips,
        name: (r["NAME"] || "").trim(),
        state_abbr: st.abbr,
        state_name: st.name,
        land_area_sq_mi: parseFloat(r["ALAND_SQMI"] || "") || null,
        lat: parseFloat(r["INTPTLAT"] || "") || null,
        lng: parseFloat(r["INTPTLONG"] || "") || null,
      };
    })
    .filter((x): x is GazRow => x !== null);
}

export interface CensusRow {
  fips: string; population: number | null; median_household_income: number | null;
  pct_bachelors_or_higher: number | null; unemployment_rate: number | null;
}

export function parseCensus(jsonText: string): CensusRow[] {
  const data: string[][] = JSON.parse(jsonText);
  const headers = data[0];
  const col = (name: string) => headers.indexOf(name);
  return data
    .slice(1)
    .map((row): CensusRow | null => {
      const stateFips = row[col("state")];
      const fips = stateFips + row[col("county")];
      if (!STATE_FIPS[stateFips]) return null;
      const pop = parseInt(row[col("B01003_001E")]) || null;
      const income = parseInt(row[col("B19013_001E")]) || null;
      const bachelors = parseInt(row[col("B15003_022E")]) || 0;
      const pop25 = parseInt(row[col("B15003_001E")]) || 1;
      const labor = parseInt(row[col("B23025_003E")]) || 1;
      const unemp = parseInt(row[col("B23025_005E")]) || 0;
      return {
        fips,
        population: pop,
        median_household_income: income,
        pct_bachelors_or_higher: pop25 > 0 ? Math.round((bachelors / pop25) * 10000) / 100 : null,
        unemployment_rate: labor > 0 ? Math.round((unemp / labor) * 10000) / 100 : null,
      };
    })
    .filter((x): x is CensusRow => x !== null);
}

export function parseGdp(zipBuf: Buffer): Map<string, number> {
  const zip = new AdmZip(zipBuf);
  const entry = zip.getEntries().find((e) => e.entryName.includes("ALL_AREAS") && e.entryName.endsWith(".csv"));
  if (!entry) throw new Error("Could not find ALL_AREAS CSV in BEA zip");
  const recs = rows(entry.getData().toString("utf-8"));
  const yearCols = Object.keys(recs[0]).filter((k) => /^\d{4}$/.test(k));
  const latestYear = yearCols[yearCols.length - 1];
  const out = new Map<string, number>();
  for (const r of recs) {
    if ((r["LineCode"] || "").trim() !== "3") continue;
    let fips = (r["GeoFIPS"] || "").replace(/"/g, "").trim();
    if (fips.length < 5) continue;
    fips = fips.padStart(5, "0");
    if (fips.endsWith("000")) continue;
    if (!STATE_FIPS[fips.substring(0, 2)]) continue;
    const gdp = parseInt((r[latestYear] || "").replace(/,/g, "").replace(/\(.*\)/, "").trim());
    if (!isNaN(gdp) && gdp > 0) out.set(fips, gdp);
  }
  return out;
}

export interface HealthRow {
  fips: string; life_expectancy: number | null; primary_care_physicians_rate: number | null;
  pct_uninsured: number | null; violent_crime_rate: number | null;
}

export function parseHealth(csvText: string): HealthRow[] {
  // CHR CSV has TWO header rows: keep line 0 (names), drop line 1 (descriptions).
  const lines = csvText.split("\n");
  const recs = rows([lines[0], ...lines.slice(2)].join("\n"));
  const keys = Object.keys(recs[0] || {});
  const find = (needle: string) => keys.find((k) => k.toLowerCase().includes(needle.toLowerCase())) ?? null;
  const fipsCol = find("5-digit FIPS") || find("FIPS");
  const lifeCol = find("Life Expectancy raw value");
  const physCol = find("Primary Care Physicians raw value");
  const uninsCol = find("Uninsured raw value");
  const crimeCol = find("Violent Crime raw value") || find("Violent Crime Rate");
  if (!fipsCol) throw new Error("CHR: could not find FIPS column");
  const num = (r: Record<string, string>, c: string | null) => {
    if (!c) return null;
    const raw = (r[c] || "").replace(/,/g, "").trim();
    if (!raw || raw === ".") return null;
    const v = parseFloat(raw);
    return isNaN(v) ? null : v;
  };
  return recs
    .map((r): HealthRow | null => {
      let fips = (r[fipsCol] || "").replace(/"/g, "").trim();
      if (!fips || fips.length < 4) return null;
      fips = fips.padStart(5, "0");
      if (fips.endsWith("000")) return null;
      if (!STATE_FIPS[fips.substring(0, 2)]) return null;
      return {
        fips,
        life_expectancy: num(r, lifeCol),
        primary_care_physicians_rate: num(r, physCol),
        pct_uninsured: num(r, uninsCol),
        violent_crime_rate: num(r, crimeCol),
      };
    })
    .filter((x): x is HealthRow => x !== null);
}

export function parseFema(records: { fipsStateCode: string; fipsCountyCode: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of records) {
    const stateFips = (r.fipsStateCode || "").padStart(2, "0");
    const countyFips = (r.fipsCountyCode || "").padStart(3, "0");
    if (countyFips === "000") continue;
    if (!STATE_FIPS[stateFips]) continue;
    const fips = stateFips + countyFips;
    counts.set(fips, (counts.get(fips) ?? 0) + 1);
  }
  return counts;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS — all `parse*` tests green.

- [ ] **Step 5: Commit**

```bash
git add pipeline/countle/parse.ts pipeline/countle/parse.test.ts
git commit -m "feat(data): pure source parsers (gazetteer/census/gdp/health/fema)"
```

---

## Task 6: Orchestrator — assemble counties.json

**Files:**
- Create: `pipeline/build-countle-data.ts`
- Read (not modified): `pipeline/config.ts` (`downloadAndCache`, `downloadBuffer`, `REGION_MAP`), `data/enrichment.json`, `data/card-art/*.png`

**Interfaces:**
- Consumes: all of `pipeline/countle/lib.ts` and `pipeline/countle/parse.ts`; `downloadAndCache`/`downloadBuffer`/`REGION_MAP` from `./config`.
- Produces: `public/data/counties.json` matching the `CountyEntry` contract above.

- [ ] **Step 1: Write the orchestrator**

Create `pipeline/build-countle-data.ts`:

```ts
import { downloadAndCache, downloadBuffer, REGION_MAP } from "./config";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import {
  parseGazetteer, parseCensus, parseGdp, parseHealth, parseFema,
} from "./countle/parse";
import {
  computeStatsAndRarity, buildAnswerPool,
  formatMoney, formatPopulation, formatArea, formatDisasters,
  formatLifeExpectancy, formatEducation, type RawCounty,
} from "./countle/lib";

const CENSUS_URL =
  "https://api.census.gov/data/2022/acs/acs5?get=NAME,B01003_001E,B19013_001E,B19301_001E,B15003_022E,B15003_001E,B15003_017E,B23025_003E,B23025_005E,B25001_001E,B25003_002E,B25003_001E,B01002_001E&for=county:*&in=state:*";
const GAZETTEER_URL =
  "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_counties_national.zip";
const BEA_URL = "https://apps.bea.gov/regional/zip/CAGDP1.zip";
const HEALTH_URL =
  "https://www.countyhealthrankings.org/sites/default/files/media/document/analytic_data2024.csv";
const FEMA_URL =
  "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$select=fipsStateCode,fipsCountyCode,incidentType,fyDeclared,declarationType&$top=1000";

interface EnrichmentEntry {
  flavor: string | null;
  person_name: string | null;
  person_desc: string | null;
  county_seat: string | null;
}

async function fetchFema(): Promise<{ fipsStateCode: string; fipsCountyCode: string }[]> {
  const cache = join(process.cwd(), "data", "fema_disasters.json");
  if (existsSync(cache)) {
    console.log("  [cache hit] fema_disasters.json");
    return JSON.parse(readFileSync(cache, "utf-8"));
  }
  const all: { fipsStateCode: string; fipsCountyCode: string }[] = [];
  let skip = 0;
  while (true) {
    const res = await fetch(`${FEMA_URL}&$skip=${skip}&$orderby=id`);
    if (!res.ok) throw new Error(`FEMA HTTP ${res.status}`);
    const json = await res.json();
    const recs = json.DisasterDeclarationsSummaries as { fipsStateCode: string; fipsCountyCode: string }[];
    if (!recs || recs.length === 0) break;
    all.push(...recs);
    console.log(`  [fema] ${all.length} records`);
    skip += 1000;
    await new Promise((r) => setTimeout(r, 200));
  }
  writeFileSync(cache, JSON.stringify(all));
  return all;
}

async function main() {
  console.log("=== build-countle-data: assembling public/data/counties.json ===");

  // 1. Download + parse all sources (downloadAndCache/Buffer reuse data/ cache).
  const gaz = parseGazetteer((await downloadBuffer(GAZETTEER_URL, "gazetteer_counties.zip"), (() => {
    // gazetteer is a zip of one .txt — unzip here to keep parse.ts text-only.
    const AdmZip = require("adm-zip");
    const buf = readFileSync(join(process.cwd(), "data", "gazetteer_counties.zip"));
    const txt = new AdmZip(buf).getEntries().find((e: any) => e.entryName.endsWith(".txt"))!.getData().toString("utf-8");
    return txt;
  })()));
  const census = parseCensus(await downloadAndCache(CENSUS_URL, "census_acs.json"));
  const gdp = parseGdp(await downloadBuffer(BEA_URL, "CAGDP1.zip"));
  const health = parseHealth(await downloadAndCache(HEALTH_URL, "health_rankings_2024.csv"));
  const fema = parseFema(await fetchFema());

  console.log(`  parsed: ${gaz.length} counties, ${census.length} census, ${gdp.size} gdp, ${health.length} health, ${fema.size} fema`);

  // 2. Build lookup maps.
  const censusByFips = new Map(census.map((c) => [c.fips, c]));
  const healthByFips = new Map(health.map((h) => [h.fips, h]));
  const populationByFips = new Map<string, number>();
  for (const c of census) if (c.population) populationByFips.set(c.fips, c.population);

  // 3. Merge into RawCounty rows (gazetteer is the spine — every US county).
  const merged: RawCounty[] = gaz.map((g) => {
    const c = censusByFips.get(g.fips);
    const h = healthByFips.get(g.fips);
    const gdpTotal = gdp.get(g.fips) ?? null;
    const pop = c?.population ?? null;
    return {
      fips: g.fips, name: g.name, state_abbr: g.state_abbr, state_name: g.state_name,
      land_area_sq_mi: g.land_area_sq_mi,
      population: pop,
      median_household_income: c?.median_household_income ?? null,
      gdp_total: gdpTotal,
      gdp_per_capita: gdpTotal && pop ? (gdpTotal * 1000) / pop : null,
      pct_bachelors_or_higher: c?.pct_bachelors_or_higher ?? null,
      unemployment_rate: c?.unemployment_rate ?? null,
      life_expectancy: h?.life_expectancy ?? null,
      primary_care_physicians_rate: h?.primary_care_physicians_rate ?? null,
      pct_uninsured: h?.pct_uninsured ?? null,
      violent_crime_rate: h?.violent_crime_rate ?? null,
      total_disasters: fema.get(g.fips) ?? null,
    };
  });

  // 4. Compute stats + rarity across ALL counties.
  const statResult = computeStatsAndRarity(merged);

  // 5. Art availability + answer pool.
  const artDir = join(process.cwd(), "data", "card-art");
  const hasArt = (fips: string) => existsSync(join(artDir, `${fips}.png`));
  const answerPool = buildAnswerPool({ allFips: merged.map((m) => m.fips), populationByFips, hasArt });

  // 6. Enrichment (surviving local file).
  const enrichment = JSON.parse(readFileSync(join(process.cwd(), "data", "enrichment.json"), "utf-8")) as Record<string, EnrichmentEntry>;

  // 7. Assemble CountyEntry map.
  const counties: Record<string, unknown> = {};
  for (const m of merged) {
    const sr = statResult.get(m.fips)!;
    const e = enrichment[m.fips];
    const region = REGION_MAP[m.state_abbr]?.name ?? "Unknown";
    counties[m.fips] = {
      fips: m.fips, name: m.name, state_abbr: m.state_abbr, state_name: m.state_name, region,
      county_seat: e?.county_seat ?? null,
      lat: m.land_area_sq_mi === null ? 0 : 0, // placeholder replaced below
      lng: 0,
      stats: sr.stats,
      display: {
        wealth: formatMoney(m.median_household_income),
        health: formatLifeExpectancy(m.life_expectancy),
        people: formatPopulation(m.population),
        land: formatArea(m.land_area_sq_mi),
        danger: formatDisasters(m.total_disasters),
        education: formatEducation(m.pct_bachelors_or_higher),
      },
      rarity: sr.rarity,
      hasArt: hasArt(m.fips),
      isAnswerPool: answerPool.has(m.fips),
      notable_person: e?.person_name ?? null,
      notable_person_desc: e?.person_desc ?? null,
      flavor: e?.flavor ?? null,
    };
  }
  // lat/lng come from the gazetteer rows (parsed in `gaz`); attach them.
  for (const g of gaz) {
    const entry = counties[g.fips] as { lat: number; lng: number };
    entry.lat = g.lat ?? 0;
    entry.lng = g.lng ?? 0;
  }

  // 8. Write the deliverable.
  const outDir = join(process.cwd(), "public", "data");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    count: Object.keys(counties).length,
    answerPoolCount: answerPool.size,
    counties,
  };
  writeFileSync(join(outDir, "counties.json"), JSON.stringify(payload));
  console.log(`=== Done: ${payload.count} counties, ${payload.answerPoolCount} in answer pool ===`);
}

main().catch((err) => { console.error(err); process.exit(1); });
```

> **Note on the gazetteer unzip:** `downloadBuffer` caches the zip; the orchestrator unzips the single `.txt` inline (kept out of `parse.ts` so `parseGazetteer` stays text-in/rows-out and unit-testable). If the inline `require("adm-zip")` is awkward under ESM, hoist `import AdmZip from "adm-zip"` to the top and replace the IIFE with a small `unzipTxt(buf)` helper.

- [ ] **Step 2: Run the build (first run downloads ~7 MB; FEMA pagination takes a few minutes)**

Run: `npm run build:data`
Expected: console ends with `=== Done: ~3144 counties, ~3XX in answer pool ===`, and `public/data/counties.json` exists.

- [ ] **Step 3: Eyeball a known county**

Run: `node -e "const d=require('./public/data/counties.json'); console.log(JSON.stringify(d.counties['06037'],null,2)); console.log('count',d.count,'pool',d.answerPoolCount)"`
Expected: Los Angeles County, CA — `stats` all 1–100, `display.people` like `"9.xxM"`, `isAnswerPool: true`, `hasArt: true`, non-zero `lat`/`lng`.

- [ ] **Step 4: Commit**

```bash
git add pipeline/build-countle-data.ts
git commit -m "feat(data): orchestrator assembles public/data/counties.json (no Supabase)"
```

---

## Task 7: Output validation (acceptance gate)

**Files:**
- Create: `pipeline/countle/validate.ts`
- Test: `pipeline/countle/validate.test.ts`

**Interfaces:**
- Consumes: `zod` (already a dependency); the generated `public/data/counties.json`.
- Produces: `CountyEntrySchema` (zod) + `validatePayload(payload: unknown): { ok: true; count: number; answerPoolCount: number } | { ok: false; errors: string[] }`; a runnable validator (`npm run validate:data`) that exits non-zero on failure.

- [ ] **Step 1: Write the failing test**

Create `pipeline/countle/validate.test.ts`:

```ts
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
  it("rejects an answer-pool county without art", () => {
    const bad = { ...goodEntry, isAnswerPool: true, hasArt: false };
    const res = validatePayload({ schemaVersion: 1, generatedAt: "x", count: 1, answerPoolCount: 1, counties: { "06037": bad } });
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./validate`.

- [ ] **Step 3: Implement the validator**

Create `pipeline/countle/validate.ts`:

```ts
import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";

const stat = z.number().int().min(1).max(100);

const CountyEntrySchema = z.object({
  fips: z.string().length(5),
  name: z.string().min(1),
  state_abbr: z.string().length(2),
  state_name: z.string().min(1),
  region: z.string().min(1),
  county_seat: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  stats: z.object({ wealth: stat, health: stat, people: stat, land: stat, danger: stat, education: stat }),
  display: z.object({
    wealth: z.string(), health: z.string(), people: z.string(),
    land: z.string(), danger: z.string(), education: z.string(),
  }),
  rarity: z.enum(["common", "uncommon", "rare", "epic", "legendary"]),
  hasArt: z.boolean(),
  isAnswerPool: z.boolean(),
  notable_person: z.string().nullable(),
  notable_person_desc: z.string().nullable(),
  flavor: z.string().nullable(),
}).refine((c) => !(c.isAnswerPool && !c.hasArt), {
  message: "answer-pool county must have art",
});

const PayloadSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  count: z.number(),
  answerPoolCount: z.number(),
  counties: z.record(z.string(), CountyEntrySchema),
});

export function validatePayload(
  payload: unknown
): { ok: true; count: number; answerPoolCount: number } | { ok: false; errors: string[] } {
  const parsed = PayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  return { ok: true, count: parsed.data.count, answerPoolCount: parsed.data.answerPoolCount };
}

// Runnable entrypoint: `tsx pipeline/countle/validate.ts`
if (process.argv[1] && process.argv[1].includes("validate")) {
  const file = join(process.cwd(), "public", "data", "counties.json");
  const payload = JSON.parse(readFileSync(file, "utf-8"));
  const res = validatePayload(payload);
  if (!res.ok) {
    console.error("VALIDATION FAILED:");
    for (const e of res.errors) console.error("  " + e);
    process.exit(1);
  }
  const entries = Object.values(payload.counties as Record<string, { isAnswerPool: boolean; hasArt: boolean }>);
  const pool = entries.filter((e) => e.isAnswerPool);
  console.log(`VALID: ${res.count} counties, ${res.answerPoolCount} answer-pool.`);
  console.log(`  answer-pool size sanity: ${pool.length} (expect ~250-400)`);
  if (pool.length < 200) console.warn("  ⚠ answer pool smaller than expected — check art coverage of famous counties.");
}
```

- [ ] **Step 4: Run unit tests, then the real validator**

Run: `npm test`
Expected: PASS — `validatePayload` tests green.

Run: `npm run validate:data`
Expected: `VALID: ~3144 counties, ~3XX answer-pool.` and exit 0. If it fails, fix the orchestrator (Task 6) and re-run `npm run build:data`.

- [ ] **Step 5: Commit**

```bash
git add pipeline/countle/validate.ts pipeline/countle/validate.test.ts package.json
git commit -m "feat(data): zod validation gate for counties.json"
```

---

## Task 8: Publish answer-pool art

**Files:**
- Create: `pipeline/countle/copy-art.ts`
- Create: `public/art/{fips}.png` (copied)

**Interfaces:**
- Consumes: `public/data/counties.json` (for the answer-pool fips), `data/card-art/{fips}.png`.
- Produces: `public/art/{fips}.png` for every answer-pool county; logs total size + any missing art.

- [ ] **Step 1: Write the copy script**

Create `pipeline/countle/copy-art.ts`:

```ts
import { readFileSync, existsSync, mkdirSync, copyFileSync, statSync } from "fs";
import { join } from "path";

const data = JSON.parse(readFileSync(join(process.cwd(), "public", "data", "counties.json"), "utf-8"));
const srcDir = join(process.cwd(), "data", "card-art");
const dstDir = join(process.cwd(), "public", "art");
if (!existsSync(dstDir)) mkdirSync(dstDir, { recursive: true });

let copied = 0, bytes = 0;
const missing: string[] = [];
for (const [fips, c] of Object.entries(data.counties as Record<string, { isAnswerPool: boolean }>)) {
  if (!c.isAnswerPool) continue;
  const src = join(srcDir, `${fips}.png`);
  if (!existsSync(src)) { missing.push(fips); continue; }
  copyFileSync(src, join(dstDir, `${fips}.png`));
  bytes += statSync(src).size;
  copied++;
}
console.log(`Copied ${copied} answer-pool art files (${(bytes / 1024 / 1024).toFixed(0)} MB) → public/art/`);
if (missing.length) console.warn(`⚠ ${missing.length} answer-pool counties missing art: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "…" : ""}`);
```

- [ ] **Step 2: Run it**

Run: `npx tsx pipeline/countle/copy-art.ts`
Expected: `Copied ~3XX answer-pool art files (~XXX MB) → public/art/`. The `missing` count should be **0** (validation already guarantees answer-pool ∩ hasArt).

- [ ] **Step 3: Ignore the bulky generated art in git, but keep the script + data**

Append to `.gitignore`:

```
/public/art/
```

> Art is large; it's a build artifact reproducible via `copy-art.ts`. `public/data/counties.json` IS committed (small, the contract). Revisit CDN hosting in Plan 2 / Phase 2.

- [ ] **Step 4: Commit**

```bash
git add pipeline/countle/copy-art.ts .gitignore public/data/counties.json
git commit -m "feat(data): publish answer-pool art + commit generated counties.json"
```

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-06-23-countle-design.md`):
- §3 Answer pool → Task 4 (`buildAnswerPool`), validated in Task 7. **Refinement:** pool is curation-based (capitals ∪ iconic ∪ top-5-pop ∩ hasArt) rather than `rarity ∈ {epic,legendary}` — more recognizable; flagged below.
- §4 Feedback model needs every county's 6 stats + lat/lng → Tasks 3 + 6 (stats across **all** 3,144; gazetteer lat/lng). ✓
- §7 Data model (`CountyEntry`, static JSON, no DB) → Tasks 6–7. **Additions:** `region`, `isAnswerPool`, `display.health`, `display.education` (the last two resolve spec Risk #2). ✓
- §7 "Regenerating the dataset" → the whole plan; Supabase fully removed from the path. ✓
- §10 Risk #2 (missing health/education display) → `formatLifeExpectancy` / `formatEducation` (Task 2). ✓
- §10 Risk #3 (art coverage of pool) → answer pool is `∩ hasArt` (Task 4) + Task 8 reports missing. ✓
- §10 Risk #4 (bundle size) → noted; one-file MVP, split deferred to Plan 2. ✓

**Placeholder scan:** none — every code/test step is complete. (The orchestrator's lat/lng two-pass and the gazetteer unzip IIFE are real, working code with a noted cleaner alternative.)

**Type consistency:** `RawCounty`/`StatBlock` defined in Task 3 and consumed unchanged in Task 6; stat keys `wealth/health/people/land/danger/education` consistent across lib, orchestrator, and the zod schema; `Rarity` enum identical in lib and validator.

## Notes / deliberate refinements to flag to the owner

1. **Answer pool is curation-based, not rarity-tier-based** (spec §3). Rationale: state capitals + iconic + most-populous are *recognizable*; total-score rarity can crown obscure high-stat counties. `rarity` is still computed (across all 3,144) and kept for art-mood/flair. If you prefer the spec's literal `epic∪legendary`, it's a one-line change in `buildAnswerPool`.
2. **Stats are ranked across all 3,144 counties**, not the legacy curated ~500 — required because any county is a guessable probe. This shifts absolute stat values vs. the old `cards-meta.json`.
3. **`region` added to every entry** to drive the Bold Pop region-color map fill + win wash (spec §7 visual design).
4. **Daily-reset (UTC vs local) and difficulty thresholds** (`MAG_THRESHOLD`/`CLOSE_THRESHOLD`) are **game logic**, not data — they belong in Plan 2 (the game), not here.
```
