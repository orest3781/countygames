# Countle Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pure, headless, fully unit-tested TypeScript game engine for Countle — daily county selection, per-stat + geographic feedback, the spoiler-free share grid, and the localStorage state machine — with **zero React/DOM dependencies**, so the UI (Plan 3) is a thin rendering layer over a proven core.

**Architecture:** A set of pure modules under `src/lib/countle/`. Each function takes data in and returns data out (no globals, no `Date.now()` baked into logic — dates are passed in). The dataset is the locked `public/data/counties.json` (Plan 1 output); the engine indexes it in memory. State transitions are pure functions over a `CountleState` object; localStorage is a thin serialize/parse pair tested with an in-memory string.

**Tech Stack:** TypeScript; `vitest` (Plan 1 configured it for `pipeline/**`; Task 1 extends `include` to `src/**` and excludes `*.test.ts` from the Next build). No new dependencies.

## Global Constraints

- **The data contract is LOCKED by Plan 1's committed `public/data/counties.json`.** Per-county fields and exact key names (copy verbatim): `fips, name, state_abbr, state_name, region, county_seat (string|null), lat, lng, stats{wealth,health,people,land,danger,education} (integers 1–100), display{wealth,health,people,land,danger,education} (strings), rarity, hasArt, isAnswerPool, notable_person (string|null), notable_person_desc (string|null), flavor (string|null)`. Envelope: `{schemaVersion, generatedAt, count, answerPoolCount, counties: Record<fips, CountyEntry>}`. **Note:** the spec §8 lists older display keys (`income/population/area/...`) — IGNORE that; the committed file's `wealth/health/people/land/danger/education` keys govern.
- **Pure engine.** No module under `src/lib/countle/` may import React, Next, `window`, `document`, or `fs` (except the ONE integration test that reads the real dataset). Logic must be deterministic given its inputs — never call `Date.now()`/`new Date()` inside engine logic; the caller passes a `Date` or a `dateKey`.
- **Stat keys, fixed order:** `STAT_KEYS = ["wealth","health","people","land","danger","education"]`. Every per-stat array is in this order.
- **Thresholds (from spec §4, tunable consts):** `MAG_THRESHOLD = 33`, `CLOSE_THRESHOLD = 8`, `GUESS_LIMIT = 6`, `NOTABLE_CLUE_GUESS = 5` (clue available once the player has made 4 wrong guesses, i.e. on the 5th attempt), `BLUR_SCHEDULE = [24, 18, 12, 8, 4, 2, 0]`.
- **Daily selection (spec §3/§4):** deterministic and UTC. `dateKey = UTC YYYY-MM-DD`; answer pool = counties with `isAnswerPool === true`, **sorted ascending by fips**; `index = hashString(dateKey) % pool.length`.
- **Share grid (spec §5):** per stat, `🟩` if `|delta| ≤ CLOSE_THRESHOLD`, `🟨` if `|delta| ≤ MAG_THRESHOLD`, else `⬛`. Never reveals the answer.
- **FIPS are 5-digit strings**, always.
- **`EPOCH_DATE_KEY = "2026-06-25"`** → puzzle #1. Puzzle number = whole UTC days from epoch + 1.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/countle/types.ts` | All shared types + `STAT_KEYS`: `CountyEntry`, `CountiesPayload`, `Dataset`, `StatKey`, `Direction`, `Closeness`, `StatFeedback`, `GuessResult`, `CountleState`. No logic. |
| `src/lib/countle/constants.ts` | Tunable constants: `MAG_THRESHOLD`, `CLOSE_THRESHOLD`, `GUESS_LIMIT`, `NOTABLE_CLUE_GUESS`, `BLUR_SCHEDULE`, `EPOCH_DATE_KEY`. |
| `src/lib/countle/data.ts` | `buildDataset(payload)` (index by fips, sorted answer pool, all[]); `searchCounties(dataset, query, limit)` (autocomplete with same-name disambiguation). |
| `src/lib/countle/daily.ts` | Date + selection utils: `dateKeyUTC(date)`, `prevDateKey(dateKey)`, `daysBetween(a,b)`, `puzzleNumber(dateKey)`, `hashString(s)`, `pickDailyFips(pool, dateKey)`, `getDailyCounty(dataset, dateKey)`. |
| `src/lib/countle/geo.ts` | `haversineMiles(a, b)`, `bearingDeg(a, b)`, `compass8(deg)`. |
| `src/lib/countle/feedback.ts` | `compareStats(mystery, guess)`, `shareRow(stats)`, `blurForGuess(guessesMade)`, `evaluateGuess(mystery, guess)`. |
| `src/lib/countle/share.ts` | `buildShareText(opts)`. |
| `src/lib/countle/state.ts` | `initialState()`, `parseState(raw)`, `serializeState(s)`, `startDay(s, dateKey)`, `recordGuess(s, fips, opts)`. |
| `src/lib/countle/index.ts` | Barrel re-export of the public API. |
| `src/lib/countle/*.test.ts` | Vitest unit tests, one per module. |

