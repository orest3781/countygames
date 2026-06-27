# County Connections UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the playable County Connections daily game at `/connections` (Bold Pop Almanac styling) — a 4×4 grid of county cards, select 4, find the four hidden groups, with 4 mistakes, one-away feedback, shuffle, win/lose reveal, streak/stats, and a colored share grid.

**Architecture:** Mirror Countle's layering. Pure presentation logic (view-model, submission, labels, stats, persistence) lives in `src/lib/connections/` and is vitest-TDD'd. React components live in `src/components/connections/` (Bold Pop, inline-styled like Countle). Route at `src/app/connections/page.tsx`. Reuse the merged `src/lib/connections` engine (types/daily/game/state) plus Countle's `buildDataset`, `dateKeyUTC`, `puzzleNumber`, `Overlay`, theme tokens, fonts, and CSS animations.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4 (inline styles), vitest. Static `fetch` of `/data/counties.json` + `/data/connections.json` + localStorage. No backend.

## Global Constraints

- **localStorage key:** `connections-v1` (via a persistence module that mirrors `src/lib/countle/persistence.ts`).
- **Card label format:** `"<BareCounty>, <ST>"` — e.g. `"Travis County" + "TX"` → `"Travis, TX"`. Strip the county-type suffix (`County|Parish|Borough|Census Area|Municipality|City and Borough|city`, case-insensitive).
- **Rules (NYT-faithful):** exactly 4 cards per submission; **4 mistakes** max; **one-away** when a wrong submission has exactly 3 cards in one group; **win** = all 4 groups solved; **loss** = 4 mistakes used, then reveal the remaining groups. Today-only, one puzzle per UTC day, no replay (MVP).
- **Group colors** (Bold Pop, yellow easiest → purple hardest): `yellow #f2c14e`, `green #6fae53`, `blue #5a8fd6`, `purple #a96fc0`. Solved bands use dark ink text (`#241d12`).
- **No duplicate submissions:** submitting a set already tried is a no-op (does NOT cost a mistake); just clear the selection.
- **Reuse, don't fork:** import `Overlay` from `@/components/countle/Overlay`; import `buildDataset`, `dateKeyUTC` from `@/lib/countle` and `puzzleNumber` from `@/lib/countle/daily`; import engine symbols from `@/lib/connections`. Theme tokens `PAPER`/`INK` from `@/components/countle/theme`.
- **Testing split:** pure logic (Tasks 1–2) is vitest-TDD'd. React components (Tasks 3–5) are gated by `npx tsc --noEmit` (typecheck) per task and Playwright visual verification at the end (Task 5). No brittle DOM unit tests.
- **Engine is frozen** — do NOT modify anything under `src/lib/connections/*` that already exists (types.ts, daily.ts, game.ts, state.ts, index.ts) except by ADDING new sibling modules (labels.ts, stats.ts, session.ts, persistence.ts) and re-exporting them from index.ts.
- Submit button enabled only when exactly 4 cards are selected; selection caps at 4 (a 5th tap is ignored, or toggles off an already-selected card).

---

## File Structure

