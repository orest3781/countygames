# Countle UI Implementation Plan (Plan 3 — Playable Core)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable, shareable daily Countle game in the "Bold Pop Almanac" visual style — load the dataset, play the daily mystery county with 6 guesses, see animated per-stat + distance feedback, win/lose with the art (or region-color fallback) reveal, and copy a spoiler-free share grid. State persists in localStorage.

**Architecture:** Thin React (Next 16 App Router, client component) over the pure engine from Plan 2 (`src/lib/countle/`). All game derivation is pure and unit-tested: `persistence.ts` (localStorage wrapper) and `session.ts` (`buildSession`/`submitGuess` derive everything renderable from `(dataset, state, dateKey)`). The `useCountle` hook is the only browser-coupled glue (fetch `/data/counties.json`, read/write localStorage, read the clock once). Components are dumb renderers verified by Playwright.

**Tech Stack:** Next.js 16 + React 19 + Tailwind 4; the Plan 2 engine; `vitest` (already configured for `src/**`). One new font via `next/font/google` (Archivo Black — free, no dependency). No other new dependencies; components use inline styles for Bold Pop specifics + a shared `theme.ts`.

## Global Constraints

- **Build on the Plan 2 engine** (`src/lib/countle/index.ts`). Public API to consume (do not reimplement): `buildDataset(payload)`, `searchCounties(dataset, query, limit)`, `getDailyCounty(dataset, dateKey)`, `dateKeyUTC(date)`, `puzzleNumber(dateKey)`, `evaluateGuess(mystery, guess)`, `blurForGuess(guessesMade)`, `buildShareText(opts)`, `initialState()`, `parseState(raw)`, `serializeState(s)`, `startDay(s, dateKey)`, `recordGuess(s, fips, opts)`; types `CountyEntry`, `Dataset`, `GuessResult`, `StatFeedback`, `CountleState`; constants `GUESS_LIMIT`, `NOTABLE_CLUE_GUESS`, `BLUR_SCHEDULE`.
- **localStorage key is exactly `countle-v1`.** Only `persistence.ts` and `useCountle.ts` touch `window`/`localStorage`. Pure modules stay pure (testable in node).
- **`dateKeyUTC(new Date())`** is the ONLY place a live clock is read (in the hook). Pure logic always receives `dateKey`.
- **Bold Pop Almanac visual rules (spec §7):** warm off-white background (`#f7f1e6`), near-black ink (`#241d12`); heavy display face (Archivo Black) for wordmark/county-name/big-numbers; tabular figures for stat numbers. **Stat-feedback colors are universal & fixed** — close `#16a34a` (green), near `#d6a400` (amber/yellow), far `#9ca3af` (grey) — NEVER region-tinted. **Region palette colors** are identity only — used for the win wash + the art-less fallback card.
- **Art is optional.** `mystery.hasArt` true → blurred `/art/{fips}.png` accent during play, full art on win. False → a region-color "mystery"/reveal card (no photo). Never show the county name on the tile until the game is finished.
- **Region colors** (hex, for win wash + fallback card): Northeast `#4f7cc4`, Southeast `#e0974a`, Midwest `#caa233`, South `#bd5f33`, Mountain `#5f8fc0`, Pacific `#16a37b`, Southwest `#d2683f`, Appalachia `#4f8f78`, Unknown `#8a8a8a`.
- **Notable-person clue:** show only when `session.clueAvailable` (engine `NOTABLE_CLUE_GUESS`) AND `mystery.notable_person != null`. ~29% of counties have one — the UI must render nothing in the clue slot when it's null (no empty box).
- **No new test framework.** Pure logic is vitest-TDD'd (node). Components are verified by `npm run build` (typecheck) + Playwright screenshots/interaction. Do NOT add testing-library/jsdom.
- **Retire, don't delete:** the old `src/app/page.tsx` is replaced; old `src/components/*` (USMap, CountyCard, overlays) and `src/lib/{store,supabase,battle}.ts` are left in place unused (USMap is reused in Plan 4). They must not be imported by the new app.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/countle/persistence.ts` | `STORAGE_KEY="countle-v1"`; `loadStateFrom(storage)`, `saveStateTo(storage, state)`. Pure given an injected `Storage`. |
| `src/lib/countle/session.ts` | `buildSession(dataset, state, dateKey): Session` and `submitGuess(dataset, state, dateKey, fips): SubmitResult`. Pure — the renderable game state. |
| `src/components/countle/theme.ts` | Shared constants: `REGION_COLOR`, `CLOSENESS_COLOR`, `INK`, `PAPER`, stat labels. No logic. |
| `src/components/countle/useCountle.ts` | Client hook: fetch dataset, load/save localStorage, read clock once, expose `{ status, session, guess, lastError }`. |
| `src/components/countle/GuessInput.tsx` | Autocomplete search box (uses `searchCounties`); calls `guess(fips)`. |
| `src/components/countle/StatBoard.tsx` | The 6 animated stat rows for the latest guess (bars colored by closeness, big numbers, arrows). |
| `src/components/countle/CompassReadout.tsx` | Distance + 8-point compass for the latest guess. |
| `src/components/countle/GuessHistory.tsx` | Compact prior-guess rows (name + emoji share row + distance). |
| `src/components/countle/MysteryTile.tsx` | Blurred art / region-color mystery tile (pre-win). |
| `src/components/countle/Header.tsx` | Wordmark · puzzle # · streak · guesses-left. |
| `src/components/countle/WinReveal.tsx` | Win/lose overlay: full art or fallback card, region wash, name/flavor, Share (clipboard). |
| `src/components/countle/CountleApp.tsx` | Client orchestrator: `useCountle` → renders all screens. |
| `src/app/page.tsx` | Replaced — renders `<CountleApp />`. |
| `src/app/layout.tsx` | Add Archivo Black font; bright body; title "Countle". |
| `src/app/globals.css` | Bright theme + Bold Pop animations. |
| `src/lib/countle/persistence.test.ts`, `session.test.ts` | Vitest unit tests. |

