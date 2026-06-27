# Warmer Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, headless engine for **Warmer** — the county hot/cold proximity daily game — in `src/lib/warmer/`, fully vitest-TDD'd.

**Architecture:** Mirror Countle/Connections engine layering. Small focused modules (types, daily, game, state, session, share, stats, persistence) re-exported from a barrel `index.ts`. The engine computes everything at runtime from the locked `public/data/counties.json` (via Countle's `buildDataset`) and Countle's geo/daily helpers — **no new data file**. The session module is the integration heart (view-model + the guess reducer).

**Tech Stack:** TypeScript, vitest. Reuses `src/lib/countle` (`geo.ts`, `daily.ts`, `data.ts`, `types.ts`).

## Global Constraints

- **localStorage key:** exactly `warmer-v1`.
- **Daily target:** drawn from the 271 `isAnswerPool` counties via `pickDailyFips`, using the **salted key** `"<dateKey>:warmer"` (so Warmer never shares Countle's daily answer).
- **Heat tiers (5):** `"found"` (0 mi) · `"hot"` (<75) · `"warm"` (<250) · `"tepid"` (<700) · `"cold"` (≥700). Tier is computed from the **unrounded** distance; the displayed `miles` is `Math.round`ed.
- **Tier emoji:** found 🟩 · hot 🟥 · warm 🟧 · tepid 🟨 · cold 🟦.
- **Guess model:** unlimited guesses; **score = guess count**; **streak = consecutive days solved**; a **give-up** counts as played, breaks the streak, no solve. Duplicate guesses are rejected (not appended, not counted).
- **Share text names the STATE** (not the county): solved → `Warmer #<N> — found it in <State> in <K>`; gave up → `Warmer #<N> — gave up (<State>)`; second line is the tier-emoji row; third line `county.games`.
- **Imports:** the engine uses **relative** paths to `../countle/...` (vitest has no `@/` alias). The barrel does **not** export any validator (none exists).
- **Bearing direction:** `evaluateGuess` reports the bearing/arrow **from the guess toward the target** (`bearingDeg(guess, target)`).

---

## File Structure

- `src/lib/warmer/types.ts` — `HeatTier`, `GuessFeedback`, `WarmerState`.
- `src/lib/warmer/game.ts` — `heatTier`, `isSolved`, `evaluateGuess`, `guessBucket`, `GUESS_BUCKETS` (pure scoring).
- `src/lib/warmer/daily.ts` — `warmerDateKey`, `getDailyTarget` (salted pick).
- `src/lib/warmer/state.ts` — `initialState`, `parseState`, `serializeState`, `startDay`, `recordGuess`, `giveUp`.
- `src/lib/warmer/session.ts` — `WarmerSession`, `buildWarmerSession` (view-model), `applyGuess` (reducer).
- `src/lib/warmer/share.ts` — `tierEmoji`, `buildShareText`.
- `src/lib/warmer/stats.ts` — `WarmerStats`, `warmerStats`.
- `src/lib/warmer/persistence.ts` — `STORAGE_KEY`, `StorageLike`, `loadWarmerState`, `saveWarmerState`.
- `src/lib/warmer/index.ts` — barrel.

---

## Task 1: Heat scoring core (`types.ts` + `game.ts`)

**Files:**
- Create: `src/lib/warmer/types.ts`, `src/lib/warmer/game.ts`
- Test: `src/lib/warmer/game.test.ts`

**Interfaces:**
- Consumes: `CountyEntry` from `../countle/types`; `haversineMiles`, `bearingDeg`, `compass8` from `../countle/geo`.
- Produces:
  - `type HeatTier = "found" | "hot" | "warm" | "tepid" | "cold"`
  - `interface GuessFeedback { fips: string; miles: number; bearingDeg: number; arrow: string; label: string; tier: HeatTier }`
  - `interface WarmerState { schemaVersion: 1; lastPlayedDateKey: string | null; today: { dateKey: string; guesses: string[]; solved: boolean; gaveUp: boolean } | null; streak: number; maxStreak: number; gamesPlayed: number; solves: number; bestGuesses: number | null; guessDistribution: Record<string, number> }`
  - `heatTier(miles: number): HeatTier`
  - `isSolved(target: CountyEntry, guessFips: string): boolean`
  - `evaluateGuess(target: CountyEntry, guess: CountyEntry): GuessFeedback`
  - `GUESS_BUCKETS: string[]` (= `["1-3","4-6","7-9","10+"]`)
  - `guessBucket(n: number): string`

- [ ] **Step 1: Write the failing test**

`src/lib/warmer/game.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/warmer/game.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `types.ts` then `game.ts`**

`src/lib/warmer/types.ts`:
```ts
export type HeatTier = "found" | "hot" | "warm" | "tepid" | "cold";

export interface GuessFeedback {
  fips: string;
  miles: number;
  bearingDeg: number;
  arrow: string;
  label: string;
  tier: HeatTier;
}

export interface WarmerState {
  schemaVersion: 1;
  lastPlayedDateKey: string | null;
  today: { dateKey: string; guesses: string[]; solved: boolean; gaveUp: boolean } | null; // guesses = fips, in order
  streak: number;
  maxStreak: number;
  gamesPlayed: number;
  solves: number;
  bestGuesses: number | null;                 // fewest guesses to a solve, all-time
  guessDistribution: Record<string, number>;  // bucket label -> count
}
```

`src/lib/warmer/game.ts`:
```ts
import type { CountyEntry } from "../countle/types";
import { haversineMiles, bearingDeg, compass8 } from "../countle/geo";
import type { GuessFeedback, HeatTier } from "./types";

export function heatTier(miles: number): HeatTier {
  if (miles === 0) return "found";
  if (miles < 75) return "hot";
  if (miles < 250) return "warm";
  if (miles < 700) return "tepid";
  return "cold";
}

export function isSolved(target: CountyEntry, guessFips: string): boolean {
  return target.fips === guessFips;
}

export function evaluateGuess(target: CountyEntry, guess: CountyEntry): GuessFeedback {
  const same = guess.fips === target.fips;
  const rawMiles = same ? 0 : haversineMiles(guess, target);
  const deg = same ? 0 : bearingDeg(guess, target); // from the guess toward the target
  const { arrow, label } = compass8(deg);
  return { fips: guess.fips, miles: Math.round(rawMiles), bearingDeg: deg, arrow, label, tier: heatTier(rawMiles) };
}

export const GUESS_BUCKETS = ["1-3", "4-6", "7-9", "10+"];
export function guessBucket(n: number): string {
  if (n <= 3) return "1-3";
  if (n <= 6) return "4-6";
  if (n <= 9) return "7-9";
  return "10+";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/warmer/game.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/warmer/types.ts src/lib/warmer/game.ts src/lib/warmer/game.test.ts
git commit -m "feat(warmer): heat scoring core (types, heatTier, evaluateGuess, guessBucket)"
```

---

## Task 2: Daily target (`daily.ts`)

**Files:**
- Create: `src/lib/warmer/daily.ts`
- Test: `src/lib/warmer/daily.test.ts`

**Interfaces:**
- Consumes: `pickDailyFips` from `../countle/daily`; `CountyEntry`, `Dataset` from `../countle/types`.
- Produces: `warmerDateKey(dateKey: string): string`; `getDailyTarget(dataset: Dataset, dateKey: string): CountyEntry`.

- [ ] **Step 1: Write the failing test**

`src/lib/warmer/daily.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/warmer/daily.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `daily.ts`**

`src/lib/warmer/daily.ts`:
```ts
import type { CountyEntry, Dataset } from "../countle/types";
import { pickDailyFips } from "../countle/daily";

/** Salted so Warmer's daily target never coincides with Countle's. */
export function warmerDateKey(dateKey: string): string {
  return `${dateKey}:warmer`;
}

export function getDailyTarget(dataset: Dataset, dateKey: string): CountyEntry {
  const fips = pickDailyFips(dataset.answerPoolFips, warmerDateKey(dateKey));
  const c = dataset.byFips.get(fips);
  if (!c) throw new Error(`warmer target ${fips} not in dataset`);
  return c;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/warmer/daily.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/warmer/daily.ts src/lib/warmer/daily.test.ts
git commit -m "feat(warmer): salted daily target selection"
```

---

## Task 3: State machine (`state.ts`)

**Files:**
- Create: `src/lib/warmer/state.ts`
- Test: `src/lib/warmer/state.test.ts`

**Interfaces:**
- Consumes: `WarmerState` from `./types`; `guessBucket` from `./game`; `prevDateKey` from `../countle/daily`.
- Produces: `initialState()`, `parseState(raw)`, `serializeState(s)`, `startDay(s, dateKey)`, `recordGuess(s, fips, targetFips, dateKey)`, `giveUp(s, dateKey)` — all returning `WarmerState`.

- [ ] **Step 1: Write the failing test**

`src/lib/warmer/state.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { initialState, parseState, serializeState, startDay, recordGuess, giveUp } from "./state";

const DATE = "2026-06-27";
const TARGET = "17031";

describe("parse/serialize", () => {
  it("returns initial state for null or malformed", () => {
    expect(parseState(null)).toEqual(initialState());
    expect(parseState("{not json")).toEqual(initialState());
    expect(parseState(JSON.stringify({ schemaVersion: 2 }))).toEqual(initialState());
  });
  it("round-trips", () => {
    const s = { ...initialState(), gamesPlayed: 3, solves: 2, streak: 2 };
    expect(parseState(serializeState(s))).toEqual(s);
  });
});

describe("startDay", () => {
  it("creates today's slate and is idempotent for the same day", () => {
    const s1 = startDay(initialState(), DATE);
    expect(s1.today).toEqual({ dateKey: DATE, guesses: [], solved: false, gaveUp: false });
    expect(startDay(s1, DATE)).toBe(s1);
  });
  it("replaces a stale day", () => {
    const s1 = startDay(initialState(), "2026-06-26");
    const s2 = startDay(s1, DATE);
    expect(s2.today!.dateKey).toBe(DATE);
    expect(s2.today!.guesses).toEqual([]);
  });
});

describe("recordGuess", () => {
  it("appends a non-target guess without solving", () => {
    const s = recordGuess(startDay(initialState(), DATE), "06037", TARGET, DATE);
    expect(s.today!.guesses).toEqual(["06037"]);
    expect(s.today!.solved).toBe(false);
    expect(s.gamesPlayed).toBe(0);
  });
  it("does not append a duplicate guess", () => {
    let s = recordGuess(startDay(initialState(), DATE), "06037", TARGET, DATE);
    s = recordGuess(s, "06037", TARGET, DATE);
    expect(s.today!.guesses).toEqual(["06037"]);
  });
  it("solving finalizes: solved, gamesPlayed/solves +1, bestGuesses, distribution, streak", () => {
    let s = startDay(initialState(), DATE);
    s = recordGuess(s, "06037", TARGET, DATE); // guess 1
    s = recordGuess(s, "48201", TARGET, DATE); // guess 2
    s = recordGuess(s, TARGET, TARGET, DATE);  // guess 3 = solve
    expect(s.today!.solved).toBe(true);
    expect(s.gamesPlayed).toBe(1);
    expect(s.solves).toBe(1);
    expect(s.bestGuesses).toBe(3);
    expect(s.guessDistribution["1-3"]).toBe(1);
    expect(s.streak).toBe(1);
    expect(s.maxStreak).toBe(1);
    expect(s.lastPlayedDateKey).toBe(DATE);
  });
  it("continues the streak when yesterday was played", () => {
    const base = { ...initialState(), streak: 4, maxStreak: 4, lastPlayedDateKey: "2026-06-26" };
    const s = recordGuess(startDay(base, DATE), TARGET, TARGET, DATE);
    expect(s.streak).toBe(5);
    expect(s.maxStreak).toBe(5);
  });
});

describe("giveUp", () => {
  it("marks gaveUp, breaks the streak, counts as played, no solve", () => {
    const base = { ...initialState(), streak: 3, lastPlayedDateKey: "2026-06-26" };
    const s = giveUp(startDay(base, DATE), DATE);
    expect(s.today!.gaveUp).toBe(true);
    expect(s.today!.solved).toBe(false);
    expect(s.streak).toBe(0);
    expect(s.gamesPlayed).toBe(1);
    expect(s.solves).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/warmer/state.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `state.ts`**

`src/lib/warmer/state.ts`:
```ts
import type { WarmerState } from "./types";
import { guessBucket } from "./game";
import { prevDateKey } from "../countle/daily";

export function initialState(): WarmerState {
  return {
    schemaVersion: 1, lastPlayedDateKey: null, today: null,
    streak: 0, maxStreak: 0, gamesPlayed: 0, solves: 0, bestGuesses: null, guessDistribution: {},
  };
}

export function parseState(raw: string | null): WarmerState {
  if (!raw) return initialState();
  try {
    const o = JSON.parse(raw);
    if (!o || o.schemaVersion !== 1) return initialState();
    return { ...initialState(), ...o };
  } catch {
    return initialState();
  }
}

export function serializeState(s: WarmerState): string {
  return JSON.stringify(s);
}

export function startDay(s: WarmerState, dateKey: string): WarmerState {
  if (s.today && s.today.dateKey === dateKey) return s;
  return { ...s, today: { dateKey, guesses: [], solved: false, gaveUp: false } };
}

export function recordGuess(s: WarmerState, fips: string, targetFips: string, dateKey: string): WarmerState {
  const today = s.today ?? { dateKey, guesses: [], solved: false, gaveUp: false };
  if (today.solved || today.gaveUp) return s;

  const guesses = today.guesses.includes(fips) ? today.guesses : [...today.guesses, fips];
  const solved = fips === targetFips;
  const nextToday = { ...today, guesses, solved };
  if (!solved) return { ...s, today: nextToday };

  const count = guesses.length;
  const playedYesterday = s.lastPlayedDateKey === prevDateKey(dateKey);
  const streak = playedYesterday ? s.streak + 1 : 1;
  const bucket = guessBucket(count);
  return {
    ...s,
    today: nextToday,
    streak,
    maxStreak: Math.max(s.maxStreak, streak),
    gamesPlayed: s.gamesPlayed + 1,
    solves: s.solves + 1,
    bestGuesses: s.bestGuesses == null ? count : Math.min(s.bestGuesses, count),
    guessDistribution: { ...s.guessDistribution, [bucket]: (s.guessDistribution[bucket] ?? 0) + 1 },
    lastPlayedDateKey: dateKey,
  };
}

export function giveUp(s: WarmerState, dateKey: string): WarmerState {
  const today = s.today ?? { dateKey, guesses: [], solved: false, gaveUp: false };
  if (today.solved || today.gaveUp) return s;
  return {
    ...s,
    today: { ...today, gaveUp: true },
    streak: 0,
    gamesPlayed: s.gamesPlayed + 1,
    lastPlayedDateKey: dateKey,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/warmer/state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/warmer/state.ts src/lib/warmer/state.test.ts
git commit -m "feat(warmer): state machine (guesses, solve/give-up finalization, streak)"
```

---

## Task 4: Session view-model + guess reducer (`session.ts`)

**Files:**
- Create: `src/lib/warmer/session.ts`
- Test: `src/lib/warmer/session.test.ts`

**Interfaces:**
- Consumes: `CountyEntry`, `Dataset` from `../countle/types`; `GuessFeedback`, `WarmerState` from `./types`; `getDailyTarget` from `./daily`; `evaluateGuess` from `./game`; `startDay`, `recordGuess` from `./state`; `tierEmoji`, `buildShareText` from `./share`; `puzzleNumber` from `../countle/daily`.
- Produces:
  - `interface WarmerSession { dateKey: string; puzzleNumber: number; guesses: GuessFeedback[]; guessCount: number; closest: GuessFeedback | null; solved: boolean; gaveUp: boolean; finished: boolean; target: CountyEntry | null; streak: number; shareRows: string[]; shareText: string }`
  - `buildWarmerSession(dataset: Dataset, state: WarmerState, dateKey: string): WarmerSession`
  - `type ApplyGuessResult = { ok: true; state: WarmerState } | { ok: false; reason: "duplicate" | "unknown" }`
  - `applyGuess(dataset: Dataset, state: WarmerState, dateKey: string, fips: string): ApplyGuessResult`

**Note (for the implementer):** `share.ts` (Task 5) is imported here but built later. Implement `session.ts` against the `share.ts` interface shown in Task 5 (`tierEmoji(tier)`, `buildShareText({ puzzleNumber, stateName, guessCount, solved, tiers })`). To keep this task independently testable, **also create a minimal `src/lib/warmer/share.ts` in this task** with the real implementations from Task 5 (then Task 5 only adds its tests + barrel). The exact `share.ts` code is in Task 5 Step 3 — create it verbatim here.

- [ ] **Step 1: Write the failing test**

`src/lib/warmer/session.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildWarmerSession, applyGuess } from "./session";
import { initialState } from "./state";
import { getDailyTarget } from "./daily";
import type { CountyEntry, Dataset } from "../countle/types";

function mk(fips: string, lat: number, lng: number, state_name = "Zed"): CountyEntry {
  return {
    fips, name: `C${fips}`, state_abbr: "ZZ", state_name, region: "Midwest", county_seat: null,
    lat, lng, stats: { wealth: 50, health: 50, people: 50, land: 50, danger: 50, education: 50 },
    display: { wealth: "", health: "", people: "", land: "", danger: "", education: "" },
    rarity: "common", hasArt: false, isAnswerPool: true, notable_person: null, notable_person_desc: null, flavor: null,
  };
}
// Spread the answer pool out so daily selection + distances are meaningful.
const POOL: CountyEntry[] = [
  mk("06037", 34.0, -118.2), mk("17031", 41.8, -87.7), mk("48201", 29.8, -95.4),
  mk("48453", 30.3, -97.7), mk("36061", 40.8, -74.0), mk("53033", 47.5, -122.3),
];
const ds: Dataset = { byFips: new Map(POOL.map((c) => [c.fips, c])), all: POOL, answerPoolFips: POOL.map((c) => c.fips).sort() };
const DATE = "2026-06-27";
const TARGET = getDailyTarget(ds, DATE); // whatever the salted pick lands on

describe("buildWarmerSession", () => {
  it("fresh state: no guesses, no closest, not finished, target hidden", () => {
    const v = buildWarmerSession(ds, initialState(), DATE);
    expect(v.guesses).toHaveLength(0);
    expect(v.guessCount).toBe(0);
    expect(v.closest).toBeNull();
    expect(v.finished).toBe(false);
    expect(v.target).toBeNull();
  });

  it("after one non-winning guess: 1 guess, closest set, target still hidden", () => {
    const other = ds.all.find((c) => c.fips !== TARGET.fips)!;
    const r = applyGuess(ds, initialState(), DATE, other.fips);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = buildWarmerSession(ds, r.state, DATE);
    expect(v.guessCount).toBe(1);
    expect(v.closest?.fips).toBe(other.fips);
    expect(v.finished).toBe(false);
    expect(v.target).toBeNull();
  });

  it("orders guesses closest-first", () => {
    let s = initialState();
    for (const c of ds.all.filter((c) => c.fips !== TARGET.fips)) {
      const r = applyGuess(ds, s, DATE, c.fips);
      if (r.ok) s = r.state;
    }
    const v = buildWarmerSession(ds, s, DATE);
    const miles = v.guesses.map((g) => g.miles);
    expect([...miles]).toEqual([...miles].sort((a, b) => a - b));
  });

  it("on solve: solved + finished true, target revealed, share text names the state", () => {
    const r = applyGuess(ds, initialState(), DATE, TARGET.fips);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = buildWarmerSession(ds, r.state, DATE);
    expect(v.solved).toBe(true);
    expect(v.finished).toBe(true);
    expect(v.target?.fips).toBe(TARGET.fips);
    expect(v.shareText).toContain(TARGET.state_name);
    expect(v.shareText).toContain("🟩");
  });
});

describe("applyGuess", () => {
  it("rejects an unknown fips", () => {
    const r = applyGuess(ds, initialState(), DATE, "99999");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("unknown");
  });
  it("rejects a duplicate guess", () => {
    const other = ds.all.find((c) => c.fips !== TARGET.fips)!;
    const first = applyGuess(ds, initialState(), DATE, other.fips);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const dup = applyGuess(ds, first.state, DATE, other.fips);
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.reason).toBe("duplicate");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/warmer/session.test.ts`
Expected: FAIL (`session.ts`/`share.ts` not found).

- [ ] **Step 3: Create `share.ts` (verbatim from Task 5) then implement `session.ts`**

First create `src/lib/warmer/share.ts` exactly as specified in Task 5 Step 3.

Then `src/lib/warmer/session.ts`:
```ts
import type { CountyEntry, Dataset } from "../countle/types";
import type { GuessFeedback, WarmerState } from "./types";
import { getDailyTarget } from "./daily";
import { evaluateGuess } from "./game";
import { startDay, recordGuess } from "./state";
import { tierEmoji, buildShareText } from "./share";
import { puzzleNumber } from "../countle/daily";

export interface WarmerSession {
  dateKey: string;
  puzzleNumber: number;
  guesses: GuessFeedback[];   // closest-first
  guessCount: number;
  closest: GuessFeedback | null;
  solved: boolean;
  gaveUp: boolean;
  finished: boolean;
  target: CountyEntry | null; // revealed only when finished
  streak: number;
  shareRows: string[];        // tier emoji per guess, in play order
  shareText: string;
}

export function buildWarmerSession(dataset: Dataset, state: WarmerState, dateKey: string): WarmerSession {
  const target = getDailyTarget(dataset, dateKey);
  const today = state.today && state.today.dateKey === dateKey ? state.today : null;
  const order = today?.guesses ?? [];
  const feedbacks = order.map((f) => evaluateGuess(target, dataset.byFips.get(f)!));
  const sorted = [...feedbacks].sort((a, b) => a.miles - b.miles);
  const solved = today?.solved ?? false;
  const gaveUp = today?.gaveUp ?? false;
  const finished = solved || gaveUp;
  const pn = puzzleNumber(dateKey);
  return {
    dateKey,
    puzzleNumber: pn,
    guesses: sorted,
    guessCount: order.length,
    closest: sorted.length ? sorted[0] : null,
    solved, gaveUp, finished,
    target: finished ? target : null,
    streak: state.streak,
    shareRows: feedbacks.map((fb) => tierEmoji(fb.tier)),
    shareText: buildShareText({ puzzleNumber: pn, stateName: target.state_name, guessCount: order.length, solved, tiers: feedbacks.map((f) => f.tier) }),
  };
}

export type ApplyGuessResult = { ok: true; state: WarmerState } | { ok: false; reason: "duplicate" | "unknown" };

export function applyGuess(dataset: Dataset, state: WarmerState, dateKey: string, fips: string): ApplyGuessResult {
  if (!dataset.byFips.has(fips)) return { ok: false, reason: "unknown" };
  const target = getDailyTarget(dataset, dateKey);
  const started = startDay(state, dateKey);
  if (started.today!.guesses.includes(fips)) return { ok: false, reason: "duplicate" };
  return { ok: true, state: recordGuess(started, fips, target.fips, dateKey) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/warmer/session.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/warmer/session.ts src/lib/warmer/share.ts src/lib/warmer/session.test.ts
git commit -m "feat(warmer): session view-model + applyGuess reducer (+ share.ts)"
```

---

## Task 5: Share tests, stats, persistence, barrel

**Files:**
- Verify/keep: `src/lib/warmer/share.ts` (created in Task 4)
- Create: `src/lib/warmer/stats.ts`, `src/lib/warmer/persistence.ts`, `src/lib/warmer/index.ts`
- Test: `src/lib/warmer/share.test.ts`, `src/lib/warmer/stats.test.ts`, `src/lib/warmer/persistence.test.ts`

**Interfaces:**
- Consumes: `HeatTier`, `WarmerState` from `./types`; `GUESS_BUCKETS` from `./game`; `parseState`/`serializeState` from `./state`.
- Produces:
  - `share.ts`: `tierEmoji(tier: HeatTier): string`; `buildShareText(opts: { puzzleNumber: number; stateName: string; guessCount: number; solved: boolean; tiers: HeatTier[] }): string`
  - `stats.ts`: `interface WarmerStats { played: number; solvePct: number; currentStreak: number; maxStreak: number; best: number | null; distribution: { bucket: string; count: number }[] }`; `warmerStats(state: WarmerState): WarmerStats`
  - `persistence.ts`: `STORAGE_KEY = "warmer-v1"`; `interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }`; `loadWarmerState(s)`, `saveWarmerState(s, st)`
  - `index.ts`: barrel re-exporting types/daily/game/state/session/share/stats/persistence

- [ ] **Step 1: Write the failing tests**

`src/lib/warmer/share.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { tierEmoji, buildShareText } from "./share";

describe("tierEmoji", () => {
  it("maps each tier to its square", () => {
    expect(tierEmoji("found")).toBe("🟩");
    expect(tierEmoji("hot")).toBe("🟥");
    expect(tierEmoji("warm")).toBe("🟧");
    expect(tierEmoji("tepid")).toBe("🟨");
    expect(tierEmoji("cold")).toBe("🟦");
  });
});

describe("buildShareText", () => {
  it("solved: names the state + guess count + ends on the found square", () => {
    const t = buildShareText({ puzzleNumber: 12, stateName: "Texas", guessCount: 4, solved: true, tiers: ["cold", "tepid", "warm", "found"] });
    expect(t).toContain("Warmer #12");
    expect(t).toContain("found it in Texas in 4");
    expect(t).toContain("🟦🟨🟧🟩");
    expect(t).toContain("county.games");
  });
  it("gave up: names the state, no 'found it'", () => {
    const t = buildShareText({ puzzleNumber: 12, stateName: "Texas", guessCount: 9, solved: false, tiers: ["cold", "cold"] });
    expect(t).toContain("gave up (Texas)");
    expect(t).not.toContain("found it");
  });
});
```

`src/lib/warmer/stats.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { warmerStats } from "./stats";
import { initialState } from "./state";
import type { WarmerState } from "./types";

const st = (over: Partial<WarmerState>): WarmerState => ({ ...initialState(), ...over });

describe("warmerStats", () => {
  it("0 solve rate when unplayed; rounded otherwise", () => {
    expect(warmerStats(st({})).solvePct).toBe(0);
    expect(warmerStats(st({ gamesPlayed: 4, solves: 3 })).solvePct).toBe(75);
  });
  it("passes through streak/best and emits all buckets in order", () => {
    const s = warmerStats(st({ gamesPlayed: 5, solves: 5, streak: 2, maxStreak: 4, bestGuesses: 3, guessDistribution: { "1-3": 2, "7-9": 1 } }));
    expect(s.currentStreak).toBe(2);
    expect(s.maxStreak).toBe(4);
    expect(s.best).toBe(3);
    expect(s.distribution).toEqual([
      { bucket: "1-3", count: 2 }, { bucket: "4-6", count: 0 }, { bucket: "7-9", count: 1 }, { bucket: "10+", count: 0 },
    ]);
  });
});
```

`src/lib/warmer/persistence.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { STORAGE_KEY, loadWarmerState, saveWarmerState, type StorageLike } from "./persistence";
import { initialState } from "./state";

function mem(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); } };
}

describe("warmer persistence", () => {
  it("uses the warmer-v1 key", () => {
    expect(STORAGE_KEY).toBe("warmer-v1");
  });
  it("round-trips and defaults to initial when empty/malformed", () => {
    const s = mem();
    expect(loadWarmerState(s)).toEqual(initialState());
    const state = { ...initialState(), gamesPlayed: 2, solves: 1 };
    saveWarmerState(s, state);
    expect(loadWarmerState(s)).toEqual(state);
    s.map.set(STORAGE_KEY, "{bad");
    expect(loadWarmerState(s)).toEqual(initialState());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/warmer/share.test.ts src/lib/warmer/stats.test.ts src/lib/warmer/persistence.test.ts`
Expected: `share.test.ts` PASSES if Task 4 already created `share.ts`; `stats`/`persistence` FAIL (modules not found).

- [ ] **Step 3: Implement `share.ts` (if not already present), `stats.ts`, `persistence.ts`, `index.ts`**

`src/lib/warmer/share.ts` (this is the exact file Task 4 created — keep it):
```ts
import type { HeatTier } from "./types";

const EMOJI: Record<HeatTier, string> = { found: "🟩", hot: "🟥", warm: "🟧", tepid: "🟨", cold: "🟦" };

export function tierEmoji(tier: HeatTier): string {
  return EMOJI[tier];
}

export function buildShareText(opts: {
  puzzleNumber: number; stateName: string; guessCount: number; solved: boolean; tiers: HeatTier[];
}): string {
  const head = opts.solved
    ? `Warmer #${opts.puzzleNumber} — found it in ${opts.stateName} in ${opts.guessCount}`
    : `Warmer #${opts.puzzleNumber} — gave up (${opts.stateName})`;
  return `${head}\n${opts.tiers.map((t) => EMOJI[t]).join("")}\ncounty.games`;
}
```

`src/lib/warmer/stats.ts`:
```ts
import type { WarmerState } from "./types";
import { GUESS_BUCKETS } from "./game";

export interface WarmerStats {
  played: number;
  solvePct: number;
  currentStreak: number;
  maxStreak: number;
  best: number | null;
  distribution: { bucket: string; count: number }[];
}

export function warmerStats(state: WarmerState): WarmerStats {
  const played = state.gamesPlayed;
  return {
    played,
    solvePct: played > 0 ? Math.round((state.solves / played) * 100) : 0,
    currentStreak: state.streak,
    maxStreak: state.maxStreak,
    best: state.bestGuesses,
    distribution: GUESS_BUCKETS.map((bucket) => ({ bucket, count: state.guessDistribution[bucket] ?? 0 })),
  };
}
```

`src/lib/warmer/persistence.ts`:
```ts
import { parseState, serializeState } from "./state";
import type { WarmerState } from "./types";

export const STORAGE_KEY = "warmer-v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadWarmerState(storage: StorageLike): WarmerState {
  return parseState(storage.getItem(STORAGE_KEY));
}

export function saveWarmerState(storage: StorageLike, state: WarmerState): void {
  storage.setItem(STORAGE_KEY, serializeState(state));
}
```

`src/lib/warmer/index.ts`:
```ts
export * from "./types";
export * from "./daily";
export * from "./game";
export * from "./state";
export * from "./session";
export * from "./share";
export * from "./stats";
export * from "./persistence";
```

- [ ] **Step 4: Run the tests + the whole warmer suite**

Run: `npx vitest run src/lib/warmer/`
Expected: PASS (all warmer tests).

- [ ] **Step 5: Commit**
```bash
git add src/lib/warmer/share.ts src/lib/warmer/stats.ts src/lib/warmer/persistence.ts src/lib/warmer/index.ts src/lib/warmer/share.test.ts src/lib/warmer/stats.test.ts src/lib/warmer/persistence.test.ts
git commit -m "feat(warmer): share, stats, persistence + engine barrel"
```

---

## Self-Review (author)

- **Spec coverage:** salted daily target (Task 2) · heat tiers + miles + bearing (Task 1) · unlimited guesses / score=count / streak / give-up (Task 3) · closest-first session + duplicate/unknown guards + target-hidden-until-finished (Task 4) · state-naming share + bucketed stats + `warmer-v1` persistence (Task 5). No data-generation needed (matches spec §4). All covered.
- **Type consistency:** `HeatTier`, `GuessFeedback`, `WarmerState` (Task 1) are consumed unchanged downstream. `guessBucket`/`GUESS_BUCKETS` defined in `game.ts` (Task 1), used by `state.ts` (Task 3) and `stats.ts` (Task 5) — no forward dependency. `share.ts` is created in Task 4 (needed by `session.ts`) and only *tested* in Task 5; the barrel re-exports it once.
- **Import discipline:** all cross-package imports are relative to `../countle/...`; no `@/` alias (vitest has none). No validator in the barrel.
- **Bearing direction:** `bearingDeg(guess, target)` so the arrow points from the player's guess toward the hidden target.