**New pure modules (TDD'd) — `src/lib/connections/`:**
- `labels.ts` — `bareCountyName`, `cardLabel`.
- `stats.ts` — `connectionsStats(state)` → summary for the stats modal.
- `persistence.ts` — `STORAGE_KEY="connections-v1"`, `loadConnectionsState`, `saveConnectionsState`.
- `session.ts` — `buildConnectionsView(...)` (view-model) + `applySubmission(...)` (the submit reducer). The logic heart of the UI.
- `index.ts` — add re-exports for the four new modules.

**New React components — `src/components/connections/`:**
- `theme.ts` — `GROUP_HEX`, `GROUP_TEXT`.
- `useConnections.ts` — the hook (fetch both JSON, load/save state, selection + actions).
- `Card.tsx` — one selectable county card.
- `Grid.tsx` — solved colored bands + remaining-card grid.
- `Controls.tsx` — mistakes dots + Shuffle / Deselect all / Submit.
- `Header.tsx` — `CONNECTIONS` wordmark + `#num` + streak + 📊.
- `StatsModal.tsx` — stats panel (inside `Overlay`).
- `WinLose.tsx` — finished overlay: four group bands + Share button.
- `ConnectionsApp.tsx` — orchestrator.

**New route:**
- `src/app/connections/page.tsx` — mounts `<ConnectionsApp/>`.

---

## Task 1: Pure presentation helpers (labels, stats, persistence)

**Files:**
- Create: `src/lib/connections/labels.ts`
- Create: `src/lib/connections/stats.ts`
- Create: `src/lib/connections/persistence.ts`
- Test: `src/lib/connections/labels.test.ts`, `src/lib/connections/stats.test.ts`, `src/lib/connections/persistence.test.ts`

**Interfaces:**
- Consumes: `ConnectionsState` from `./types`; `parseState`/`serializeState` from `./state`.
- Produces: `bareCountyName(name: string): string`; `cardLabel(name: string, stateAbbr: string): string`; `connectionsStats(state): { played: number; winPct: number; currentStreak: number; maxStreak: number; perfect: number }`; `STORAGE_KEY: string`; `loadConnectionsState(storage): ConnectionsState`; `saveConnectionsState(storage, state): void`; `StorageLike`.

- [ ] **Step 1: Write the failing tests**

`src/lib/connections/labels.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { bareCountyName, cardLabel } from "./labels";

describe("bareCountyName", () => {
  it("strips common county-type suffixes", () => {
    expect(bareCountyName("Travis County")).toBe("Travis");
    expect(bareCountyName("Orleans Parish")).toBe("Orleans");
    expect(bareCountyName("Prince of Wales-Hyder Census Area")).toBe("Prince of Wales-Hyder");
    expect(bareCountyName("Anchorage Municipality")).toBe("Anchorage");
    expect(bareCountyName("Juneau City and Borough")).toBe("Juneau");
    expect(bareCountyName("Carson City")).toBe("Carson"); // trailing " City" (case-insensitive)
  });
  it("leaves a name without a suffix unchanged", () => {
    expect(bareCountyName("Baltimore")).toBe("Baltimore");
  });
});

describe("cardLabel", () => {
  it("formats '<bare>, <ST>'", () => {
    expect(cardLabel("Travis County", "TX")).toBe("Travis, TX");
    expect(cardLabel("Cook County", "IL")).toBe("Cook, IL");
  });
});
```

`src/lib/connections/stats.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { connectionsStats } from "./stats";
import { initialState } from "./state";
import type { ConnectionsState } from "./types";

function st(over: Partial<ConnectionsState>): ConnectionsState {
  return { ...initialState(), ...over };
}

describe("connectionsStats", () => {
  it("computes win percentage rounded, 0 when unplayed", () => {
    expect(connectionsStats(st({})).winPct).toBe(0);
    expect(connectionsStats(st({ gamesPlayed: 4, wins: 3 })).winPct).toBe(75);
    expect(connectionsStats(st({ gamesPlayed: 3, wins: 1 })).winPct).toBe(33);
  });
  it("passes through streak/max/perfect/played", () => {
    const s = connectionsStats(st({ gamesPlayed: 10, wins: 7, streak: 2, maxStreak: 5, perfectGames: 3 }));
    expect(s).toEqual({ played: 10, winPct: 70, currentStreak: 2, maxStreak: 5, perfect: 3 });
  });
});
```

`src/lib/connections/persistence.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { STORAGE_KEY, loadConnectionsState, saveConnectionsState, type StorageLike } from "./persistence";
import { initialState } from "./state";

function memStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); } };
}

describe("connections persistence", () => {
  it("uses the connections-v1 key", () => {
    expect(STORAGE_KEY).toBe("connections-v1");
  });
  it("round-trips state", () => {
    const s = memStorage();
    const state = { ...initialState(), gamesPlayed: 2, wins: 1, streak: 1 };
    saveConnectionsState(s, state);
    expect(s.map.get(STORAGE_KEY)).toBeTypeOf("string");
    expect(loadConnectionsState(s)).toEqual(state);
  });
  it("returns initial state when empty or malformed", () => {
    const s = memStorage();
    expect(loadConnectionsState(s)).toEqual(initialState());
    s.map.set(STORAGE_KEY, "{not json");
    expect(loadConnectionsState(s)).toEqual(initialState());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/connections/labels.test.ts src/lib/connections/stats.test.ts src/lib/connections/persistence.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the three modules**

`src/lib/connections/labels.ts`:
```ts
const SUFFIX = / (County|Parish|Borough|Census Area|Municipality|City and Borough|city)$/i;

/** Strip a trailing county-type suffix: "Travis County" -> "Travis". */
export function bareCountyName(name: string): string {
  return name.replace(SUFFIX, "").trim();
}

/** Card face label: "Travis County" + "TX" -> "Travis, TX". */
export function cardLabel(name: string, stateAbbr: string): string {
  return `${bareCountyName(name)}, ${stateAbbr}`;
}
```

`src/lib/connections/stats.ts`:
```ts
import type { ConnectionsState } from "./types";

export interface ConnectionsStats {
  played: number;
  winPct: number;
  currentStreak: number;
  maxStreak: number;
  perfect: number;
}

export function connectionsStats(state: ConnectionsState): ConnectionsStats {
  const played = state.gamesPlayed;
  return {
    played,
    winPct: played > 0 ? Math.round((state.wins / played) * 100) : 0,
    currentStreak: state.streak,
    maxStreak: state.maxStreak,
    perfect: state.perfectGames,
  };
}
```

`src/lib/connections/persistence.ts`:
```ts
import { parseState, serializeState } from "./state";
import type { ConnectionsState } from "./types";

export const STORAGE_KEY = "connections-v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadConnectionsState(storage: StorageLike): ConnectionsState {
  return parseState(storage.getItem(STORAGE_KEY));
}