### `Session` shape (produced by `buildSession`, consumed by every component)
```ts
interface Session {
  dateKey: string;
  puzzleNumber: number;
  mystery: CountyEntry;
  guessResults: GuessResult[];   // in guess order
  latest: GuessResult | null;    // most recent, or null before any guess
  solved: boolean;
  finished: boolean;
  guessesUsed: number;
  guessesLeft: number;           // GUESS_LIMIT - guessesUsed
  blur: number;                  // px, from blurForGuess(guessesUsed)
  clueAvailable: boolean;        // notable-person clue unlocked AND mystery has one
  shareRows: string[];
  shareText: string;
  streak: number;
}

type SubmitResult =
  | { ok: true; state: CountleState; result: GuessResult }
  | { ok: false; reason: "unknown" | "duplicate" | "finished" };
```

---

## Task 1: Bright theme, display font, animations

**Files:**
- Modify: `src/app/layout.tsx`, `src/app/globals.css`
- Create: `src/components/countle/theme.ts`

**Interfaces:**
- Produces: `--font-display` = Archivo Black; bright body; CSS animations `bar-grow`, `count-pop`, `tile-reveal`, `wash-in`, `confetti-fall`; `theme.ts` exports `REGION_COLOR`, `CLOSENESS_COLOR`, `INK`, `PAPER`, `STAT_LABELS`.

- [ ] **Step 1: Swap the font + bright body in `layout.tsx`**

Replace `src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Inter, Archivo_Black } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const archivo = Archivo_Black({ subsets: ["latin"], weight: "400", variable: "--font-display" });

export const metadata: Metadata = {
  title: "Countle — the daily county game",
  description: "Guess the mystery US county in 6 tries.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${archivo.variable}`}>
      <body className="font-sans antialiased min-h-screen" style={{ background: "#f7f1e6", color: "#241d12" }}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Bright theme + Bold Pop animations in `globals.css`**

Replace `src/app/globals.css` with:

```css
@import "tailwindcss";

@theme {
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-display: var(--font-display), ui-sans-serif, system-ui, sans-serif;
}

body {
  background-color: #f7f1e6;
  background-image:
    radial-gradient(1200px 600px at 80% -10%, rgba(251, 236, 205, 0.5), transparent),
    radial-gradient(900px 500px at -10% 110%, rgba(214, 236, 223, 0.5), transparent);
}

@keyframes bar-grow { 0% { transform: scaleX(0); } 100% { transform: scaleX(1); } }
@keyframes count-pop { 0% { transform: scale(0.6); opacity: 0; } 60% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
@keyframes tile-reveal { 0% { transform: scale(0.85); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
@keyframes wash-in { 0% { opacity: 0; } 100% { opacity: 1; } }
@keyframes fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }
@keyframes modal-in { 0% { transform: translateY(14px) scale(0.98); opacity: 0; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
@keyframes pop-in { 0% { transform: scale(0); } 60% { transform: scale(1.15); } 100% { transform: scale(1); } }

.animate-bar-grow { animation: bar-grow 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; transform-origin: left; }
.animate-count-pop { animation: count-pop 0.35s ease-out forwards; }
.animate-tile-reveal { animation: tile-reveal 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
.animate-wash-in { animation: wash-in 0.4s ease-out forwards; }
.animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
.animate-modal-in { animation: modal-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
.animate-pop-in { animation: pop-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
```

- [ ] **Step 3: Create `src/components/countle/theme.ts`**

```ts
import type { StatKey } from "@/lib/countle";

export const PAPER = "#f7f1e6";
export const INK = "#241d12";

export const REGION_COLOR: Record<string, string> = {
  Northeast: "#4f7cc4", Southeast: "#e0974a", Midwest: "#caa233", South: "#bd5f33",
  Mountain: "#5f8fc0", Pacific: "#16a37b", Southwest: "#d2683f", Appalachia: "#4f8f78", Unknown: "#8a8a8a",
};
export function regionColor(region: string): string {
  return REGION_COLOR[region] ?? REGION_COLOR.Unknown;
}

export const CLOSENESS_COLOR: Record<"close" | "near" | "far", string> = {
  close: "#16a34a", near: "#d6a400", far: "#9ca3af",
};

export const STAT_LABELS: { key: StatKey; label: string }[] = [
  { key: "wealth", label: "Wealth" }, { key: "health", label: "Health" }, { key: "people", label: "People" },
  { key: "land", label: "Land" }, { key: "danger", label: "Danger" }, { key: "education", label: "Education" },
];
```

> `@/lib/countle` resolves via the existing tsconfig path alias `@/* → ./src/*`. The engine barrel `src/lib/countle/index.ts` re-exports `StatKey`.

- [ ] **Step 4: Verify it builds and renders bright**

Run: `npm run build`
Expected: compiles with no type errors (the new `theme.ts` + layout typecheck).