### The public API (what Plan 3's UI will consume)
```ts
buildDataset(payload: CountiesPayload): Dataset
searchCounties(dataset: Dataset, query: string, limit?: number): CountyEntry[]
dateKeyUTC(date: Date): string
puzzleNumber(dateKey: string): number
getDailyCounty(dataset: Dataset, dateKey: string): CountyEntry
evaluateGuess(mystery: CountyEntry, guess: CountyEntry): GuessResult
blurForGuess(guessesMade: number): number
buildShareText(opts: { puzzleNumber: number; solved: boolean; guessCount: number; streak: number; rows: string[] }): string
initialState(): CountleState
parseState(raw: string | null): CountleState
serializeState(s: CountleState): string
startDay(s: CountleState, dateKey: string): CountleState
recordGuess(s: CountleState, fips: string, opts: { isCorrect: boolean; dateKey: string; answerFips: string }): CountleState
```

---

## Task 1: Types, constants, and dataset indexing

**Files:**
- Create: `src/lib/countle/types.ts`, `src/lib/countle/constants.ts`, `src/lib/countle/data.ts`
- Test: `src/lib/countle/data.test.ts`

**Interfaces:**
- Produces: all types in `types.ts`; constants in `constants.ts`; `buildDataset(payload: CountiesPayload): Dataset`; `searchCounties(dataset: Dataset, query: string, limit = 8): CountyEntry[]`.

- [ ] **Step 1: Wire test config, then write the types and constants**

First make vitest pick up `src/` tests and keep test files out of the Next production build.

Edit `vitest.config.ts` — set `include` to:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["pipeline/**/*.test.ts", "src/**/*.test.ts"],
  },
});
```

Edit `tsconfig.json` — change its `"exclude"` array to:

```json
  "exclude": [
    "node_modules",
    "pipeline",
    "**/*.test.ts"
  ]
```

Now create `src/lib/countle/types.ts`:

```ts
export type StatKey = "wealth" | "health" | "people" | "land" | "danger" | "education";
export const STAT_KEYS: StatKey[] = ["wealth", "health", "people", "land", "danger", "education"];

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface CountyEntry {
  fips: string;
  name: string;
  state_abbr: string;
  state_name: string;
  region: string;
  county_seat: string | null;
  lat: number;
  lng: number;
  stats: Record<StatKey, number>;
  display: Record<StatKey, string>;
  rarity: Rarity;
  hasArt: boolean;
  isAnswerPool: boolean;
  notable_person: string | null;
  notable_person_desc: string | null;
  flavor: string | null;
}

export interface CountiesPayload {
  schemaVersion: number;
  generatedAt: string;
  count: number;
  answerPoolCount: number;
  counties: Record<string, CountyEntry>;
}

export interface Dataset {
  byFips: Map<string, CountyEntry>;
  all: CountyEntry[];
  answerPoolFips: string[]; // ascending by fips
}

export type Direction = "up" | "down" | "equal";
export type Closeness = "close" | "near" | "far"; // 🟩 / 🟨 / ⬛

export interface StatFeedback {
  key: StatKey;
  guessValue: number;     // the guessed county's stat (shown in UI)
  direction: Direction;   // arrow toward the mystery
  magnitude: 1 | 2;       // single or double arrow
  closeness: Closeness;   // drives the share square
}

export interface GuessResult {
  guess: CountyEntry;
  isCorrect: boolean;
  stats: StatFeedback[];  // length 6, STAT_KEYS order
  distanceMiles: number;  // 0 when correct
  bearingDeg: number;     // 0..360, 0 when correct
  compass: { arrow: string; label: string };
  shareRow: string;       // 6 emoji squares
}