export function saveConnectionsState(storage: StorageLike, state: ConnectionsState): void {
  storage.setItem(STORAGE_KEY, serializeState(state));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/connections/labels.test.ts src/lib/connections/stats.test.ts src/lib/connections/persistence.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Re-export from the barrel and commit**

Add to `src/lib/connections/index.ts` (after the existing lines):
```ts
export * from "./labels";
export * from "./stats";
export * from "./persistence";
```
(Do NOT export `./session` yet — that's Task 2. Do NOT export `./validate` — it stays out of the barrel, as in the engine.)

```bash
git add src/lib/connections/labels.ts src/lib/connections/labels.test.ts src/lib/connections/stats.ts src/lib/connections/stats.test.ts src/lib/connections/persistence.ts src/lib/connections/persistence.test.ts src/lib/connections/index.ts
git commit -m "feat(connections-ui): labels, stats, persistence helpers"
```

---

## Task 2: View-model + submission reducer (`session.ts`)

**Files:**
- Create: `src/lib/connections/session.ts`
- Test: `src/lib/connections/session.test.ts`
- Modify: `src/lib/connections/index.ts` (add `export * from "./session";`)

**Interfaces:**
- Consumes: `getDailyPuzzle`, `dailyCardOrder` (`./daily`); `evaluateSubmission`, `shareRow`, `buildShareText` (`./game`); `startDay`, `recordSubmission` (`./state`); `cardLabel` (`./labels`); `puzzleNumber` (`../countle/daily`); `Dataset` (`../countle/types`); `ConnectionsPayload`, `ConnectionsState`, `GroupColor`, `SubmissionResult`, `ConnectionsPuzzle` (`./types`).
- Produces:
  - `interface ViewCard { fips: string; label: string }`
  - `interface ViewGroup { color: GroupColor; label: string; cards: ViewCard[] }`
  - `interface ConnectionsView { dateKey: string; puzzleNumber: number; puzzle: ConnectionsPuzzle; solvedGroups: ViewGroup[]; remainingFips: string[]; mistakes: number; mistakesLeft: number; finished: boolean; won: boolean; unsolvedGroups: ViewGroup[]; shareRows: string[]; shareText: string; streak: number }`
  - `buildConnectionsView(payload: ConnectionsPayload, dataset: Dataset, state: ConnectionsState, dateKey: string): ConnectionsView`
  - `type ApplyResult = { ok: true; state: ConnectionsState; result: SubmissionResult } | { ok: false; reason: "finished" | "duplicate" | "invalid" }`
  - `applySubmission(payload: ConnectionsPayload, state: ConnectionsState, dateKey: string, fips4: string[]): ApplyResult`

- [ ] **Step 1: Write the failing test**

`src/lib/connections/session.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildConnectionsView, applySubmission } from "./session";
import { initialState } from "./state";
import type { ConnectionsPayload, ConnectionsPuzzle } from "./types";
import type { CountiesPayload } from "../countle/types";
import { buildDataset } from "../countle/data";

// A puzzle whose 4 groups map to 16 synthetic counties.
const PUZZLE: ConnectionsPuzzle = {
  id: 1,
  groups: [
    { label: "Group Y", color: "yellow", fips: ["00001", "00002", "00003", "00004"] },
    { label: "Group G", color: "green", fips: ["00005", "00006", "00007", "00008"] },
    { label: "Group B", color: "blue", fips: ["00009", "00010", "00011", "00012"] },
    { label: "Group P", color: "purple", fips: ["00013", "00014", "00015", "00016"] },
  ],
};
const payload: ConnectionsPayload = { schemaVersion: 1, generatedAt: "x", count: 1, puzzles: [PUZZLE] };

// Minimal counties.json covering the 16 fips.
function mkCounties(): CountiesPayload {
  const counties: Record<string, any> = {};
  for (let i = 1; i <= 16; i++) {
    const fips = String(i).padStart(5, "0");
    counties[fips] = {
      fips, name: `Test${i} County`, state_abbr: "ZZ", state_name: "ZState",
      region: "Midwest", county_seat: "Seat", lat: 0, lng: 0,
      stats: { wealth: 50, health: 50, people: 50, land: 50, danger: 50, education: 50 },
      rarity: "common", isAnswerPool: true,
    };
  }
  return { schemaVersion: 1, generatedAt: "x", count: 16, counties } as unknown as CountiesPayload;
}
const dataset = buildDataset(mkCounties());
const DATE = "2026-06-26";

describe("buildConnectionsView", () => {
  it("on a fresh state: 0 solved, 16 remaining, labels formatted, 4 mistakes left", () => {
    const v = buildConnectionsView(payload, dataset, initialState(), DATE);
    expect(v.solvedGroups).toHaveLength(0);
    expect(v.remainingFips).toHaveLength(16);
    expect([...v.remainingFips].sort()).toEqual(PUZZLE.groups.flatMap((g) => g.fips).sort());
    expect(v.mistakesLeft).toBe(4);
    expect(v.finished).toBe(false);
    // label of fips 00001 = "Test1, ZZ"
    const card = v.unsolvedGroups.flatMap((g) => g.cards).find((c) => c.fips === "00001");
    expect(card?.label).toBe("Test1, ZZ");
  });

  it("after solving the yellow group: it appears in solvedGroups and is removed from remaining", () => {
    let s = initialState();
    const r = applySubmission(payload, s, DATE, ["00001", "00002", "00003", "00004"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    const v = buildConnectionsView(payload, dataset, s, DATE);
    expect(v.solvedGroups.map((g) => g.color)).toEqual(["yellow"]);
    expect(v.remainingFips).toHaveLength(12);
    expect(v.remainingFips).not.toContain("00001");
  });
});

describe("applySubmission", () => {
  it("rejects a set that is not exactly 4 distinct fips", () => {
    expect(applySubmission(payload, initialState(), DATE, ["00001", "00002", "00003"]).ok).toBe(false);
    expect(applySubmission(payload, initialState(), DATE, ["00001", "00001", "00002", "00003"]).ok).toBe(false);
  });

  it("correct submission records the solved color without a mistake", () => {
    const r = applySubmission(payload, initialState(), DATE, ["00005", "00006", "00007", "00008"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.kind).toBe("correct");
    expect(r.state.today!.solvedColors).toEqual(["green"]);
    expect(r.state.today!.mistakes).toBe(0);
  });

  it("a 3-of-4 wrong submission is one-away and costs a mistake", () => {
    const r = applySubmission(payload, initialState(), DATE, ["00001", "00002", "00003", "00005"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.kind).toBe("one-away");
    expect(r.state.today!.mistakes).toBe(1);
  });

  it("rejects a duplicate submission set (order-insensitive) without recording", () => {
    let s = initialState();
    const first = applySubmission(payload, s, DATE, ["00001", "00002", "00003", "00005"]);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    s = first.state;
    const dup = applySubmission(payload, s, DATE, ["00005", "00003", "00002", "00001"]);
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.reason).toBe("duplicate");
  });

  it("four mistakes finishes the game as a loss; further submissions are rejected", () => {
    let s = initialState();
    const wrongs = [
      ["00001", "00002", "00003", "00005"],
      ["00001", "00002", "00003", "00006"],
      ["00001", "00002", "00003", "00007"],
      ["00001", "00002", "00003", "00008"],
    ];
    for (const w of wrongs) {
      const r = applySubmission(payload, s, DATE, w);
      expect(r.ok).toBe(true);
      if (r.ok) s = r.state;
    }
    expect(s.today!.finished).toBe(true);
    expect(s.today!.won).toBe(false);
    const after = applySubmission(payload, s, DATE, ["00009", "00010", "00011", "00012"]);
    expect(after.ok).toBe(false);
    if (after.ok) return;
    expect(after.reason).toBe("finished");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/connections/session.test.ts`
Expected: FAIL (`buildConnectionsView`/`applySubmission` not found).

- [ ] **Step 3: Implement `session.ts`**

`src/lib/connections/session.ts`:
```ts
import type { ConnectionsPayload, ConnectionsPuzzle, ConnectionsState, GroupColor, SubmissionResult } from "./types";
import { getDailyPuzzle, dailyCardOrder } from "./daily";
import { evaluateSubmission, shareRow, buildShareText } from "./game";
import { startDay, recordSubmission } from "./state";
import { cardLabel } from "./labels";
import { puzzleNumber } from "../countle/daily";
import type { Dataset } from "../countle/types";

export interface ViewCard {
  fips: string;
  label: string;
}
export interface ViewGroup {
  color: GroupColor;
  label: string;
  cards: ViewCard[];
}
export interface ConnectionsView {
  dateKey: string;
  puzzleNumber: number;
  puzzle: ConnectionsPuzzle;
  solvedGroups: ViewGroup[];
  remainingFips: string[];
  mistakes: number;
  mistakesLeft: number;
  finished: boolean;
  won: boolean;
  unsolvedGroups: ViewGroup[];
  shareRows: string[];
  shareText: string;
  streak: number;
}

const MISTAKE_LIMIT = 4;

function labelOf(dataset: Dataset, fips: string): string {
  const c = dataset.byFips.get(fips);
  return c ? cardLabel(c.name, c.state_abbr) : fips;
}

function toGroup(dataset: Dataset, puzzle: ConnectionsPuzzle, color: GroupColor): ViewGroup {
  const g = puzzle.groups.find((x) => x.color === color)!;
  return { color, label: g.label, cards: g.fips.map((f) => ({ fips: f, label: labelOf(dataset, f) })) };
}

export function buildConnectionsView(
  payload: ConnectionsPayload,
  dataset: Dataset,
  state: ConnectionsState,
  dateKey: string
): ConnectionsView {
  const puzzle = getDailyPuzzle(payload, dateKey);
  const today = state.today && state.today.dateKey === dateKey ? state.today : null;
  const solvedColors = today?.solvedColors ?? [];
  const mistakes = today?.mistakes ?? 0;

  const solvedGroups = solvedColors.map((c) => toGroup(dataset, puzzle, c));
  const solvedFips = new Set(solvedGroups.flatMap((g) => g.cards.map((c) => c.fips)));
  const remainingFips = dailyCardOrder(puzzle, dateKey).filter((f) => !solvedFips.has(f));
  const unsolvedGroups = puzzle.groups
    .filter((g) => !solvedColors.includes(g.color))
    .map((g) => toGroup(dataset, puzzle, g.color));

  const shareRows = (today?.submissions ?? []).map((sub) => shareRow(puzzle, sub));
  const won = today?.won ?? false;
  return {
    dateKey,
    puzzleNumber: puzzleNumber(dateKey),
    puzzle,
    solvedGroups,
    remainingFips,
    mistakes,
    mistakesLeft: MISTAKE_LIMIT - mistakes,
    finished: today?.finished ?? false,
    won,
    unsolvedGroups,
    shareRows,
    shareText: buildShareText({ puzzleNumber: puzzleNumber(dateKey), solved: won, mistakes, rows: shareRows }),
    streak: state.streak,
  };
}

export type ApplyResult =
  | { ok: true; state: ConnectionsState; result: SubmissionResult }
  | { ok: false; reason: "finished" | "duplicate" | "invalid" };

const keyOf = (fips4: string[]) => [...fips4].sort().join(",");

export function applySubmission(
  payload: ConnectionsPayload,
  state: ConnectionsState,
  dateKey: string,
  fips4: string[]
): ApplyResult {
  if (fips4.length !== 4 || new Set(fips4).size !== 4) return { ok: false, reason: "invalid" };
  const puzzle = getDailyPuzzle(payload, dateKey);
  const started = startDay(state, dateKey);
  if (started.today!.finished) return { ok: false, reason: "finished" };
  const k = keyOf(fips4);
  if (started.today!.submissions.some((s) => keyOf(s) === k)) return { ok: false, reason: "duplicate" };
  const result = evaluateSubmission(puzzle, fips4);
  const next = recordSubmission(started, fips4, result, dateKey);
  return { ok: true, state: next, result };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/connections/session.test.ts`
Expected: PASS.

- [ ] **Step 5: Re-export and commit**

Add to `src/lib/connections/index.ts`:
```ts
export * from "./session";
```
```bash
git add src/lib/connections/session.ts src/lib/connections/session.test.ts src/lib/connections/index.ts
git commit -m "feat(connections-ui): view-model + submission reducer (session.ts)"
```

---

## Task 3: Theme tokens + the `useConnections` hook

**Files:**
- Create: `src/components/connections/theme.ts`
- Create: `src/components/connections/useConnections.ts`

**Interfaces:**
- Consumes: `buildConnectionsView`, `applySubmission`, `loadConnectionsState`, `saveConnectionsState`, `ConnectionsView`, `ConnectionsPayload` (`@/lib/connections`); `buildDataset`, `dateKeyUTC`, `Dataset`, `CountiesPayload` (`@/lib/countle`).
- Produces:
  - `theme.ts`: `GROUP_HEX: Record<GroupColor, string>`, `GROUP_TEXT: string` (= INK).
  - `useConnections()` returning: `{ status: "loading" | "ready" | "error"; view: ConnectionsView | null; selected: string[]; displayOrder: string[]; toggle(fips: string): void; submit(): { kind: "correct" | "one-away" | "wrong" | "duplicate" } | null; shuffle(): void; deselectAll(): void }`.

**Verification:** this task has no vitest (it's a React hook over `applySubmission`, which is already TDD'd). Gate on typecheck in Step 3.

- [ ] **Step 1: Create `theme.ts`**
```ts
import type { GroupColor } from "@/lib/connections";
import { INK } from "@/components/countle/theme";

export const GROUP_HEX: Record<GroupColor, string> = {
  yellow: "#f2c14e",
  green: "#6fae53",
  blue: "#5a8fd6",
  purple: "#a96fc0",
};
export const GROUP_TEXT = INK;
```

- [ ] **Step 2: Create `useConnections.ts`**
```ts
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applySubmission, buildConnectionsView, loadConnectionsState, saveConnectionsState,
  type ConnectionsPayload, type ConnectionsState, type ConnectionsView,
} from "@/lib/connections";
import { buildDataset, dateKeyUTC, type CountiesPayload, type Dataset } from "@/lib/countle";

type SubmitOutcome = { kind: "correct" | "one-away" | "wrong" | "duplicate" } | null;

export function useConnections() {
  const [payload, setPayload] = useState<ConnectionsPayload | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [state, setState] = useState<ConnectionsState | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selected, setSelected] = useState<string[]>([]);
  const [displayOrder, setDisplayOrder] = useState<string[]>([]);
  const dateKeyRef = useRef<string>(dateKeyUTC(new Date()));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cRes, pRes] = await Promise.all([
          fetch("/data/counties.json"),
          fetch("/data/connections.json"),
        ]);
        if (!cRes.ok || !pRes.ok) throw new Error(`HTTP ${cRes.status}/${pRes.status}`);
        const counties = (await cRes.json()) as CountiesPayload;
        const conn = (await pRes.json()) as ConnectionsPayload;
        if (cancelled) return;
        const ds = buildDataset(counties);
        const st = loadConnectionsState(window.localStorage);
        setDataset(ds);
        setPayload(conn);
        setState(st);
        const v = buildConnectionsView(conn, ds, st, dateKeyRef.current);
        setDisplayOrder(v.remainingFips);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const view = useMemo(
    () => (payload && dataset && state ? buildConnectionsView(payload, dataset, state, dateKeyRef.current) : null),
    [payload, dataset, state]
  );

  const toggle = useCallback((fips: string) => {
    setSelected((cur) => {
      if (cur.includes(fips)) return cur.filter((f) => f !== fips);
      if (cur.length >= 4) return cur;
      return [...cur, fips];
    });
  }, []);

  const deselectAll = useCallback(() => setSelected([]), []);

  const shuffle = useCallback(() => {
    setDisplayOrder((cur) => {
      const a = [...cur];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    });
  }, []);

  const submit = useCallback((): SubmitOutcome => {
    if (!payload || !state || selected.length !== 4) return null;
    const fips4 = [...selected];
    const r = applySubmission(payload, state, dateKeyRef.current, fips4);
    if (!r.ok) {
      setSelected([]);
      return r.reason === "duplicate" ? { kind: "duplicate" } : null;
    }
    setState(r.state);
    saveConnectionsState(window.localStorage, r.state);
    if (r.result.kind === "correct") {
      const solved = new Set(fips4);
      setDisplayOrder((cur) => cur.filter((f) => !solved.has(f)));
    }
    setSelected([]);
    return { kind: r.result.kind };
  }, [payload, state, selected]);

  return { status, view, selected, displayOrder, toggle, submit, shuffle, deselectAll };
}
```

- [ ] **Step 3: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors. (If `@/lib/countle` does not already export `CountiesPayload`/`Dataset`/`dateKeyUTC`/`buildDataset`, import them from their submodules: `buildDataset` from `@/lib/countle/data`, `dateKeyUTC` from `@/lib/countle/daily`, and the types from `@/lib/countle/types`. Verify against the existing `useCountle.ts` imports, which already use `@/lib/countle` for `buildDataset`/`dateKeyUTC`/`CountiesPayload`/`Dataset`.)

```bash
git add src/components/connections/theme.ts src/components/connections/useConnections.ts
git commit -m "feat(connections-ui): theme tokens + useConnections hook"
```

---

## Task 4: Presentational components (Card, Grid, Controls, Header)

**Files:**
- Create: `src/components/connections/Card.tsx`
- Create: `src/components/connections/Grid.tsx`
- Create: `src/components/connections/Controls.tsx`
- Create: `src/components/connections/Header.tsx`

**Interfaces:**
- Consumes: `ViewGroup` from `@/lib/connections`; `GROUP_HEX`, `GROUP_TEXT` from `./theme`; `PAPER`, `INK` from `@/components/countle/theme`.
- Produces (component prop contracts):
  - `Card({ label, selected, disabled, onClick }: { label: string; selected: boolean; disabled?: boolean; onClick: () => void })`
  - `SolvedBand({ group }: { group: ViewGroup })` (exported from `Grid.tsx`)
  - `Grid({ solvedGroups, displayOrder, labelOf, selected, disabled, onToggle }: { solvedGroups: ViewGroup[]; displayOrder: string[]; labelOf: (fips: string) => string; selected: string[]; disabled: boolean; onToggle: (fips: string) => void })`
  - `Controls({ mistakesLeft, canSubmit, anySelected, onShuffle, onDeselect, onSubmit }: { mistakesLeft: number; canSubmit: boolean; anySelected: boolean; onShuffle: () => void; onDeselect: () => void; onSubmit: () => void })`
  - `Header({ puzzleNumber, streak, onOpenStats }: { puzzleNumber: number; streak: number; onOpenStats: () => void })`

**Verification:** typecheck (`npx tsc --noEmit`). Visual verification happens in Task 5.

- [ ] **Step 1: Create `Card.tsx`**
```tsx
"use client";
import { PAPER, INK } from "@/components/countle/theme";

export default function Card({ label, selected, disabled, onClick }: {
  label: string; selected: boolean; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="animate-pop-in"
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
        aspectRatio: "1 / 1", padding: 6, borderRadius: 12, cursor: disabled ? "default" : "pointer",
        border: `2px solid ${selected ? INK : "rgba(36,29,18,0.14)"}`,
        background: selected ? INK : "#fffaf0",
        color: selected ? PAPER : INK,
        fontFamily: "var(--font-display)", fontSize: "clamp(11px, 3.2vw, 15px)", lineHeight: 1.05,
        fontWeight: 600, transition: "background 0.12s, color 0.12s, border-color 0.12s, transform 0.08s",
        transform: selected ? "translateY(1px)" : "none",
      }}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Create `Grid.tsx`** (solved bands stack above the remaining-card grid)
```tsx
"use client";
import type { ViewGroup } from "@/lib/connections";
import { GROUP_HEX, GROUP_TEXT } from "./theme";
import Card from "./Card";

export function SolvedBand({ group }: { group: ViewGroup }) {
  return (
    <div className="animate-pop-in" style={{
      background: GROUP_HEX[group.color], color: GROUP_TEXT, borderRadius: 12,
      padding: "10px 12px", textAlign: "center",
    }}>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 14, letterSpacing: 0.3, textTransform: "uppercase" }}>
        {group.label}
      </div>
      <div style={{ fontSize: 13, marginTop: 2, opacity: 0.85 }}>
        {group.cards.map((c) => c.label).join("  ·  ")}
      </div>
    </div>
  );
}

