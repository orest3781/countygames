# County Connections Engine Implementation Plan (Plan 1 — headless engine)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pure, headless, fully unit-tested TypeScript engine for County Connections — the daily puzzle selection + seeded card order, submission evaluation (correct / one-away / wrong), the colored share grid, the localStorage state machine, and the zod validator for the puzzle pool — with **zero React/DOM**, so the generation pipeline (Plan 2) and the UI (Plan 3) build on a proven core.

**Architecture:** A set of pure modules under `src/lib/connections/`. Each function takes data in and returns data out (no globals, no `Date.now()` in logic — dates are passed in). Reuses Countle's `hashString`/`dateKeyUTC` for deterministic daily selection and `@/lib/countle` types are NOT needed here (Connections has its own puzzle types). State transitions are pure over a `ConnectionsState` object; localStorage IO is the UI's job (Plan 3).

**Tech Stack:** TypeScript; `vitest` (already configured for `src/**` by the Countle work); `zod` (already a dependency). No new dependencies.

## Global Constraints

- **Pure engine.** No module under `src/lib/connections/` may import React, Next, `window`, `document`, or `fs` (except the validator's optional runnable entrypoint and tests). Never call `Date.now()`/argless `new Date()` inside logic — callers pass a `dateKey`.
- **Reuse Countle date utils:** import `hashString` and `dateKeyUTC` from `../countle/daily` (do NOT reimplement them). They already exist and are tested.
- **Group colors, fixed:** `type GroupColor = "yellow" | "green" | "blue" | "purple"` (difficulty order easy→hard). Emoji map: yellow `🟨`, green `🟩`, blue `🟦`, purple `🟪`.
- **Puzzle invariants (the validator enforces):** every puzzle has exactly **4 groups**, each with exactly **4 fips**; the **16 fips are all distinct**; colors are the 4 distinct `GroupColor`s. FIPS are 5-digit strings.
- **Rules:** 4 mistakes allowed; a submission of 4 fips is **correct** iff all 4 belong to one group, **one-away** iff exactly 3 belong to a single group, else **wrong**; both wrong and one-away cost a mistake. Win = all 4 groups solved; loss = 4 mistakes used.
- **localStorage key (used by the UI in Plan 3, not here):** `connections-v1`. The engine only defines the `ConnectionsState` shape + pure transitions.
- **Output is logic only** — this plan ships no UI and produces no `connections.json` (that's Plan 2). Success = tested pure modules + a zod validator.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/connections/types.ts` | `GroupColor`, `ConnectionsGroup`, `ConnectionsPuzzle`, `ConnectionsPayload`, `ConnectionsState`, `SubmissionResult`, `COLORS`, `COLOR_EMOJI`. |
| `src/lib/connections/daily.ts` | `getDailyPuzzle(payload, dateKey)`, `puzzleCards(puzzle)`, `dailyCardOrder(puzzle, dateKey)` (seeded shuffle of the 16 fips). |
| `src/lib/connections/game.ts` | `groupIndexOf(puzzle, fips)`, `evaluateSubmission(puzzle, fips4)`, `shareRow(puzzle, fips4)`, `buildShareText(opts)`. |
| `src/lib/connections/state.ts` | `initialState`, `parseState`, `serializeState`, `startDay`, `recordSubmission`. |
| `src/lib/connections/validate.ts` | zod `ConnectionsPayloadSchema` + `validateConnections(payload)` + a runnable validator entrypoint. |
| `src/lib/connections/index.ts` | Barrel re-export of the public API. |
| `src/lib/connections/*.test.ts` | Vitest unit tests, one per module. |

### Public API (consumed by Plan 2 generation + Plan 3 UI)
```ts
getDailyPuzzle(payload: ConnectionsPayload, dateKey: string): ConnectionsPuzzle
puzzleCards(puzzle: ConnectionsPuzzle): string[]            // all 16 fips
dailyCardOrder(puzzle: ConnectionsPuzzle, dateKey: string): string[]   // 16 fips, seeded shuffle
groupIndexOf(puzzle: ConnectionsPuzzle, fips: string): number          // 0..3, or -1
evaluateSubmission(puzzle: ConnectionsPuzzle, fips4: string[]): SubmissionResult
shareRow(puzzle: ConnectionsPuzzle, fips4: string[]): string           // 4 emoji
buildShareText(opts: { puzzleNumber: number; solved: boolean; mistakes: number; rows: string[] }): string
initialState(): ConnectionsState
parseState(raw: string | null): ConnectionsState
serializeState(s: ConnectionsState): string
startDay(s: ConnectionsState, dateKey: string): ConnectionsState
recordSubmission(s: ConnectionsState, fips4: string[], result: SubmissionResult, dateKey: string): ConnectionsState
validateConnections(payload: unknown): { ok: true; count: number } | { ok: false; errors: string[] }
```

---

## Task 1: Types + daily selection

**Files:**
- Create: `src/lib/connections/types.ts`, `src/lib/connections/daily.ts`
- Test: `src/lib/connections/daily.test.ts`

**Interfaces:**
- Consumes: `hashString`, `dateKeyUTC` from `../countle/daily`.
- Produces: the types below; `getDailyPuzzle`, `puzzleCards`, `dailyCardOrder`.

- [ ] **Step 1: Write the types**

Create `src/lib/connections/types.ts`:

```ts
export type GroupColor = "yellow" | "green" | "blue" | "purple";
export const COLORS: GroupColor[] = ["yellow", "green", "blue", "purple"];
export const COLOR_EMOJI: Record<GroupColor, string> = { yellow: "🟨", green: "🟩", blue: "🟦", purple: "🟪" };

export interface ConnectionsGroup {
  label: string;
  color: GroupColor;
  fips: string[]; // exactly 4, distinct
}

export interface ConnectionsPuzzle {
  id: number;
  groups: ConnectionsGroup[]; // exactly 4
}

export interface ConnectionsPayload {
  schemaVersion: 1;
  generatedAt: string;
  count: number;
  puzzles: ConnectionsPuzzle[];
}

export type SubmissionResult =
  | { kind: "correct"; color: GroupColor; groupIndex: number }
  | { kind: "one-away" }
  | { kind: "wrong" };

export interface ConnectionsState {
  schemaVersion: 1;
  lastPlayedDateKey: string | null;
  today: {
    dateKey: string;
    submissions: string[][]; // each a 4-fips array, in order
    solvedColors: GroupColor[];
    mistakes: number;
    finished: boolean;
    won: boolean;
  } | null;
  streak: number;
  maxStreak: number;
  gamesPlayed: number;
  wins: number;
  perfectGames: number; // won with 0 mistakes
}
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/connections/daily.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getDailyPuzzle, puzzleCards, dailyCardOrder } from "./daily";
import type { ConnectionsPayload, ConnectionsPuzzle } from "./types";

function puzzle(id: number, base: number): ConnectionsPuzzle {
  const f = (n: number) => String(base + n).padStart(5, "0");
  return { id, groups: [
    { label: "A", color: "yellow", fips: [f(0), f(1), f(2), f(3)] },
    { label: "B", color: "green",  fips: [f(4), f(5), f(6), f(7)] },
    { label: "C", color: "blue",   fips: [f(8), f(9), f(10), f(11)] },
    { label: "D", color: "purple", fips: [f(12), f(13), f(14), f(15)] },
  ] };
}
const payload: ConnectionsPayload = { schemaVersion: 1, generatedAt: "x", count: 3,
  puzzles: [puzzle(1, 1000), puzzle(2, 2000), puzzle(3, 3000)] };

describe("getDailyPuzzle", () => {
  it("is deterministic and in range", () => {
    const a = getDailyPuzzle(payload, "2026-06-26");
    const b = getDailyPuzzle(payload, "2026-06-26");
    expect(a.id).toBe(b.id);
    expect([1, 2, 3]).toContain(a.id);
  });
});

describe("puzzleCards", () => {
  it("returns all 16 fips", () => {
    expect(puzzleCards(puzzle(1, 1000))).toHaveLength(16);
  });
});

describe("dailyCardOrder", () => {
  it("is a deterministic permutation of the 16 cards", () => {
    const p = puzzle(1, 1000);
    const a = dailyCardOrder(p, "2026-06-26");
    const b = dailyCardOrder(p, "2026-06-26");
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([...puzzleCards(p)].sort());
  });
  it("usually does NOT leave the cards grouped (shuffled)", () => {
    const p = puzzle(1, 1000);
    expect(dailyCardOrder(p, "2026-06-26")).not.toEqual(puzzleCards(p));
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- connections/daily.test`
Expected: FAIL — cannot resolve `./daily`.

- [ ] **Step 4: Implement `daily.ts`**

```ts
import type { ConnectionsPayload, ConnectionsPuzzle } from "./types";
import { hashString } from "../countle/daily";

export function getDailyPuzzle(payload: ConnectionsPayload, dateKey: string): ConnectionsPuzzle {
  if (payload.puzzles.length === 0) throw new Error("empty connections pool");
  return payload.puzzles[hashString(dateKey) % payload.puzzles.length];
}

export function puzzleCards(puzzle: ConnectionsPuzzle): string[] {
  return puzzle.groups.flatMap((g) => g.fips);
}

/** Deterministic shuffle of the 16 cards seeded by the date (so the grid isn't pre-grouped). */
export function dailyCardOrder(puzzle: ConnectionsPuzzle, dateKey: string): string[] {
  const cards = puzzleCards(puzzle);
  // Decorate-sort-undecorate by a per-card hash; stable + deterministic.
  return cards
    .map((fips) => ({ fips, key: hashString(`${dateKey}:${fips}`) }))
    .sort((a, b) => a.key - b.key || a.fips.localeCompare(b.fips))
    .map((x) => x.fips);
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- connections/daily.test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/connections/types.ts src/lib/connections/daily.ts src/lib/connections/daily.test.ts
git commit -m "feat(connections): types + deterministic daily puzzle + seeded card order"
```

---

## Task 2: Submission evaluation + share row + share text

**Files:**
- Create: `src/lib/connections/game.ts`
- Test: `src/lib/connections/game.test.ts`

**Interfaces:**
- Consumes: `ConnectionsPuzzle`, `SubmissionResult`, `COLOR_EMOJI` (Task 1).
- Produces: `groupIndexOf`, `evaluateSubmission`, `shareRow`, `buildShareText`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/connections/game.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { groupIndexOf, evaluateSubmission, shareRow, buildShareText } from "./game";
import type { ConnectionsPuzzle } from "./types";

const p: ConnectionsPuzzle = { id: 1, groups: [
  { label: "A", color: "yellow", fips: ["00001", "00002", "00003", "00004"] },
  { label: "B", color: "green",  fips: ["00005", "00006", "00007", "00008"] },
  { label: "C", color: "blue",   fips: ["00009", "00010", "00011", "00012"] },
  { label: "D", color: "purple", fips: ["00013", "00014", "00015", "00016"] },
] };

describe("groupIndexOf", () => {
  it("finds the group, or -1", () => {
    expect(groupIndexOf(p, "00006")).toBe(1);
    expect(groupIndexOf(p, "99999")).toBe(-1);
  });
});

describe("evaluateSubmission", () => {
  it("all four from one group → correct + color", () => {
    const r = evaluateSubmission(p, ["00001", "00002", "00003", "00004"]);
    expect(r).toEqual({ kind: "correct", color: "yellow", groupIndex: 0 });
  });
  it("three from one group, one other → one-away", () => {
    expect(evaluateSubmission(p, ["00001", "00002", "00003", "00009"]).kind).toBe("one-away");
  });
  it("a 2-2 split → wrong", () => {
    expect(evaluateSubmission(p, ["00001", "00002", "00009", "00010"]).kind).toBe("wrong");
  });
});

describe("shareRow", () => {
  it("maps each card to its true group color emoji", () => {
    // one from each group → yellow green blue purple
    expect(shareRow(p, ["00001", "00005", "00009", "00013"])).toBe("🟨🟩🟦🟪");
  });
});

describe("buildShareText", () => {
  it("solved header + rows + footer", () => {
    const rows = ["🟩🟩🟩🟩", "🟨🟦🟨🟨", "🟨🟨🟨🟨"];
    expect(buildShareText({ puzzleNumber: 12, solved: true, mistakes: 1, rows })).toBe(
      ["County Connections #12", "🟩🟩🟩🟩", "🟨🟦🟨🟨", "🟨🟨🟨🟨", "county.games"].join("\n")
    );
  });
  it("failed header notes it", () => {
    expect(buildShareText({ puzzleNumber: 12, solved: false, mistakes: 4, rows: [] }).split("\n")[0])
      .toBe("County Connections #12 — missed");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- connections/game.test`
Expected: FAIL — cannot resolve `./game`.

- [ ] **Step 3: Implement `game.ts`**

```ts
import type { ConnectionsPuzzle, SubmissionResult } from "./types";
import { COLOR_EMOJI } from "./types";

export function groupIndexOf(puzzle: ConnectionsPuzzle, fips: string): number {
  return puzzle.groups.findIndex((g) => g.fips.includes(fips));
}

export function evaluateSubmission(puzzle: ConnectionsPuzzle, fips4: string[]): SubmissionResult {
  const counts = [0, 0, 0, 0];
  for (const fips of fips4) {
    const gi = groupIndexOf(puzzle, fips);
    if (gi >= 0) counts[gi]++;
  }
  const best = Math.max(...counts);
  if (best === 4) {
    const groupIndex = counts.indexOf(4);
    return { kind: "correct", color: puzzle.groups[groupIndex].color, groupIndex };
  }
  if (best === 3) return { kind: "one-away" };
  return { kind: "wrong" };
}

export function shareRow(puzzle: ConnectionsPuzzle, fips4: string[]): string {
  return fips4
    .map((fips) => {
      const gi = groupIndexOf(puzzle, fips);
      return gi >= 0 ? COLOR_EMOJI[puzzle.groups[gi].color] : "⬛";
    })
    .join("");
}

export function buildShareText(opts: { puzzleNumber: number; solved: boolean; mistakes: number; rows: string[] }): string {
  const header = opts.solved ? `County Connections #${opts.puzzleNumber}` : `County Connections #${opts.puzzleNumber} — missed`;
  return [header, ...opts.rows, "county.games"].join("\n");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- connections/game.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/connections/game.ts src/lib/connections/game.test.ts
git commit -m "feat(connections): submission evaluation (correct/one-away/wrong) + share grid"
```

---

## Task 3: localStorage state machine

**Files:**
- Create: `src/lib/connections/state.ts`
- Test: `src/lib/connections/state.test.ts`

**Interfaces:**
- Consumes: `ConnectionsState`, `SubmissionResult`, `GroupColor` (Task 1); `prevDateKey` from `../countle/daily`.
- Produces: `initialState`, `parseState`, `serializeState`, `startDay`, `recordSubmission`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/connections/state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { initialState, parseState, serializeState, startDay, recordSubmission } from "./state";
import type { SubmissionResult } from "./types";

const correct = (color: any, gi: number): SubmissionResult => ({ kind: "correct", color, groupIndex: gi });
const wrong: SubmissionResult = { kind: "wrong" };
const oneAway: SubmissionResult = { kind: "one-away" };

describe("initial / parse / serialize", () => {
  it("initial is empty", () => {
    const s = initialState();
    expect(s.gamesPlayed).toBe(0);
    expect(s.today).toBeNull();
  });
  it("parse falls back on null/garbage/wrong version", () => {
    expect(parseState(null).gamesPlayed).toBe(0);
    expect(parseState("{nope").gamesPlayed).toBe(0);
    expect(parseState(JSON.stringify({ schemaVersion: 9 })).gamesPlayed).toBe(0);
  });
  it("round-trips", () => {
    const s = startDay(initialState(), "2026-06-26");
    expect(parseState(serializeState(s)).today!.dateKey).toBe("2026-06-26");
  });
});

describe("startDay", () => {
  it("fresh today on a new day, preserves same-day", () => {
    const a = startDay(initialState(), "2026-06-26");
    expect(a.today).toEqual({ dateKey: "2026-06-26", submissions: [], solvedColors: [], mistakes: 0, finished: false, won: false });
    const b = recordSubmission(a, ["1", "2", "3", "4"], wrong, "2026-06-26");
    expect(startDay(b, "2026-06-26").today!.submissions).toHaveLength(1);
    expect(startDay(b, "2026-06-27").today!.submissions).toHaveLength(0);
  });
});

describe("recordSubmission", () => {
  it("solving all four groups wins, bumps streak + perfect, records colors", () => {
    let s = startDay(initialState(), "2026-06-26");
    s = recordSubmission(s, ["a"], correct("yellow", 0), "2026-06-26");
    s = recordSubmission(s, ["b"], correct("green", 1), "2026-06-26");
    s = recordSubmission(s, ["c"], correct("blue", 2), "2026-06-26");
    s = recordSubmission(s, ["d"], correct("purple", 3), "2026-06-26");
    expect(s.today!.won).toBe(true);
    expect(s.today!.finished).toBe(true);
    expect(s.today!.solvedColors).toEqual(["yellow", "green", "blue", "purple"]);
    expect(s.gamesPlayed).toBe(1);
    expect(s.wins).toBe(1);
    expect(s.perfectGames).toBe(1);
    expect(s.streak).toBe(1);
  });
  it("wrong and one-away both cost a mistake; 4 mistakes ends as a loss (no perfect)", () => {
    let s = startDay(initialState(), "2026-06-26");
    for (const r of [wrong, oneAway, wrong, oneAway]) s = recordSubmission(s, ["x", "y", "z", "w"], r, "2026-06-26");
    expect(s.today!.mistakes).toBe(4);
    expect(s.today!.finished).toBe(true);
    expect(s.today!.won).toBe(false);
    expect(s.wins).toBe(0);
    expect(s.perfectGames).toBe(0);
    expect(s.streak).toBe(0);
  });
  it("ignores submissions after the game is finished", () => {
    let s = startDay(initialState(), "2026-06-26");
    for (const r of [wrong, wrong, wrong, wrong]) s = recordSubmission(s, ["x"], r, "2026-06-26");
    const after = recordSubmission(s, ["x"], wrong, "2026-06-26");
    expect(after.today!.submissions).toHaveLength(4);
  });
  it("a win after a win on the next day continues the streak; a missed day resets", () => {
    const winDay = (s: any, key: string) => {
      let st = startDay(s, key);
      st = recordSubmission(st, ["a"], correct("yellow", 0), key);
      st = recordSubmission(st, ["b"], correct("green", 1), key);
      st = recordSubmission(st, ["c"], correct("blue", 2), key);
      st = recordSubmission(st, ["d"], correct("purple", 3), key);
      return st;
    };
    let s = winDay(initialState(), "2026-06-26");
    s = winDay(s, "2026-06-27");
    expect(s.streak).toBe(2);
    s = winDay(s, "2026-06-29"); // skipped 28th
    expect(s.streak).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- connections/state.test`
Expected: FAIL — cannot resolve `./state`.

- [ ] **Step 3: Implement `state.ts`**

```ts
import type { ConnectionsState, GroupColor, SubmissionResult } from "./types";
import { prevDateKey } from "../countle/daily";

const GROUPS = 4;
const MISTAKE_LIMIT = 4;

export function initialState(): ConnectionsState {
  return {
    schemaVersion: 1,
    lastPlayedDateKey: null,
    today: null,
    streak: 0,
    maxStreak: 0,
    gamesPlayed: 0,
    wins: 0,
    perfectGames: 0,
  };
}

export function parseState(raw: string | null): ConnectionsState {
  if (!raw) return initialState();
  try {
    const obj = JSON.parse(raw);
    if (!obj || obj.schemaVersion !== 1) return initialState();
    return { ...initialState(), ...obj };
  } catch {
    return initialState();
  }
}

export function serializeState(s: ConnectionsState): string {
  return JSON.stringify(s);
}

export function startDay(s: ConnectionsState, dateKey: string): ConnectionsState {
  if (s.today && s.today.dateKey === dateKey) return s;
  return { ...s, today: { dateKey, submissions: [], solvedColors: [], mistakes: 0, finished: false, won: false } };
}

export function recordSubmission(
  s: ConnectionsState,
  fips4: string[],
  result: SubmissionResult,
  dateKey: string
): ConnectionsState {
  const today = s.today ?? { dateKey, submissions: [], solvedColors: [], mistakes: 0, finished: false, won: false };
  if (today.finished) return s;

  const submissions = [...today.submissions, fips4];
  let solvedColors = today.solvedColors;
  let mistakes = today.mistakes;

  if (result.kind === "correct") {
    solvedColors = [...today.solvedColors, result.color as GroupColor];
  } else {
    mistakes = today.mistakes + 1;
  }

  const won = solvedColors.length === GROUPS;
  const finished = won || mistakes >= MISTAKE_LIMIT;

  const nextToday = { ...today, submissions, solvedColors, mistakes, finished, won };
  if (!finished) {
    return { ...s, today: nextToday };
  }

  // Finalize.
  const playedYesterday = s.lastPlayedDateKey === prevDateKey(dateKey);
  const streak = won ? (playedYesterday ? s.streak + 1 : 1) : 0;
  return {
    ...s,
    today: nextToday,
    streak,
    maxStreak: Math.max(s.maxStreak, streak),
    gamesPlayed: s.gamesPlayed + 1,
    wins: s.wins + (won ? 1 : 0),
    perfectGames: s.perfectGames + (won && mistakes === 0 ? 1 : 0),
    lastPlayedDateKey: dateKey,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- connections/state.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/connections/state.ts src/lib/connections/state.test.ts
git commit -m "feat(connections): localStorage state machine (mistakes, streak, perfect games)"
```

---

## Task 4: zod validator + barrel

**Files:**
- Create: `src/lib/connections/validate.ts`, `src/lib/connections/index.ts`
- Test: `src/lib/connections/validate.test.ts`

**Interfaces:**
- Consumes: `zod`; the types (Task 1).
- Produces: `ConnectionsPayloadSchema`, `validateConnections(payload)`; barrel `index.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/connections/validate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateConnections } from "./validate";

const goodPuzzle = { id: 1, groups: [
  { label: "A", color: "yellow", fips: ["00001", "00002", "00003", "00004"] },
  { label: "B", color: "green",  fips: ["00005", "00006", "00007", "00008"] },
  { label: "C", color: "blue",   fips: ["00009", "00010", "00011", "00012"] },
  { label: "D", color: "purple", fips: ["00013", "00014", "00015", "00016"] },
] };
const payload = (p: unknown) => ({ schemaVersion: 1, generatedAt: "x", count: 1, puzzles: [p] });

describe("validateConnections", () => {
  it("accepts a well-formed pool", () => {
    expect(validateConnections(payload(goodPuzzle)).ok).toBe(true);
  });
  it("rejects a puzzle without exactly 4 groups", () => {
    const bad = { ...goodPuzzle, groups: goodPuzzle.groups.slice(0, 3) };
    expect(validateConnections(payload(bad)).ok).toBe(false);
  });
  it("rejects a group without exactly 4 fips", () => {
    const bad = { ...goodPuzzle, groups: [{ ...goodPuzzle.groups[0], fips: ["00001", "00002", "00003"] }, ...goodPuzzle.groups.slice(1)] };
    expect(validateConnections(payload(bad)).ok).toBe(false);
  });
  it("rejects a puzzle with duplicate fips across groups", () => {
    const bad = { ...goodPuzzle, groups: [{ ...goodPuzzle.groups[0], fips: ["00005", "00002", "00003", "00004"] }, ...goodPuzzle.groups.slice(1)] };
    expect(validateConnections(payload(bad)).ok).toBe(false); // 00005 also in group B → only 15 distinct
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- connections/validate.test`
Expected: FAIL — cannot resolve `./validate`.

- [ ] **Step 3: Implement `validate.ts`**

```ts
import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";

const GroupSchema = z.object({
  label: z.string().min(1),
  color: z.enum(["yellow", "green", "blue", "purple"]),
  fips: z.array(z.string().length(5)).length(4),
}).refine((g) => new Set(g.fips).size === 4, { message: "group fips must be 4 distinct" });

const PuzzleSchema = z.object({
  id: z.number(),
  groups: z.array(GroupSchema).length(4),
}).superRefine((p, ctx) => {
  const all = p.groups.flatMap((g) => g.fips);
  if (new Set(all).size !== 16) ctx.addIssue({ code: "custom", message: "puzzle must have 16 distinct fips" });
  if (new Set(p.groups.map((g) => g.color)).size !== 4) ctx.addIssue({ code: "custom", message: "puzzle must have 4 distinct colors" });
});

export const ConnectionsPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  count: z.number(),
  puzzles: z.array(PuzzleSchema),
}).refine((p) => p.count === p.puzzles.length, { message: "count must equal puzzles.length" });

export function validateConnections(payload: unknown): { ok: true; count: number } | { ok: false; errors: string[] } {
  const parsed = ConnectionsPayloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join(".")}: ${i.message}`) };
  return { ok: true, count: parsed.data.count };
}

// Runnable: `tsx src/lib/connections/validate.ts`
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("connections/validate.ts")) {
  const file = join(process.cwd(), "public", "data", "connections.json");
  const res = validateConnections(JSON.parse(readFileSync(file, "utf-8")));
  if (!res.ok) { console.error("CONNECTIONS INVALID:"); res.errors.forEach((e) => console.error("  " + e)); process.exit(1); }
  console.log(`VALID: ${res.count} connections puzzles.`);
}
```

Create `src/lib/connections/index.ts`:

```ts
export * from "./types";
export * from "./daily";
export * from "./game";
export * from "./state";
export * from "./validate";
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- connections/validate.test`
Expected: PASS.

- [ ] **Step 5: Run the whole suite + commit**

Run: `npm test`
Expected: PASS — all Countle + new connections tests.

```bash
git add src/lib/connections/validate.ts src/lib/connections/validate.test.ts src/lib/connections/index.ts
git commit -m "feat(connections): zod pool validator + engine barrel"
```

---

## Self-Review

**Spec coverage (§2 rules, §5 data model, §6 engine):**
- §2 evaluate correct/one-away/wrong, 4-mistakes, win/loss → Task 2 `evaluateSubmission` + Task 3 `recordSubmission`. ✓
- §2 colored share grid → Task 2 `shareRow` + `buildShareText`. ✓
- §5 `connections.json` shape + daily selection + seeded card order → Task 1 (`ConnectionsPayload`, `getDailyPuzzle`, `dailyCardOrder`). ✓
- §5 `connections-v1` state shape → Task 1 `ConnectionsState` + Task 3 machine (literal key + IO are the UI's job, Plan 3). ✓
- §6 zod validate of pool invariants → Task 4. ✓

**Placeholder scan:** none — every step has complete code.

**Type consistency:** `GroupColor`/`ConnectionsGroup`/`ConnectionsPuzzle`/`ConnectionsPayload`/`SubmissionResult`/`ConnectionsState` defined once in `types.ts`; `evaluateSubmission` returns the `SubmissionResult` consumed by `recordSubmission`; `getDailyPuzzle`/`dailyCardOrder` consume `ConnectionsPuzzle`; `hashString`/`prevDateKey` imported from the existing `../countle/daily`.

## Notes for Plan 2 (generation) and Plan 3 (UI)
- Plan 2 produces `public/data/connections.json` and MUST pass `validateConnections` (run `tsx src/lib/connections/validate.ts`).
- Plan 3 owns the localStorage key `connections-v1`, the actual `localStorage`/clipboard IO, `dailyCardOrder` for grid layout, and the 4×4 UI.
- The `county.games` share footer is a placeholder domain — confirm before launch.