export interface CountleState {
  schemaVersion: 1;
  lastPlayedDateKey: string | null;
  today: { dateKey: string; guesses: string[]; solved: boolean; finished: boolean } | null;
  streak: number;
  maxStreak: number;
  gamesPlayed: number;
  guessDistribution: number[]; // length 6; index i = solved in (i+1) guesses
  fails: number;
  solvedCounties: string[];
  encounteredCounties: string[];
}
```

Create `src/lib/countle/constants.ts`:

```ts
export const MAG_THRESHOLD = 33;
export const CLOSE_THRESHOLD = 8;
export const GUESS_LIMIT = 6;
export const NOTABLE_CLUE_GUESS = 5;
export const BLUR_SCHEDULE = [24, 18, 12, 8, 4, 2, 0];
export const EPOCH_DATE_KEY = "2026-06-25";
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/countle/data.test.ts`:

```ts
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
  it("matches by name, case-insensitive, prefix ranked first", () => {
    const r = searchCounties(ds, "los angeles");
    expect(r[0].fips).toBe("06037");
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
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- data.test`
Expected: FAIL — cannot resolve `./data`.

- [ ] **Step 4: Implement `data.ts`**

Create `src/lib/countle/data.ts`:

```ts
import type { CountiesPayload, CountyEntry, Dataset } from "./types";

export function buildDataset(payload: CountiesPayload): Dataset {
  const all = Object.values(payload.counties);
  const byFips = new Map<string, CountyEntry>(all.map((c) => [c.fips, c]));
  const answerPoolFips = all
    .filter((c) => c.isAnswerPool)
    .map((c) => c.fips)
    .sort();
  return { byFips, all, answerPoolFips };
}

/** Autocomplete over ALL counties (any county is a valid guess). */
export function searchCounties(dataset: Dataset, query: string, limit = 8): CountyEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { c: CountyEntry; score: number }[] = [];
  for (const c of dataset.all) {
    const name = c.name.toLowerCase();
    const full = `${name}, ${c.state_abbr.toLowerCase()}`;
    let score: number;
    if (name === q || full === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (name.includes(q) || full.includes(q)) score = 2;
    else continue;
    scored.push({ c, score });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      b.c.stats.people - a.c.stats.people || // bigger places first
      a.c.name.localeCompare(b.c.name) ||
      a.c.fips.localeCompare(b.c.fips)
  );
  return scored.slice(0, limit).map((s) => s.c);
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- data.test`
Expected: PASS — all `buildDataset` and `searchCounties` tests green.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts tsconfig.json src/lib/countle/types.ts src/lib/countle/constants.ts src/lib/countle/data.ts src/lib/countle/data.test.ts
git commit -m "feat(engine): countle types, constants, dataset indexing + autocomplete"
```

---

## Task 2: Daily selection + date utilities

**Files:**
- Create: `src/lib/countle/daily.ts`
- Test: `src/lib/countle/daily.test.ts`

**Interfaces:**
- Consumes: `Dataset` (Task 1), `EPOCH_DATE_KEY` (Task 1 constants).
- Produces: `dateKeyUTC(date: Date): string`, `prevDateKey(dateKey: string): string`, `daysBetween(a: string, b: string): number`, `puzzleNumber(dateKey: string): number`, `hashString(s: string): number`, `pickDailyFips(poolSortedFips: string[], dateKey: string): string`, `getDailyCounty(dataset: Dataset, dateKey: string): CountyEntry`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/countle/daily.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- daily.test`
Expected: FAIL — cannot resolve `./daily`.

- [ ] **Step 3: Implement `daily.ts`**

Create `src/lib/countle/daily.ts`:

```ts
import type { Dataset, CountyEntry } from "./types";
import { EPOCH_DATE_KEY } from "./constants";

const MS_PER_DAY = 86_400_000;

/** UTC YYYY-MM-DD for a Date. */
export function dateKeyUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function keyToUTC(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** The UTC day before dateKey, as YYYY-MM-DD. */
export function prevDateKey(dateKey: string): string {
  return dateKeyUTC(new Date(keyToUTC(dateKey) - MS_PER_DAY));
}

/** Whole UTC days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((keyToUTC(b) - keyToUTC(a)) / MS_PER_DAY);
}

/** 1-based puzzle number relative to EPOCH_DATE_KEY. */
export function puzzleNumber(dateKey: string): number {
  return daysBetween(EPOCH_DATE_KEY, dateKey) + 1;
}

/** Deterministic non-negative string hash (djb2-style, >>> 0). */
export function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/** Pick the daily fips deterministically from a pool sorted ascending by fips. */
export function pickDailyFips(poolSortedFips: string[], dateKey: string): string {
  if (poolSortedFips.length === 0) throw new Error("empty answer pool");
  return poolSortedFips[hashString(dateKey) % poolSortedFips.length];
}

export function getDailyCounty(dataset: Dataset, dateKey: string): CountyEntry {
  const fips = pickDailyFips(dataset.answerPoolFips, dateKey);
  const c = dataset.byFips.get(fips);
  if (!c) throw new Error(`daily fips ${fips} not in dataset`);
  return c;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- daily.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/countle/daily.ts src/lib/countle/daily.test.ts
git commit -m "feat(engine): deterministic UTC daily selection + puzzle number"
```

---

## Task 3: Geography (distance + bearing + compass)

**Files:**
- Create: `src/lib/countle/geo.ts`
- Test: `src/lib/countle/geo.test.ts`

**Interfaces:**
- Produces: `haversineMiles(a: LatLng, b: LatLng): number`, `bearingDeg(a: LatLng, b: LatLng): number`, `compass8(deg: number): { arrow: string; label: string }`, where `LatLng = { lat: number; lng: number }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/countle/geo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { haversineMiles, bearingDeg, compass8 } from "./geo";

const NYC = { lat: 40.7128, lng: -74.006 };
const LA = { lat: 34.0522, lng: -118.2437 };

describe("haversineMiles", () => {
  it("is 0 for identical points", () => {
    expect(haversineMiles(NYC, NYC)).toBe(0);
  });
  it("NYC→LA ≈ 2445 mi (±25)", () => {
    expect(haversineMiles(NYC, LA)).toBeGreaterThan(2420);
    expect(haversineMiles(NYC, LA)).toBeLessThan(2470);
  });
});

describe("bearingDeg + compass8", () => {
  it("due north", () => {
    const b = bearingDeg({ lat: 0, lng: 0 }, { lat: 10, lng: 0 });
    expect(Math.round(b)).toBe(0);
    expect(compass8(b)).toEqual({ arrow: "↑", label: "north" });
  });
  it("due east", () => {
    const b = bearingDeg({ lat: 0, lng: 0 }, { lat: 0, lng: 10 });
    expect(Math.round(b)).toBe(90);
    expect(compass8(b).label).toBe("east");
  });
  it("NYC→LA points west-ish", () => {
    expect(compass8(bearingDeg(NYC, LA)).label).toBe("west");
  });
  it("wraps 360 back to north", () => {
    expect(compass8(360)).toEqual({ arrow: "↑", label: "north" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- geo.test`
Expected: FAIL — cannot resolve `./geo`.

- [ ] **Step 3: Implement `geo.ts`**

Create `src/lib/countle/geo.ts`:

```ts
export interface LatLng { lat: number; lng: number; }

const R_MILES = 3958.8;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function haversineMiles(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b, degrees 0..360 (0 = north, 90 = east). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
const LABELS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

export function compass8(deg: number): { arrow: string; label: string } {
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return { arrow: ARROWS[i], label: LABELS[i] };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- geo.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/countle/geo.ts src/lib/countle/geo.test.ts
git commit -m "feat(engine): haversine distance + initial bearing + 8-point compass"
```

---

## Task 4: Per-stat feedback + share row + blur

**Files:**
- Create: `src/lib/countle/feedback.ts`
- Test: `src/lib/countle/feedback.test.ts`

**Interfaces:**
- Consumes: `CountyEntry`, `StatFeedback`, `STAT_KEYS` (Task 1); thresholds + `BLUR_SCHEDULE` (Task 1 constants).
- Produces: `compareStats(mystery: CountyEntry, guess: CountyEntry): StatFeedback[]`, `shareRow(stats: StatFeedback[]): string`, `blurForGuess(guessesMade: number): number`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/countle/feedback.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { compareStats, shareRow, blurForGuess } from "./feedback";
import type { CountyEntry, StatKey } from "./types";

function withStats(s: Record<StatKey, number>): CountyEntry {
  return { fips: "00000", name: "T", state_abbr: "XX", state_name: "X", region: "Midwest", county_seat: null, lat: 0, lng: 0,
    stats: s, display: { wealth: "", health: "", people: "", land: "", danger: "", education: "" },
    rarity: "common", hasArt: false, isAnswerPool: false, notable_person: null, notable_person_desc: null, flavor: null };
}

describe("compareStats", () => {
  const mystery = withStats({ wealth: 80, health: 50, people: 50, land: 50, danger: 50, education: 50 });
  const guess = withStats({ wealth: 40, health: 50, people: 55, land: 90, danger: 84, education: 78 });
  const fb = compareStats(mystery, guess);

  it("returns 6 entries in STAT_KEYS order", () => {
    expect(fb.map((f) => f.key)).toEqual(["wealth", "health", "people", "land", "danger", "education"]);
  });
  it("exposes the GUESS value, not the mystery value", () => {
    expect(fb[0].guessValue).toBe(40); // wealth guess
  });
  it("wealth: mystery higher by 40 → up, double arrow, far", () => {
    expect(fb[0].direction).toBe("up");
    expect(fb[0].magnitude).toBe(2);   // |40| > 33
    expect(fb[0].closeness).toBe("far");
  });
  it("health: equal → equal direction, close", () => {
    expect(fb[1].direction).toBe("equal");
    expect(fb[1].closeness).toBe("close"); // |0| ≤ 8
  });
  it("people: mystery lower by 5 → down, single, close", () => {
    expect(fb[2].direction).toBe("down");
    expect(fb[2].magnitude).toBe(1);
    expect(fb[2].closeness).toBe("close");
  });
  it("land: mystery lower by 40 → down, double, far", () => {
    expect(fb[3].direction).toBe("down");
    expect(fb[3].magnitude).toBe(2);
    expect(fb[3].closeness).toBe("far");
  });
  it("danger: mystery lower by 34 → down, double arrow, far", () => {
    expect(fb[4].direction).toBe("down");
    expect(fb[4].magnitude).toBe(2);   // |34| > 33
    expect(fb[4].closeness).toBe("far");
  });
  it("education: mystery lower by 28 → down, single arrow, near (yellow band)", () => {
    expect(fb[5].direction).toBe("down");
    expect(fb[5].magnitude).toBe(1);   // |28| ≤ 33
    expect(fb[5].closeness).toBe("near"); // 8 < 28 ≤ 33
  });
});

describe("shareRow", () => {
  it("maps closeness to 🟩/🟨/⬛", () => {
    const fb = compareStats(
      withStats({ wealth: 50, health: 50, people: 50, land: 50, danger: 50, education: 50 }),
      withStats({ wealth: 50, health: 70, people: 90, land: 50, danger: 50, education: 50 })
    );
    // wealth Δ0 close→🟩, health Δ20 near→🟨, people Δ40 far→⬛
    expect(shareRow(fb).startsWith("🟩🟨⬛")).toBe(true);
    expect([...shareRow(fb)].length).toBe(6);
  });
});

describe("blurForGuess", () => {
  it("steps down the schedule and clamps", () => {
    expect(blurForGuess(0)).toBe(24);
    expect(blurForGuess(3)).toBe(8);
    expect(blurForGuess(6)).toBe(0);
    expect(blurForGuess(99)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- feedback.test`
Expected: FAIL — cannot resolve `./feedback`.

- [ ] **Step 3: Implement `feedback.ts`**

Create `src/lib/countle/feedback.ts`:

```ts
import type { CountyEntry, StatFeedback, Closeness, Direction } from "./types";
import { STAT_KEYS } from "./types";
import { MAG_THRESHOLD, CLOSE_THRESHOLD, BLUR_SCHEDULE } from "./constants";

function closenessOf(absDelta: number): Closeness {
  if (absDelta <= CLOSE_THRESHOLD) return "close";
  if (absDelta <= MAG_THRESHOLD) return "near";
  return "far";
}

export function compareStats(mystery: CountyEntry, guess: CountyEntry): StatFeedback[] {
  return STAT_KEYS.map((key) => {
    const delta = mystery.stats[key] - guess.stats[key]; // + = mystery higher
    const abs = Math.abs(delta);
    const direction: Direction = delta > 0 ? "up" : delta < 0 ? "down" : "equal";
    const magnitude: 1 | 2 = abs > MAG_THRESHOLD ? 2 : 1;
    return { key, guessValue: guess.stats[key], direction, magnitude, closeness: closenessOf(abs) };
  });
}

const SQUARE: Record<Closeness, string> = { close: "🟩", near: "🟨", far: "⬛" };

export function shareRow(stats: StatFeedback[]): string {
  return stats.map((s) => SQUARE[s.closeness]).join("");
}

export function blurForGuess(guessesMade: number): number {
  const i = Math.max(0, Math.min(guessesMade, BLUR_SCHEDULE.length - 1));
  return BLUR_SCHEDULE[i];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- feedback.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/countle/feedback.ts src/lib/countle/feedback.test.ts
git commit -m "feat(engine): per-stat feedback, share row, progressive blur"
```

---

## Task 5: `evaluateGuess` (full per-guess result)

**Files:**
- Modify: `src/lib/countle/feedback.ts`
- Test: `src/lib/countle/feedback.test.ts`

**Interfaces:**
- Consumes: `compareStats`, `shareRow` (Task 4); `haversineMiles`, `bearingDeg`, `compass8` (Task 3).
- Produces: `evaluateGuess(mystery: CountyEntry, guess: CountyEntry): GuessResult`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/countle/feedback.test.ts`:

```ts
import { evaluateGuess } from "./feedback";

function county(fips: string, lat: number, lng: number, stats: Record<import("./types").StatKey, number>): CountyEntry {
  return { fips, name: fips, state_abbr: "XX", state_name: "X", region: "Midwest", county_seat: null, lat, lng,
    stats, display: { wealth: "", health: "", people: "", land: "", danger: "", education: "" },
    rarity: "common", hasArt: false, isAnswerPool: true, notable_person: null, notable_person_desc: null, flavor: null };
}

describe("evaluateGuess", () => {
  const even = { wealth: 50, health: 50, people: 50, land: 50, danger: 50, education: 50 };
  const mystery = county("06037", 34.05, -118.24, even);

  it("correct guess: isCorrect, distance 0, all-green row", () => {
    const r = evaluateGuess(mystery, mystery);
    expect(r.isCorrect).toBe(true);
    expect(r.distanceMiles).toBe(0);
    expect(r.shareRow).toBe("🟩🟩🟩🟩🟩🟩");
  });

  it("wrong guess: not correct, positive distance, compass label set", () => {
    const guess = county("36061", 40.71, -74.0, even); // NYC-ish
    const r = evaluateGuess(mystery, guess);
    expect(r.isCorrect).toBe(false);
    expect(r.distanceMiles).toBeGreaterThan(2000);
    expect(r.compass.label).toBe("west"); // mystery (LA) is west of NYC
    expect(r.stats.length).toBe(6);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- feedback.test`
Expected: FAIL — `evaluateGuess` not exported.

- [ ] **Step 3: Implement `evaluateGuess` in `feedback.ts`**

Append to `src/lib/countle/feedback.ts`:

```ts
import type { GuessResult } from "./types";
import { haversineMiles, bearingDeg, compass8 } from "./geo";

export function evaluateGuess(mystery: CountyEntry, guess: CountyEntry): GuessResult {
  const isCorrect = guess.fips === mystery.fips;
  const stats = compareStats(mystery, guess);
  const distanceMiles = isCorrect ? 0 : Math.round(haversineMiles(guess, mystery));
  const bearing = isCorrect ? 0 : bearingDeg(guess, mystery);
  const compass = isCorrect ? { arrow: "🎯", label: "here" } : compass8(bearing);
  return { guess, isCorrect, stats, distanceMiles, bearingDeg: bearing, compass, shareRow: shareRow(stats) };
}
```

> Move the `import` lines to the top of the file (do not leave `import` statements mid-file). Combine the geo import with existing imports.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- feedback.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/countle/feedback.ts src/lib/countle/feedback.test.ts
git commit -m "feat(engine): evaluateGuess combines stat + geo feedback"
```

---

## Task 6: Share text

**Files:**
- Create: `src/lib/countle/share.ts`
- Test: `src/lib/countle/share.test.ts`

**Interfaces:**
- Produces: `buildShareText(opts: { puzzleNumber: number; solved: boolean; guessCount: number; streak: number; rows: string[] }): string`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/countle/share.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildShareText } from "./share";

describe("buildShareText", () => {
  const rows = ["🟨⬛⬛🟩🟨⬛", "🟩🟩🟩🟩🟩🟩"];
  it("solved: header shows guesses/6 and streak, then rows, then footer", () => {
    const out = buildShareText({ puzzleNumber: 247, solved: true, guessCount: 2, streak: 12, rows });
    expect(out).toBe(["Countle #247  2/6  🔥12", "🟨⬛⬛🟩🟨⬛", "🟩🟩🟩🟩🟩🟩", "countle.app"].join("\n"));
  });
  it("failed: score is X/6", () => {
    const out = buildShareText({ puzzleNumber: 247, solved: false, guessCount: 6, streak: 0, rows });
    expect(out.split("\n")[0]).toBe("Countle #247  X/6  🔥0");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- share.test`
Expected: FAIL — cannot resolve `./share`.

- [ ] **Step 3: Implement `share.ts`**

Create `src/lib/countle/share.ts`:

```ts
import { GUESS_LIMIT } from "./constants";

export function buildShareText(opts: {
  puzzleNumber: number;
  solved: boolean;
  guessCount: number;
  streak: number;
  rows: string[];
}): string {
  const score = opts.solved ? String(opts.guessCount) : "X";
  const header = `Countle #${opts.puzzleNumber}  ${score}/${GUESS_LIMIT}  🔥${opts.streak}`;
  return [header, ...opts.rows, "countle.app"].join("\n");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- share.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/countle/share.ts src/lib/countle/share.test.ts
git commit -m "feat(engine): spoiler-free share text builder"
```

---

## Task 7: localStorage state machine

**Files:**
- Create: `src/lib/countle/state.ts`, `src/lib/countle/index.ts`
- Test: `src/lib/countle/state.test.ts`

**Interfaces:**
- Consumes: `CountleState` (Task 1); `prevDateKey` (Task 2); `GUESS_LIMIT` (constants).
- Produces: `initialState()`, `parseState(raw: string | null): CountleState`, `serializeState(s: CountleState): string`, `startDay(s: CountleState, dateKey: string): CountleState`, `recordGuess(s: CountleState, fips: string, opts: { isCorrect: boolean; dateKey: string; answerFips: string }): CountleState`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/countle/state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { initialState, parseState, serializeState, startDay, recordGuess } from "./state";

describe("initialState / parse / serialize", () => {
  it("initial is empty and well-formed", () => {
    const s = initialState();
    expect(s.schemaVersion).toBe(1);
    expect(s.streak).toBe(0);
    expect(s.guessDistribution).toEqual([0, 0, 0, 0, 0, 0]);
    expect(s.today).toBeNull();
  });
  it("parseState falls back to initial on null/garbage/wrong version", () => {
    expect(parseState(null).gamesPlayed).toBe(0);
    expect(parseState("{not json").gamesPlayed).toBe(0);
    expect(parseState(JSON.stringify({ schemaVersion: 99 })).gamesPlayed).toBe(0);
  });
  it("round-trips a valid state", () => {
    const s = recordGuess(startDay(initialState(), "2026-06-25"), "06037", { isCorrect: true, dateKey: "2026-06-25", answerFips: "06037" });
    expect(parseState(serializeState(s)).streak).toBe(1);
  });
});

describe("startDay", () => {
  it("creates a fresh today on a new day, preserves an in-progress today", () => {
    const a = startDay(initialState(), "2026-06-25");
    expect(a.today).toEqual({ dateKey: "2026-06-25", guesses: [], solved: false, finished: false });
    const b = recordGuess(a, "17031", { isCorrect: false, dateKey: "2026-06-25", answerFips: "06037" });
    expect(startDay(b, "2026-06-25").today!.guesses).toEqual(["17031"]); // same day untouched
    expect(startDay(b, "2026-06-26").today!.guesses).toEqual([]);        // new day reset
  });
});

describe("recordGuess", () => {
  it("a correct guess solves, finishes, sets streak=1, records distribution + solved county", () => {
    const s = recordGuess(startDay(initialState(), "2026-06-25"), "06037", { isCorrect: true, dateKey: "2026-06-25", answerFips: "06037" });
    expect(s.today!.solved).toBe(true);
    expect(s.today!.finished).toBe(true);
    expect(s.streak).toBe(1);
    expect(s.gamesPlayed).toBe(1);
    expect(s.guessDistribution).toEqual([1, 0, 0, 0, 0, 0]); // solved in 1
    expect(s.solvedCounties).toContain("06037");
    expect(s.encounteredCounties).toContain("06037");
    expect(s.lastPlayedDateKey).toBe("2026-06-25");
  });

  it("six wrong guesses finishes as a loss: streak 0, fails++, no solved county", () => {
    let s = startDay(initialState(), "2026-06-25");
    for (let i = 0; i < 6; i++) s = recordGuess(s, `0000${i}`, { isCorrect: false, dateKey: "2026-06-25", answerFips: "06037" });
    expect(s.today!.finished).toBe(true);
    expect(s.today!.solved).toBe(false);
    expect(s.streak).toBe(0);
    expect(s.fails).toBe(1);
    expect(s.gamesPlayed).toBe(1);
    expect(s.solvedCounties).not.toContain("06037");
    expect(s.encounteredCounties.length).toBe(6);
  });

  it("guesses after the game is finished are ignored", () => {
    let s = recordGuess(startDay(initialState(), "2026-06-25"), "06037", { isCorrect: true, dateKey: "2026-06-25", answerFips: "06037" });
    s = recordGuess(s, "17031", { isCorrect: false, dateKey: "2026-06-25", answerFips: "06037" });
    expect(s.today!.guesses).toEqual(["06037"]);
    expect(s.gamesPlayed).toBe(1);
  });

  it("consecutive-day solves grow the streak; a skipped day resets it", () => {
    let s = recordGuess(startDay(initialState(), "2026-06-25"), "06037", { isCorrect: true, dateKey: "2026-06-25", answerFips: "06037" });
    s = recordGuess(startDay(s, "2026-06-26"), "17031", { isCorrect: true, dateKey: "2026-06-26", answerFips: "17031" });
    expect(s.streak).toBe(2);
    expect(s.maxStreak).toBe(2);
    // skip 06-27, play 06-28 → streak resets to 1
    s = recordGuess(startDay(s, "2026-06-28"), "36061", { isCorrect: true, dateKey: "2026-06-28", answerFips: "36061" });
    expect(s.streak).toBe(1);
    expect(s.maxStreak).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- state.test`
Expected: FAIL — cannot resolve `./state`.

- [ ] **Step 3: Implement `state.ts`**

Create `src/lib/countle/state.ts`:

```ts
import type { CountleState } from "./types";
import { GUESS_LIMIT } from "./constants";
import { prevDateKey } from "./daily";

export function initialState(): CountleState {
  return {
    schemaVersion: 1,
    lastPlayedDateKey: null,
    today: null,
    streak: 0,
    maxStreak: 0,
    gamesPlayed: 0,
    guessDistribution: [0, 0, 0, 0, 0, 0],
    fails: 0,
    solvedCounties: [],
    encounteredCounties: [],
  };
}

export function parseState(raw: string | null): CountleState {
  if (!raw) return initialState();
  try {
    const obj = JSON.parse(raw);
    if (!obj || obj.schemaVersion !== 1) return initialState();
    // Trust v1 shape; fill any missing arrays defensively.
    return { ...initialState(), ...obj };
  } catch {
    return initialState();
  }
}

export function serializeState(s: CountleState): string {
  return JSON.stringify(s);
}

/** Ensure `today` matches dateKey; fresh slate on a new day. */
export function startDay(s: CountleState, dateKey: string): CountleState {
  if (s.today && s.today.dateKey === dateKey) return s;
  return { ...s, today: { dateKey, guesses: [], solved: false, finished: false } };
}

function addUnique(list: string[], fips: string): string[] {
  return list.includes(fips) ? list : [...list, fips];
}

export function recordGuess(
  s: CountleState,
  fips: string,
  opts: { isCorrect: boolean; dateKey: string; answerFips: string }
): CountleState {
  const today = s.today ?? { dateKey: opts.dateKey, guesses: [], solved: false, finished: false };
  if (today.finished) return s; // ignore post-game guesses

  const guesses = [...today.guesses, fips];
  const encounteredCounties = addUnique(s.encounteredCounties, fips);
  const willFinish = opts.isCorrect || guesses.length >= GUESS_LIMIT;

  if (!willFinish) {
    return { ...s, encounteredCounties, today: { ...today, guesses } };
  }

  // Finalize the game.
  const solved = opts.isCorrect;
  const playedYesterday = s.lastPlayedDateKey === prevDateKey(opts.dateKey);
  const streak = solved ? (playedYesterday ? s.streak + 1 : 1) : 0;
  const guessDistribution = [...s.guessDistribution];
  if (solved) guessDistribution[guesses.length - 1] += 1;

  return {
    ...s,
    today: { ...today, guesses, solved, finished: true },
    streak,
    maxStreak: Math.max(s.maxStreak, streak),
    gamesPlayed: s.gamesPlayed + 1,
    guessDistribution,
    fails: solved ? s.fails : s.fails + 1,
    solvedCounties: solved ? addUnique(s.solvedCounties, opts.answerFips) : s.solvedCounties,
    encounteredCounties,
    lastPlayedDateKey: opts.dateKey,
  };
}
```

Create `src/lib/countle/index.ts` (barrel for the UI):

```ts
export * from "./types";
export * from "./constants";
export * from "./data";
export * from "./daily";
export * from "./geo";
export * from "./feedback";
export * from "./share";
export * from "./state";
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- state.test`
Expected: PASS — all streak/distribution/finish/ignore-after-finish cases green.

- [ ] **Step 5: Run the WHOLE suite (engine + Plan 1 lib must all stay green)**

Run: `npm test`
Expected: PASS — all prior tests plus the new engine tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/countle/state.ts src/lib/countle/index.ts src/lib/countle/state.test.ts
git commit -m "feat(engine): localStorage state machine (streak, distribution, collection)"
```

---

## Task 8: Real-dataset integration guard

**Files:**
- Create: `src/lib/countle/integration.test.ts`

**Interfaces:**
- Consumes: the public API + the real committed `public/data/counties.json`.

- [ ] **Step 1: Write the integration test**

Create `src/lib/countle/integration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { buildDataset, getDailyCounty, evaluateGuess, dateKeyUTC, puzzleNumber } from "./index";
import type { CountiesPayload } from "./types";

const payload = JSON.parse(
  readFileSync(join(process.cwd(), "public", "data", "counties.json"), "utf-8")
) as CountiesPayload;
const ds = buildDataset(payload);

describe("real dataset", () => {
  it("has 3,144 counties and a 271-county answer pool", () => {
    expect(ds.all.length).toBe(3144);
    expect(ds.answerPoolFips.length).toBe(271);
  });
  it("daily selection is deterministic and always an answer-pool county", () => {
    const a = getDailyCounty(ds, "2026-06-25");
    const b = getDailyCounty(ds, "2026-06-25");
    expect(a.fips).toBe(b.fips);
    expect(a.isAnswerPool).toBe(true);
  });
  it("a self-guess on the daily county is correct with an all-green row", () => {
    const day = getDailyCounty(ds, "2026-06-25");
    const r = evaluateGuess(day, day);
    expect(r.isCorrect).toBe(true);
    expect(r.shareRow).toBe("🟩🟩🟩🟩🟩🟩");
  });
  it("guessing LA (06037) against Cook (17031) yields a westbound-or-eastbound real distance", () => {
    const la = ds.byFips.get("06037")!;
    const cook = ds.byFips.get("17031")!;
    const r = evaluateGuess(la, cook);
    expect(r.isCorrect).toBe(false);
    expect(r.distanceMiles).toBeGreaterThan(1500);
    expect(r.stats).toHaveLength(6);
  });
  it("today's puzzle number is positive", () => {
    expect(puzzleNumber(dateKeyUTC(new Date("2026-06-25T12:00:00Z")))).toBe(1);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm test -- integration.test`
Expected: PASS — confirms the engine works end-to-end against the real Plan 1 dataset.

- [ ] **Step 3: Run the whole suite + commit**

Run: `npm test`
Expected: PASS (all engine + Plan 1 tests).

```bash
git add src/lib/countle/integration.test.ts
git commit -m "test(engine): integration guard against the real counties.json"
```

---

## Self-Review

**Spec coverage:**
- §4 per-stat feedback (delta, direction, magnitude, closeness) → Task 4 `compareStats`. ✓
- §4 geographic feedback (haversine miles + 8-point bearing) → Task 3 + Task 5. ✓
- §4 progressive blur schedule → Task 4 `blurForGuess`. ✓
- §4 notable-person clue at guess 5 → `NOTABLE_CLUE_GUESS` constant (the UI gates display on it; the engine just exposes the threshold). ✓
- §3/§4 deterministic UTC daily selection → Task 2. ✓
- §5 spoiler-free share grid → Task 4 `shareRow` + Task 6 `buildShareText`. ✓
- §6 collection (solved/encountered) + streak + distribution → Task 7 state machine. ✓
- §8 data contract → Task 1 types (using the LOCKED `wealth/health/...` display keys, not spec §8's stale list). ✓
- §8 localStorage `countle-v1` shape → `CountleState` (Task 1) + state machine (Task 7). The literal key string `countle-v1` belongs to the UI's storage wrapper (Plan 3), not the pure engine. ✓

**Placeholder scan:** none — every step has complete code.

**Type consistency:** `StatKey`/`STAT_KEYS`, `CountyEntry`, `Dataset`, `GuessResult`, `CountleState` defined once in `types.ts` and imported everywhere; `compareStats`/`shareRow`/`evaluateGuess`/`recordGuess` signatures match across tasks; `prevDateKey` defined in Task 2 and consumed in Task 7.

## Notes for Plan 3 (UI) — not built here
- The literal localStorage key `countle-v1`, the actual `localStorage` read/write, and `navigator.clipboard`/haptics live in the UI layer.
- `NOTABLE_CLUE_GUESS` and `BLUR_SCHEDULE` are consumed by the UI for the clue reveal and the accent-tile de-blur.
- The UI fetches `public/data/counties.json` (client) or imports it (server) and calls `buildDataset` once.
```