export default function Grid({ solvedGroups, displayOrder, labelOf, selected, disabled, onToggle }: {
  solvedGroups: ViewGroup[];
  displayOrder: string[];
  labelOf: (fips: string) => string;
  selected: string[];
  disabled: boolean;
  onToggle: (fips: string) => void;
}) {
  const sel = new Set(selected);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {solvedGroups.map((g) => <SolvedBand key={g.color} group={g} />)}
      {displayOrder.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {displayOrder.map((fips) => (
            <Card key={fips} label={labelOf(fips)} selected={sel.has(fips)}
              disabled={disabled} onClick={() => onToggle(fips)} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `Controls.tsx`**
```tsx
"use client";
import { INK } from "@/components/countle/theme";

function PillButton({ label, onClick, disabled, primary }: {
  label: string; onClick: () => void; disabled?: boolean; primary?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "10px 18px", borderRadius: 999, fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700,
      cursor: disabled ? "default" : "pointer",
      border: `2px solid ${disabled ? "rgba(36,29,18,0.18)" : INK}`,
      background: primary && !disabled ? INK : "transparent",
      color: primary && !disabled ? "#f7f1e6" : disabled ? "rgba(36,29,18,0.35)" : INK,
      transition: "opacity 0.12s",
    }}>
      {label}
    </button>
  );
}

export default function Controls({ mistakesLeft, canSubmit, anySelected, onShuffle, onDeselect, onSubmit }: {
  mistakesLeft: number; canSubmit: boolean; anySelected: boolean;
  onShuffle: () => void; onDeselect: () => void; onSubmit: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#7c715c" }}>
        <span>Mistakes remaining:</span>
        <div style={{ display: "flex", gap: 6 }}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={{
              width: 12, height: 12, borderRadius: "50%",
              background: i < mistakesLeft ? INK : "rgba(36,29,18,0.18)",
            }} />
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        <PillButton label="Shuffle" onClick={onShuffle} />
        <PillButton label="Deselect all" onClick={onDeselect} disabled={!anySelected} />
        <PillButton label="Submit" onClick={onSubmit} disabled={!canSubmit} primary />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `Header.tsx`**
```tsx
"use client";
import { INK } from "@/components/countle/theme";

export default function Header({ puzzleNumber, streak, onOpenStats }: {
  puzzleNumber: number; streak: number; onOpenStats: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 38, margin: 0, letterSpacing: -0.5, color: INK }}>CONNECTIONS</h1>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#b98a2e" }}>#{puzzleNumber}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 15, color: INK }}>
        <span title="streak">🔥 {streak}</span>
        <button style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18, padding: 2 }}
          aria-label="Statistics" title="Statistics" onClick={onOpenStats}>📊</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add src/components/connections/Card.tsx src/components/connections/Grid.tsx src/components/connections/Controls.tsx src/components/connections/Header.tsx
git commit -m "feat(connections-ui): grid, card, controls, header components"
```

---

## Task 5: Overlays, orchestrator, route + visual verification

**Files:**
- Create: `src/components/connections/StatsModal.tsx`
- Create: `src/components/connections/WinLose.tsx`
- Create: `src/components/connections/ConnectionsApp.tsx`
- Create: `src/app/connections/page.tsx`

**Interfaces:**
- Consumes: `useConnections` (`./useConnections`); `connectionsStats`, `ConnectionsView` (`@/lib/connections`); `Overlay` (`@/components/countle/Overlay`); `Header`, `Grid`, `Controls`, `StatsModal`, `WinLose`; `GROUP_HEX`, `GROUP_TEXT` (`./theme`); `INK`, `PAPER` (`@/components/countle/theme`).
- Produces: `ConnectionsApp` (default export), `page.tsx` default `Page`.

- [ ] **Step 1: Create `StatsModal.tsx`**
```tsx
"use client";
import type { ConnectionsState } from "@/lib/connections";
import { connectionsStats } from "@/lib/connections";
import { INK } from "@/components/countle/theme";

function Stat({ big, label }: { big: string | number; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 26, color: INK, lineHeight: 1 }}>{big}</div>
      <div style={{ fontSize: 11.5, color: "#8a7d65", marginTop: 3 }}>{label}</div>
    </div>
  );
}

export default function StatsModal({ state }: { state: ConnectionsState }) {
  const s = connectionsStats(state);
  return (
    <div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: INK, marginBottom: 14 }}>Statistics</div>
      <div style={{ display: "flex", justifyContent: "space-around" }}>
        <Stat big={s.played} label="played" />
        <Stat big={`${s.winPct}%`} label="win rate" />
        <Stat big={s.currentStreak} label="streak" />
        <Stat big={s.maxStreak} label="max streak" />
        <Stat big={s.perfect} label="perfect" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `WinLose.tsx`** (reveal all four groups in color order + Share)
```tsx
"use client";
import { useState } from "react";
import type { ConnectionsView } from "@/lib/connections";
import { COLORS } from "@/lib/connections";
import { GROUP_HEX, GROUP_TEXT } from "./theme";
import { INK } from "@/components/countle/theme";

export default function WinLose({ view }: { view: ConnectionsView }) {
  const [copied, setCopied] = useState(false);
  // All four groups in canonical color order (solved + unsolved combined).
  const byColor = new Map([...view.solvedGroups, ...view.unsolvedGroups].map((g) => [g.color, g]));
  const ordered = COLORS.map((c) => byColor.get(c)!).filter(Boolean);

  const onShare = async () => {
    try {
      await navigator.clipboard.writeText(view.shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div style={{ marginTop: 26, textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 30, color: INK, marginBottom: 4 }}>
        {view.won ? "Solved it!" : "Next time!"}
      </div>
      <div style={{ color: "#7c715c", fontSize: 14, marginBottom: 16 }}>
        {view.won ? `Streak ${view.streak} 🔥` : "Here were the four groups:"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {ordered.map((g) => (
          <div key={g.color} style={{ background: GROUP_HEX[g.color], color: GROUP_TEXT, borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 14, textTransform: "uppercase" }}>{g.label}</div>
            <div style={{ fontSize: 13, marginTop: 2, opacity: 0.85 }}>{g.cards.map((c) => c.label).join("  ·  ")}</div>
          </div>
        ))}
      </div>
      <button onClick={onShare} style={{
        padding: "12px 26px", borderRadius: 999, border: "none", background: INK, color: "#f7f1e6",
        fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, cursor: "pointer",
      }}>
        {copied ? "Copied!" : "Share"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create `ConnectionsApp.tsx`** (orchestrator)
```tsx
"use client";
import { useState } from "react";
import { useConnections } from "./useConnections";
import Header from "./Header";
import Grid from "./Grid";
import Controls from "./Controls";
import WinLose from "./WinLose";
import StatsModal from "./StatsModal";
import Overlay from "@/components/countle/Overlay";
import { INK } from "@/components/countle/theme";
import { loadConnectionsState } from "@/lib/connections";

export default function ConnectionsApp() {
  const { status, view, selected, displayOrder, toggle, submit, shuffle, deselectAll } = useConnections();
  const [overlay, setOverlay] = useState<null | "stats">(null);
  const [flash, setFlash] = useState<string | null>(null);

  if (status !== "ready" || !view) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: INK }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 22 }}>
          {status === "error" ? "Couldn't load today's puzzle." : "Loading…"}
        </span>
      </main>
    );
  }

  const labelOf = (fips: string) =>
    view.unsolvedGroups.flatMap((g) => g.cards).find((c) => c.fips === fips)?.label ?? fips;

  const onSubmit = () => {
    const r = submit();
    if (!r) return;
    if (r.kind === "one-away") showFlash("One away…");
    else if (r.kind === "wrong") showFlash("Not a group.");
    else if (r.kind === "duplicate") showFlash("Already tried.");
  };
  const showFlash = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(null), 1400); };

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "28px 18px 80px" }}>
      <Header puzzleNumber={view.puzzleNumber} streak={view.streak} onOpenStats={() => setOverlay("stats")} />
      <p style={{ color: "#7c715c", fontSize: 14, margin: "10px 0 18px" }}>
        Create four groups of four counties.
      </p>

      <div style={{ position: "relative" }}>
        {flash && (
          <div className="animate-fade-in" style={{
            position: "absolute", top: -34, left: "50%", transform: "translateX(-50%)", zIndex: 5,
            background: INK, color: "#f7f1e6", padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
          }}>{flash}</div>
        )}
        <Grid solvedGroups={view.solvedGroups} displayOrder={displayOrder} labelOf={labelOf}
          selected={selected} disabled={view.finished} onToggle={toggle} />
      </div>

      {!view.finished && (
        <Controls mistakesLeft={view.mistakesLeft} canSubmit={selected.length === 4}
          anySelected={selected.length > 0} onShuffle={shuffle} onDeselect={deselectAll} onSubmit={onSubmit} />
      )}

      {view.finished && <WinLose view={view} />}

      {overlay === "stats" && (
        <Overlay onClose={() => setOverlay(null)}>
          <StatsModal state={loadConnectionsState(window.localStorage)} />
        </Overlay>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Create the route `src/app/connections/page.tsx`**
```tsx
import ConnectionsApp from "@/components/connections/ConnectionsApp";

export default function Page() {
  return <ConnectionsApp />;
}
```

- [ ] **Step 5: Typecheck + production build**

Run: `npx tsc --noEmit` → no errors.
Run: `npm run build` → succeeds (compiles `/connections` route).

- [ ] **Step 6: Playwright visual verification**

Start the dev server (`npm run dev`), navigate to `http://localhost:3000/connections`, and capture screenshots of: (a) the initial 4×4 grid, (b) a 4-card selection (Submit enabled), (c) one solved colored band above the shrunken grid, and (d) the finished WinLose reveal with the Share button. Confirm: 16 cards render as "Name, ST", selection inverts to ink, solved groups collapse into colored bands in difficulty order, mistakes dots decrement, and the share text copies. Save screenshots to the working dir for review.

- [ ] **Step 7: Commit**
```bash
git add src/components/connections/StatsModal.tsx src/components/connections/WinLose.tsx src/components/connections/ConnectionsApp.tsx src/app/connections/page.tsx
git commit -m "feat(connections-ui): stats + win/lose overlays, orchestrator, /connections route"
```

---

## Self-Review Notes (author)

- **Spec coverage:** grid/select-4/submit (Tasks 4–5), 4 mistakes + one-away (Task 2 reducer + Controls/flash), shuffle + deselect (hook), win/lose reveal (WinLose), streak/stats (stats.ts + StatsModal + state machine), colored share grid (`shareRow`/`buildShareText` via view + WinLose Share), localStorage `connections-v1` (persistence.ts), card label "County, ST" (labels.ts), Bold Pop reuse (Countle theme/Overlay/fonts/animations). All covered.
- **Engine reuse, not fork:** every engine call goes through existing `@/lib/connections` exports; only additive sibling modules are introduced and barrel-exported.
- **Type consistency:** `ConnectionsView`/`ViewGroup`/`ViewCard` defined in Task 2 are consumed unchanged in Tasks 3–5. `GroupColor`/`COLORS`/`COLOR_EMOJI` come from the engine. `applySubmission`'s `SubmissionResult.kind` ∈ {correct, one-away, wrong} is mapped to the hook's outcome (plus "duplicate").
- **Risk:** if `@/lib/countle` barrel does not export `CountiesPayload`/`Dataset`/`dateKeyUTC`/`buildDataset`, fall back to submodule imports (noted in Task 3 Step 3). `useCountle.ts` confirms the barrel does export them.
```