Run (if a dev server is not already up): `npm run dev`, then load `http://localhost:3000/preview` (the existing data preview).
Expected: page still renders; the body background is the warm off-white (confirms the theme swap didn't break existing routes).

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css src/components/countle/theme.ts
git commit -m "feat(ui): bright Bold Pop theme, Archivo Black display font, animations + shared theme tokens"
```

---

## Task 2: localStorage persistence wrapper

**Files:**
- Create: `src/lib/countle/persistence.ts`
- Test: `src/lib/countle/persistence.test.ts`

**Interfaces:**
- Consumes: `parseState`, `serializeState`, `CountleState` (engine).
- Produces: `STORAGE_KEY = "countle-v1"`; `loadStateFrom(storage: StorageLike): CountleState`; `saveStateTo(storage: StorageLike, state: CountleState): void`; `interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/countle/persistence.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { STORAGE_KEY, loadStateFrom, saveStateTo, type StorageLike } from "./persistence";
import { initialState } from "./state";
import { recordGuess, startDay } from "./state";

function memStorage(initial?: Record<string, string>): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; } };
}

describe("persistence", () => {
  it("STORAGE_KEY is countle-v1", () => {
    expect(STORAGE_KEY).toBe("countle-v1");
  });
  it("loads initial state when storage is empty", () => {
    expect(loadStateFrom(memStorage()).gamesPlayed).toBe(0);
  });
  it("round-trips a saved state under the right key", () => {
    const s = recordGuess(startDay(initialState(), "2026-06-25"), "06037", { isCorrect: true, dateKey: "2026-06-25", answerFips: "06037" });
    const store = memStorage();
    saveStateTo(store, s);
    expect(store.data[STORAGE_KEY]).toContain('"streak":1');
    expect(loadStateFrom(store).streak).toBe(1);
  });
  it("falls back to initial on corrupt stored data", () => {
    expect(loadStateFrom(memStorage({ [STORAGE_KEY]: "{garbage" })).gamesPlayed).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- persistence.test`
Expected: FAIL — cannot resolve `./persistence`.

- [ ] **Step 3: Implement `persistence.ts`**

```ts
import { parseState, serializeState } from "./state";
import type { CountleState } from "./types";

export const STORAGE_KEY = "countle-v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadStateFrom(storage: StorageLike): CountleState {
  return parseState(storage.getItem(STORAGE_KEY));
}

export function saveStateTo(storage: StorageLike, state: CountleState): void {
  storage.setItem(STORAGE_KEY, serializeState(state));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- persistence.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/countle/persistence.ts src/lib/countle/persistence.test.ts
git commit -m "feat(ui): localStorage persistence wrapper (countle-v1)"
```

---

## Task 3: Session derivation (`buildSession` + `submitGuess`)

**Files:**
- Create: `src/lib/countle/session.ts`
- Test: `src/lib/countle/session.test.ts`

**Interfaces:**
- Consumes: `getDailyCounty`, `puzzleNumber`, `evaluateGuess`, `blurForGuess`, `buildShareText`, `startDay`, `recordGuess`, `GUESS_LIMIT`, `NOTABLE_CLUE_GUESS`, types.
- Produces: `buildSession(dataset, state, dateKey): Session`; `submitGuess(dataset, state, dateKey, fips): SubmitResult` (shapes in the File Structure section).

- [ ] **Step 1: Write the failing test**

Create `src/lib/countle/session.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSession, submitGuess } from "./session";
import { buildDataset } from "./data";
import { initialState } from "./state";
import type { CountiesPayload, CountyEntry, StatKey } from "./types";

function county(fips: string, name: string, lat: number, lng: number, pool: boolean, stats: Record<StatKey, number>, notable: string | null = null): CountyEntry {
  return { fips, name, state_abbr: "XX", state_name: "X", region: "Pacific", county_seat: null, lat, lng,
    stats, display: { wealth: "", health: "", people: "", land: "", danger: "", education: "" },
    rarity: "common", hasArt: false, isAnswerPool: pool, notable_person: notable, notable_person_desc: null, flavor: null };
}
const even = { wealth: 50, health: 50, people: 50, land: 50, danger: 50, education: 50 };
const payload: CountiesPayload = { schemaVersion: 1, generatedAt: "x", count: 3, answerPoolCount: 1,
  counties: {
    "06037": county("06037", "Los Angeles County", 34.05, -118.24, true, even, "Some Person"),
    "36061": county("36061", "New York County", 40.71, -74.0, false, even),
    "17031": county("17031", "Cook County", 41.88, -87.63, false, even),
  } };
const ds = buildDataset(payload); // answer pool = ["06037"], so the daily is always LA
const KEY = "2026-06-25";

describe("buildSession (fresh)", () => {
  const s = buildSession(ds, initialState(), KEY);
  it("exposes the daily mystery, puzzle number, full blur, no guesses", () => {
    expect(s.mystery.fips).toBe("06037");
    expect(s.puzzleNumber).toBe(1);
    expect(s.guessesUsed).toBe(0);
    expect(s.guessesLeft).toBe(6);
    expect(s.latest).toBeNull();
    expect(s.blur).toBe(24);
    expect(s.finished).toBe(false);
    expect(s.clueAvailable).toBe(false);
  });
});

describe("submitGuess", () => {
  it("rejects an unknown fips", () => {
    const r = submitGuess(ds, initialState(), KEY, "99999");
    expect(r).toEqual({ ok: false, reason: "unknown" });
  });
  it("records a wrong guess and reflects it in the next session", () => {
    const r = submitGuess(ds, initialState(), KEY, "36061");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = buildSession(ds, r.state, KEY);
    expect(s.guessesUsed).toBe(1);
    expect(s.latest!.guess.fips).toBe("36061");
    expect(s.latest!.isCorrect).toBe(false);
    expect(s.solved).toBe(false);
    expect(s.shareRows.length).toBe(1);
  });
  it("rejects a duplicate guess", () => {
    const r1 = submitGuess(ds, initialState(), KEY, "36061");
    if (!r1.ok) throw new Error("setup");
    expect(submitGuess(ds, r1.state, KEY, "36061")).toEqual({ ok: false, reason: "duplicate" });
  });
  it("a correct guess solves and finishes the session", () => {
    const r = submitGuess(ds, initialState(), KEY, "06037");
    if (!r.ok) throw new Error("setup");
    const s = buildSession(ds, r.state, KEY);
    expect(s.solved).toBe(true);
    expect(s.finished).toBe(true);
    expect(s.streak).toBe(1);
    expect(s.shareText).toContain("Countle #1  1/6");
  });
  it("rejects guesses after the game is finished", () => {
    const r = submitGuess(ds, initialState(), KEY, "06037");
    if (!r.ok) throw new Error("setup");
    expect(submitGuess(ds, r.state, KEY, "36061")).toEqual({ ok: false, reason: "finished" });
  });
  it("exposes the notable-person clue once enough wrong guesses are made", () => {
    let state = initialState();
    for (const fips of ["36061", "17031", "36061b-skip"]) {
      // only valid fips; stop at unknown
    }
    // make 4 wrong guesses (NOTABLE_CLUE_GUESS - 1 = 4)
    let st = initialState();
    for (let i = 0; i < 4; i++) {
      const r = submitGuess(ds, st, KEY, i % 2 === 0 ? "36061" : "17031");
      // duplicates rejected; use alternating but that still duplicates after 2 — instead guess distinct each time below
    }
    // distinct wrong guesses:
    st = initialState();
    const wrongs = ["36061", "17031"];
    for (const w of wrongs) { const r = submitGuess(ds, st, KEY, w); if (r.ok) st = r.state; }
    const s = buildSession(ds, st, KEY);
    // only 2 wrong guesses → clue not yet available
    expect(s.clueAvailable).toBe(false);
  });
});
```

> **Note:** the messy loop in the last test is a leftover — replace that whole `it("exposes the notable-person clue …")` body before running with this clean version (the dataset only has 2 valid wrong guesses, so we test the *not-yet-available* path, which is what's verifiable here):
> ```ts
>   it("does not expose the clue before NOTABLE_CLUE_GUESS-1 wrong guesses", () => {
>     let st = initialState();
>     for (const w of ["36061", "17031"]) { const r = submitGuess(ds, st, KEY, w); if (r.ok) st = r.state; }
>     expect(buildSession(ds, st, KEY).clueAvailable).toBe(false);
>   });
> ```

- [ ] **Step 2: Replace the flagged test with the clean version, then run to verify it fails**

Edit the last `it(...)` per the note above.
Run: `npm test -- session.test`
Expected: FAIL — cannot resolve `./session`.

- [ ] **Step 3: Implement `session.ts`**

```ts
import type { CountleState, CountyEntry, Dataset, GuessResult } from "./types";
import { GUESS_LIMIT, NOTABLE_CLUE_GUESS } from "./constants";
import { getDailyCounty, puzzleNumber } from "./daily";
import { evaluateGuess, blurForGuess } from "./feedback";
import { buildShareText } from "./share";
import { startDay, recordGuess } from "./state";

export interface Session {
  dateKey: string;
  puzzleNumber: number;
  mystery: CountyEntry;
  guessResults: GuessResult[];
  latest: GuessResult | null;
  solved: boolean;
  finished: boolean;
  guessesUsed: number;
  guessesLeft: number;
  blur: number;
  clueAvailable: boolean;
  shareRows: string[];
  shareText: string;
  streak: number;
}

export type SubmitResult =
  | { ok: true; state: CountleState; result: GuessResult }
  | { ok: false; reason: "unknown" | "duplicate" | "finished" };

function todaysGuesses(state: CountleState, dateKey: string): string[] {
  return state.today && state.today.dateKey === dateKey ? state.today.guesses : [];
}

export function buildSession(dataset: Dataset, state: CountleState, dateKey: string): Session {
  const mystery = getDailyCounty(dataset, dateKey);
  const guesses = todaysGuesses(state, dateKey);
  const guessResults = guesses.map((fips) => evaluateGuess(mystery, dataset.byFips.get(fips)!));
  const solved = !!(state.today && state.today.dateKey === dateKey && state.today.solved);
  const finished = !!(state.today && state.today.dateKey === dateKey && state.today.finished);
  const guessesUsed = guesses.length;
  const shareRows = guessResults.map((r) => r.shareRow);
  return {
    dateKey,
    puzzleNumber: puzzleNumber(dateKey),
    mystery,
    guessResults,
    latest: guessResults.length ? guessResults[guessResults.length - 1] : null,
    solved,
    finished,
    guessesUsed,
    guessesLeft: GUESS_LIMIT - guessesUsed,
    blur: blurForGuess(guessesUsed),
    clueAvailable: !solved && guessesUsed >= NOTABLE_CLUE_GUESS - 1 && mystery.notable_person != null,
    shareRows,
    shareText: buildShareText({ puzzleNumber: puzzleNumber(dateKey), solved, guessCount: guessesUsed, streak: state.streak, rows: shareRows }),
    streak: state.streak,
  };
}

export function submitGuess(dataset: Dataset, state: CountleState, dateKey: string, fips: string): SubmitResult {
  const mystery = getDailyCounty(dataset, dateKey);
  const guess = dataset.byFips.get(fips);
  if (!guess) return { ok: false, reason: "unknown" };
  const started = startDay(state, dateKey);
  if (started.today!.finished) return { ok: false, reason: "finished" };
  if (started.today!.guesses.includes(fips)) return { ok: false, reason: "duplicate" };
  const result = evaluateGuess(mystery, guess);
  const next = recordGuess(started, fips, { isCorrect: result.isCorrect, dateKey, answerFips: mystery.fips });
  return { ok: true, state: next, result };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- session.test`
Expected: PASS.

- [ ] **Step 5: Run the whole suite + commit**

Run: `npm test`
Expected: PASS (all engine + Plan 1 + new persistence/session).

```bash
git add src/lib/countle/session.ts src/lib/countle/session.test.ts
git commit -m "feat(ui): pure session derivation (buildSession + submitGuess)"
```

---

## Task 4: `useCountle` hook (data + persistence + clock glue)

**Files:**
- Create: `src/components/countle/useCountle.ts`

**Interfaces:**
- Consumes: `buildDataset`, `dateKeyUTC`, `buildSession`, `submitGuess`, `loadStateFrom`, `saveStateTo`, `STORAGE_KEY`, types.
- Produces: `useCountle(): { status: "loading" | "ready" | "error"; session: Session | null; guess: (fips: string) => void; lastError: string | null }`.

- [ ] **Step 1: Implement the hook**

Create `src/components/countle/useCountle.ts`:

```ts
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildDataset, dateKeyUTC, type CountiesPayload, type CountleState, type Dataset,
} from "@/lib/countle";
import { buildSession, submitGuess, type Session } from "@/lib/countle/session";
import { loadStateFrom, saveStateTo } from "@/lib/countle/persistence";

export function useCountle() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [state, setState] = useState<CountleState | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [lastError, setLastError] = useState<string | null>(null);
  const dateKeyRef = useRef<string>(dateKeyUTC(new Date()));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/data/counties.json");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as CountiesPayload;
        if (cancelled) return;
        setDataset(buildDataset(payload));
        setState(loadStateFrom(window.localStorage));
        setStatus("ready");
      } catch (e) {
        if (!cancelled) { setLastError((e as Error).message); setStatus("error"); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const session: Session | null = useMemo(
    () => (dataset && state ? buildSession(dataset, state, dateKeyRef.current) : null),
    [dataset, state]
  );

  const guess = useCallback(
    (fips: string) => {
      if (!dataset || !state) return;
      const r = submitGuess(dataset, state, dateKeyRef.current, fips);
      if (!r.ok) { setLastError(r.reason); return; }
      setLastError(null);
      setState(r.state);
      saveStateTo(window.localStorage, r.state);
    },
    [dataset, state]
  );

  return { status, session, guess, lastError, dataset };
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: compiles with no type errors. (The hook is exercised end-to-end in Task 8.)

- [ ] **Step 3: Commit**

```bash
git add src/components/countle/useCountle.ts
git commit -m "feat(ui): useCountle hook — dataset fetch, localStorage, daily session"
```

---

## Task 5: Guess input with autocomplete

**Files:**
- Create: `src/components/countle/GuessInput.tsx`

**Interfaces:**
- Consumes: `searchCounties`, `Dataset`, `CountyEntry`; `INK`, `PAPER`.
- Produces: `<GuessInput dataset={Dataset} disabled={boolean} onGuess={(fips: string) => void} />`.

- [ ] **Step 1: Implement `GuessInput.tsx`**

```tsx
"use client";
import { useMemo, useState } from "react";
import { searchCounties, type Dataset } from "@/lib/countle";
import { INK } from "./theme";

export default function GuessInput({ dataset, disabled, onGuess }: { dataset: Dataset; disabled: boolean; onGuess: (fips: string) => void; }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const results = useMemo(() => (q.trim() ? searchCounties(dataset, q, 6) : []), [dataset, q]);

  function pick(fips: string) {
    onGuess(fips);
    setQ("");
    setActive(0);
  }

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        value={q}
        disabled={disabled}
        onChange={(e) => { setQ(e.target.value); setActive(0); }}
        onKeyDown={(e) => {
          if (!results.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); pick(results[active].fips); }
        }}
        placeholder="Name a county…"
        style={{
          width: "100%", padding: "14px 20px", fontSize: 17, borderRadius: 999,
          border: "2px solid rgba(36,29,18,0.15)", background: disabled ? "#efe9dc" : "#fffaf0",
          color: INK, outline: "none", fontFamily: "var(--font-sans)",
        }}
      />
      {results.length > 0 && !disabled && (
        <ul style={{ position: "absolute", zIndex: 20, top: 56, left: 0, right: 0, listStyle: "none", margin: 0, padding: 6,
          background: "#fffaf0", borderRadius: 16, boxShadow: "0 10px 30px rgba(40,30,10,0.18)" }}>
          {results.map((c, i) => (
            <li key={c.fips}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(c.fips)}
                style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "10px 14px",
                  borderRadius: 12, border: "none", cursor: "pointer", textAlign: "left",
                  background: i === active ? "rgba(36,29,18,0.06)" : "transparent", color: INK, fontSize: 15 }}>
                <span style={{ fontWeight: 600 }}>{c.name}</span>
                <span style={{ color: "#9b8f78" }}>{c.state_abbr}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: compiles. (Interaction is verified visually in Task 8.)

- [ ] **Step 3: Commit**

```bash
git add src/components/countle/GuessInput.tsx
git commit -m "feat(ui): autocomplete guess input"
```

---

## Task 6: Feedback display — StatBoard, Compass, GuessHistory

**Files:**
- Create: `src/components/countle/StatBoard.tsx`, `src/components/countle/CompassReadout.tsx`, `src/components/countle/GuessHistory.tsx`

**Interfaces:**
- Consumes: `GuessResult`, `StatFeedback`; `CLOSENESS_COLOR`, `STAT_LABELS`, `INK`.
- Produces: `<StatBoard result={GuessResult | null} />`, `<CompassReadout result={GuessResult | null} />`, `<GuessHistory results={GuessResult[]} />`.

- [ ] **Step 1: Implement `StatBoard.tsx`**

```tsx
"use client";
import type { GuessResult, StatFeedback } from "@/lib/countle";
import { CLOSENESS_COLOR, STAT_LABELS, INK } from "./theme";

function arrowFor(f: StatFeedback): string {
  if (f.direction === "equal") return "=";
  const a = f.direction === "up" ? "↑" : "↓";
  return f.magnitude === 2 ? a + a : a;
}

export default function StatBoard({ result }: { result: GuessResult | null }) {
  const byKey = new Map((result?.stats ?? []).map((s) => [s.key, s]));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {STAT_LABELS.map(({ key, label }) => {
        const f = byKey.get(key);
        const color = f ? CLOSENESS_COLOR[f.closeness] : "#d9d2c4";
        return (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 82, fontSize: 13, fontWeight: 600, color: "#5d5343" }}>{label}</span>
            <div style={{ flex: 1, height: 16, background: "#efe9dc", borderRadius: 999, overflow: "hidden" }}>
              {f && (
                <div className="animate-bar-grow" key={`${key}-${f.guessValue}`}
                  style={{ width: `${f.guessValue}%`, height: "100%", background: color, borderRadius: 999 }} />
              )}
            </div>
            <span style={{ width: 34, textAlign: "right", fontFamily: "var(--font-display)", fontSize: 18,
              fontVariantNumeric: "tabular-nums", color: INK }}>{f ? f.guessValue : "—"}</span>
            <span style={{ width: 26, textAlign: "center", fontSize: 16, fontWeight: 800, color }}>{f ? arrowFor(f) : ""}</span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Implement `CompassReadout.tsx`**

```tsx
"use client";
import type { GuessResult } from "@/lib/countle";
import { INK } from "./theme";

export default function CompassReadout({ result }: { result: GuessResult | null }) {
  if (!result || result.isCorrect) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 18, color: INK }}>
      <span style={{ fontSize: 24 }}>{result.compass.arrow}</span>
      <span style={{ fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums" }}>
        {result.distanceMiles.toLocaleString("en-US")} mi
      </span>
      <span style={{ color: "#7c715c" }}>{result.compass.label}</span>
    </div>
  );
}
```

- [ ] **Step 3: Implement `GuessHistory.tsx`**

```tsx
"use client";
import type { GuessResult } from "@/lib/countle";
import { INK } from "./theme";

export default function GuessHistory({ results }: { results: GuessResult[] }) {
  if (results.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {results.map((r, i) => (
        <div key={`${r.guess.fips}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
          <span style={{ flex: 1, fontWeight: 600, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {r.guess.name}, {r.guess.state_abbr}
          </span>
          <span style={{ letterSpacing: 1 }}>{r.shareRow}</span>
          <span style={{ width: 86, textAlign: "right", color: "#7c715c", fontVariantNumeric: "tabular-nums" }}>
            {r.isCorrect ? "🎯" : `${r.distanceMiles.toLocaleString("en-US")} mi ${r.compass.arrow}`}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Verify it builds**

Run: `npm run build`
Expected: compiles. (Visual verification in Task 8.)

- [ ] **Step 5: Commit**

```bash
git add src/components/countle/StatBoard.tsx src/components/countle/CompassReadout.tsx src/components/countle/GuessHistory.tsx
git commit -m "feat(ui): stat board, compass readout, guess history"
```

---

## Task 7: Mystery tile + Header

**Files:**
- Create: `src/components/countle/MysteryTile.tsx`, `src/components/countle/Header.tsx`

**Interfaces:**
- Consumes: `CountyEntry`; `regionColor`, `INK`.
- Produces: `<MysteryTile mystery={CountyEntry} blur={number} finished={boolean} />`, `<Header puzzleNumber={number} streak={number} guessesLeft={number} />`.

- [ ] **Step 1: Implement `MysteryTile.tsx`**

```tsx
"use client";
import type { CountyEntry } from "@/lib/countle";
import { regionColor } from "./theme";

export default function MysteryTile({ mystery, blur, finished }: { mystery: CountyEntry; blur: number; finished: boolean }) {
  const color = regionColor(mystery.region);
  const size = 132;
  if (mystery.hasArt && !finished) {
    return (
      <div style={{ width: size, height: size, borderRadius: 18, overflow: "hidden", boxShadow: "0 6px 18px rgba(40,30,10,0.18)", flexShrink: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/art/${mystery.fips}.png`} alt="mystery county" width={size} height={size}
          style={{ width: "100%", height: "100%", objectFit: "cover", filter: `blur(${blur}px)`, transform: "scale(1.1)", transition: "filter 0.4s ease" }} />
      </div>
    );
  }
  // Art-less (or pre-reveal no-art) → region-color mystery card
  return (
    <div style={{ width: size, height: size, borderRadius: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
      background: `linear-gradient(140deg, ${color}, ${color}aa)`, boxShadow: "0 6px 18px rgba(40,30,10,0.18)" }}>
      <span style={{ fontFamily: "var(--font-display)", fontSize: 46, color: "rgba(255,255,255,0.85)" }}>?</span>
    </div>
  );
}
```

- [ ] **Step 2: Implement `Header.tsx`**

```tsx
"use client";
import { INK } from "./theme";

export default function Header({ puzzleNumber, streak, guessesLeft }: { puzzleNumber: number; streak: number; guessesLeft: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 40, margin: 0, letterSpacing: -0.5, color: INK }}>COUNTLE</h1>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#b98a2e" }}>#{puzzleNumber}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 15, color: INK }}>
        <span title="streak">🔥 {streak}</span>
        <span style={{ color: "#7c715c" }}>{guessesLeft} left</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add src/components/countle/MysteryTile.tsx src/components/countle/Header.tsx
git commit -m "feat(ui): mystery tile (blurred art / region fallback) + header"
```

---

## Task 8: Assemble `CountleApp` + swap the page

**Files:**
- Create: `src/components/countle/CountleApp.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `useCountle`, all components above, `CLUE` via `session.clueAvailable`/`mystery.notable_person`.
- Produces: `<CountleApp />` (default export); `page.tsx` renders it.

- [ ] **Step 1: Implement `CountleApp.tsx`**

```tsx
"use client";
import { useCountle } from "./useCountle";
import Header from "./Header";
import MysteryTile from "./MysteryTile";
import StatBoard from "./StatBoard";
import CompassReadout from "./CompassReadout";
import GuessInput from "./GuessInput";
import GuessHistory from "./GuessHistory";
import { INK } from "./theme";

export default function CountleApp() {
  const { status, session, guess, dataset } = useCountle();

  if (status !== "ready" || !session) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: INK }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 22 }}>
          {status === "error" ? "Couldn't load today's puzzle." : "Loading…"}
        </span>
      </main>
    );
  }

  const { mystery } = session;
  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "28px 18px 80px" }}>
      <Header puzzleNumber={session.puzzleNumber} streak={session.streak} guessesLeft={session.guessesLeft} />

      <div style={{ display: "flex", gap: 16, alignItems: "center", margin: "22px 0 18px" }}>
        <MysteryTile mystery={mystery} blur={session.blur} finished={session.finished} />
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: INK }}>Today&apos;s mystery</div>
          <div style={{ color: "#7c715c", fontSize: 14 }}>Guess {session.guessesUsed + (session.finished ? 0 : 1)} of 6</div>
          {session.clueAvailable && mystery.notable_person && (
            <div style={{ marginTop: 8, fontSize: 13, color: "#b98a2e", maxWidth: 260 }}>
              💡 Clue: linked to <strong>{mystery.notable_person}</strong>
            </div>
          )}
        </div>
      </div>

      <StatBoard result={session.latest} />
      <div style={{ margin: "14px 0 18px" }}><CompassReadout result={session.latest} /></div>

      {!session.finished && dataset && (
        <div style={{ marginBottom: 22 }}>
          <GuessInput dataset={dataset} disabled={session.finished} onGuess={guess} />
        </div>
      )}

      <GuessHistory results={session.guessResults} />
    </main>
  );
}
```

> `dataset` is returned by `useCountle` (Task 4); `GuessInput` renders only once it's present. The win/lose reveal is wired into this component in Task 9 (kept out here so Task 8 builds without `WinReveal`, which doesn't exist yet).

- [ ] **Step 2: Replace `src/app/page.tsx`**

```tsx
import CountleApp from "@/components/countle/CountleApp";

export default function Page() {
  return <CountleApp />;
}
```

- [ ] **Step 3: Build, then verify a full round in the browser**

Run: `npm run build`
Expected: compiles (no type errors, no import of retired components).

Run: `npm run dev` (if not already running). Then drive it with Playwright (controller does this in review if the implementer cannot):
1. Navigate to `http://localhost:3000/`.
2. Confirm the Header (COUNTLE #N), the mystery tile, the empty stat board, and the search box render on warm off-white.
3. Type a county name (e.g. "Cook"), confirm the autocomplete dropdown lists `Cook County / IL`, click it.
4. Confirm the stat bars fill/animate, a compass distance appears, and the guess history shows the row with its emoji squares.
5. Take a screenshot `countle-play.png` for the record.

Expected: a wrong guess produces animated feedback; no console errors (a `/favicon.ico` 404 is fine).

- [ ] **Step 4: Commit**

```bash
git add src/components/countle/CountleApp.tsx src/components/countle/useCountle.ts src/app/page.tsx
git commit -m "feat(ui): assemble CountleApp + replace the home page"
```

---

## Task 9: Win/lose reveal + share

**Files:**
- Create: `src/components/countle/WinReveal.tsx`

**Interfaces:**
- Consumes: `Session` (Task 3); `regionColor`, `INK`.
- Produces: `<WinReveal session={Session} />` (renders only when `session.finished`).

- [ ] **Step 1: Implement `WinReveal.tsx`**

```tsx
"use client";
import { useState } from "react";
import type { Session } from "@/lib/countle/session";
import { regionColor, INK } from "./theme";

export default function WinReveal({ session }: { session: Session }) {
  const { mystery, solved, guessesUsed } = session;
  const color = regionColor(mystery.region);
  const [copied, setCopied] = useState(false);

  async function share() {
    try {
      await navigator.clipboard.writeText(session.shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="animate-modal-in" style={{ marginTop: 26, borderRadius: 22, overflow: "hidden",
      boxShadow: "0 12px 40px rgba(40,30,10,0.22)", background: "#fffaf0" }}>
      <div className="animate-wash-in" style={{ position: "relative", height: 200,
        background: mystery.hasArt ? "#000" : `linear-gradient(140deg, ${color}, ${color}cc)` }}>
        {mystery.hasArt && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/art/${mystery.fips}.png`} alt={mystery.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to top, ${color}ee, transparent 70%)` }} />
        <div style={{ position: "absolute", left: 18, bottom: 14, right: 18 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "#fff", lineHeight: 1.05, textShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>
            {mystery.name}
          </div>
          <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 14 }}>
            {mystery.county_seat ? `${mystery.county_seat} · ` : ""}{mystery.state_name}
          </div>
        </div>
      </div>

      <div style={{ padding: "18px 20px 22px" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: INK }}>
          {solved ? `Solved in ${guessesUsed}! 🔥 ${session.streak}` : `The answer was ${mystery.name}`}
        </div>
        {mystery.flavor && <div style={{ fontStyle: "italic", color: "#8a7d65", marginTop: 6, fontSize: 14 }}>“{mystery.flavor}”</div>}
        <button onClick={share}
          style={{ marginTop: 16, width: "100%", padding: "14px", borderRadius: 999, border: "none", cursor: "pointer",
            background: color, color: "#fff", fontFamily: "var(--font-display)", fontSize: 17 }}>
          {copied ? "Copied!" : "Share"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire `WinReveal` into `CountleApp`**

In `src/components/countle/CountleApp.tsx`, add `import WinReveal from "./WinReveal";` alongside the other component imports, and render it as the last child of `<main>`, immediately after `<GuessHistory ... />`:

```tsx
      <GuessHistory results={session.guessResults} />

      {session.finished && <WinReveal session={session} />}
    </main>
```

- [ ] **Step 3: Build, then verify a win end-to-end**

Run: `npm run build`
Expected: compiles.

Run: `npm run dev`. Drive with Playwright (controller in review if needed):
1. Navigate to `http://localhost:3000/`.
2. Determine today's answer in devtools: `JSON` is loaded client-side — instead, force a win by guessing the daily county. The simplest deterministic check: in the browser console run `localStorage.clear()`, reload, then guess counties until solved OR (faster) temporarily guess the known daily fips. For the record, guess 5–6 counties to reach the loss reveal if you don't know the answer.
3. Confirm: on finish, the reveal card appears (full art with the region gradient, OR the region-color fallback when art-less), the county name + flavor show, and **Share** copies text.
4. Verify the copied text matches the `Countle #N  X/6  🔥S` + emoji grid format (paste into the page or assert via `navigator.clipboard.readText()` in console).
5. Screenshot `countle-win.png`.

Expected: reveal renders; Share writes the spoiler-free grid to the clipboard.

- [ ] **Step 4: Commit**

```bash
git add src/components/countle/WinReveal.tsx src/components/countle/CountleApp.tsx
git commit -m "feat(ui): win/lose reveal card + share-to-clipboard"
```

---

## Self-Review

**Spec coverage (§4–§7, MVP scope §9 minus map/stats which are Plan 4):**
- §4 per-stat feedback display → Task 6 `StatBoard` (bars colored by closeness, arrows w/ magnitude). ✓
- §4 geographic feedback → Task 6 `CompassReadout` + Task 6 history. ✓
- §4 progressive blur → Task 7 `MysteryTile` (`session.blur`). ✓
- §4 notable-person clue at guess 5 → Task 3 `session.clueAvailable` + Task 8 render (null-safe). ✓
- §3 daily selection / once-per-day → engine + `useCountle` (single `dateKey`, persisted finish blocks re-play). ✓
- §5 share grid → Task 3 `session.shareText` + Task 9 Share button (clipboard). ✓
- §6 streak → Task 7 Header + Task 9 reveal. (Two-layer map + stats modal = **Plan 4**, explicitly out of scope here.)
- §7 Bold Pop visuals → Task 1 theme/font/animations; inline-styled components; region wash on win; universal closeness colors. ✓
- §8 persistence `countle-v1` → Task 2. ✓

**Placeholder scan:** none — every component has complete code; the hook returns `dataset` (Task 4), `CountleApp` threads it into `GuessInput` (Task 8), and `WinReveal` is created then wired into `CountleApp` in Task 9.

**Type consistency:** `Session`/`SubmitResult` defined in Task 3 and consumed by the hook (Task 4) and components (Tasks 6–9); `GuessResult`/`StatFeedback`/`CountyEntry`/`Dataset` come from the engine barrel; `theme.ts` tokens (`INK`, `CLOSENESS_COLOR`, `regionColor`, `STAT_LABELS`) used consistently.

## Notes / deferred to Plan 4 (the collection layer)
- **Two-layer US map** (region-color mosaic of solved counties, grey encountered) — reuses the existing `src/components/USMap.tsx`, recolored.
- **Stats modal** (guess distribution, win %, current/max streak) — the engine already tracks all of it in `CountleState`.
- **"Next puzzle in HH:MM" countdown**, header stats/share buttons, and the share **image** (vs text) are Plan 4 polish.
- Art hosting: `public/art/` is gitignored (large); fine for local/dev. Production needs a CDN or committing the ~200 answer-pool PNGs — revisit in Plan 4.
```
