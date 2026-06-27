# County Games Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the **County Games** hub at `/` — a Bold Pop landing page with three status-aware game cards — and relocate Countle from `/` to `/countle`.

**Architecture:** One pure, vitest-TDD'd status module (`src/lib/hub/status.ts`) that reads each game's existing localStorage via its own loader and maps `today`/`streak` into a uniform card model; presentational hub components (`HubApp`, `GameCard`, `HubLink`); and the route relocation + a back-link added to each game. Static + localStorage, no backend.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4 (inline styles), vitest. Reuses each game's persistence loaders + `dateKeyUTC` + the Bold Pop theme + Next `<Link>`.

## Global Constraints

- **Routes:** hub `<HubApp/>` at `/`; Countle `<CountleApp/>` moves to `/countle`; `/connections` and `/warmer` unchanged.
- **Status model:** `suiteStatus(storage, dateKey)` returns one `GameStatus` per game in order **countle, connections, warmer**. `status ∈ "new" | "playing" | "done"`. A game's `today` counts only when `today.dateKey === dateKey` (a stale day ⇒ `new`).
- **Per-game `done`/`resultLabel`:** Countle done = `today.finished` → `today.solved ? "solved in "+guesses.length : "out of guesses"`. Connections done = `today.finished` → `today.won ? "solved" : "missed"`. Warmer done = `today.solved || today.gaveUp` → `today.solved ? "found in "+guesses.length : "gave up"`. `playing` = same-day, not done, with activity (`guesses`/`submissions` length > 0). `resultLabel` is null unless `done`.
- **Accents (exact):** countle `#16a34a` · connections `#a96fc0` · warmer `#dc2626`.
- **Loaders (read, don't re-parse keys):** `loadStateFrom` (`../countle/persistence`, key `countle-v1`), `loadConnectionsState` (`../connections/persistence`, `connections-v1`), `loadWarmerState` (`../warmer/persistence`, `warmer-v1`). `StorageLike` from `../countle/persistence`.
- **SSR-safe:** `HubApp`'s initial render must be the deterministic all-`new` status (no `window` access during render); the real localStorage status is read in a client `useEffect`. No hydration mismatch.
- **Imports:** the pure module (`src/lib/hub/`) uses RELATIVE imports to `../countle`/`../connections`/`../warmer` (vitest has no `@/` alias). Components use `@/` aliases.
- Reuse `INK` from `@/components/countle/theme`; use Next `<Link>` for all navigation. No backend, no new data.

---

## File Structure
- `src/lib/hub/status.ts` — `GameId`, `PlayStatus`, `GameStatus`, `suiteStatus`. Pure, tested.
- `src/components/hub/GameCard.tsx` — one game card (link + motif + status row).
- `src/components/hub/HubApp.tsx` — orchestrator (reads status in an effect).
- `src/components/hub/HubLink.tsx` — the "‹ County Games" back-link.
- `src/app/page.tsx` — **modify**: render `<HubApp/>`.
- `src/app/countle/page.tsx` — **create**: render `<CountleApp/>`.
- `src/components/{countle,connections,warmer}/{Countle,Connections,Warmer}App.tsx` — **modify**: add `<HubLink/>` as the first child of `<main>`.

---

## Task 1: Status model (`src/lib/hub/status.ts`)

**Files:**
- Create: `src/lib/hub/status.ts`
- Test: `src/lib/hub/status.test.ts`

**Interfaces:**
- Consumes: `loadStateFrom`, `StorageLike` from `../countle/persistence`; `loadConnectionsState` from `../connections/persistence`; `loadWarmerState` from `../warmer/persistence`.
- Produces: `type GameId`, `type PlayStatus`, `interface GameStatus`, `suiteStatus(storage: StorageLike, dateKey: string): GameStatus[]`.

- [ ] **Step 1: Write the failing test**

`src/lib/hub/status.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { suiteStatus } from "./status";
import type { StorageLike } from "../countle/persistence";

function mem(entries: Record<string, unknown> = {}): StorageLike {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(entries)) map.set(k, JSON.stringify(v));
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); } };
}
const DATE = "2026-06-27";

describe("suiteStatus", () => {
  it("empty storage → all three games 'new', streak 0, no result", () => {
    const s = suiteStatus(mem(), DATE);
    expect(s.map((g) => g.id)).toEqual(["countle", "connections", "warmer"]);
    expect(s.every((g) => g.status === "new" && g.streak === 0 && g.resultLabel === null)).toBe(true);
    expect(s[0].href).toBe("/countle");
    expect(s[0].accent).toBe("#16a34a");
  });

  it("Countle finished+solved today → done with 'solved in N' + streak", () => {
    const storage = mem({
      "countle-v1": { schemaVersion: 1, streak: 4, today: { dateKey: DATE, guesses: ["1", "2", "3"], solved: true, finished: true } },
    });
    const c = suiteStatus(storage, DATE)[0];
    expect(c.status).toBe("done");
    expect(c.resultLabel).toBe("solved in 3");
    expect(c.streak).toBe(4);
  });

  it("Connections in progress today → playing; lost → 'missed'", () => {
    const playing = suiteStatus(mem({
      "connections-v1": { schemaVersion: 1, streak: 0, today: { dateKey: DATE, submissions: [["a","b","c","d"]], solvedColors: [], mistakes: 1, finished: false, won: false } },
    }), DATE)[1];
    expect(playing.status).toBe("playing");
    expect(playing.resultLabel).toBeNull();

    const lost = suiteStatus(mem({
      "connections-v1": { schemaVersion: 1, streak: 0, today: { dateKey: DATE, submissions: [], solvedColors: [], mistakes: 4, finished: true, won: false } },
    }), DATE)[1];
    expect(lost.status).toBe("done");
    expect(lost.resultLabel).toBe("missed");
  });

  it("Warmer gave up → done 'gave up'; solved → 'found in N'", () => {
    const gaveUp = suiteStatus(mem({
      "warmer-v1": { schemaVersion: 1, streak: 0, today: { dateKey: DATE, guesses: ["1","2"], solved: false, gaveUp: true } },
    }), DATE)[2];
    expect(gaveUp.status).toBe("done");
    expect(gaveUp.resultLabel).toBe("gave up");

    const solved = suiteStatus(mem({
      "warmer-v1": { schemaVersion: 1, streak: 2, today: { dateKey: DATE, guesses: ["1","2","3","4","5"], solved: true, gaveUp: false } },
    }), DATE)[2];
    expect(solved.resultLabel).toBe("found in 5");
    expect(solved.streak).toBe(2);
  });

  it("a stale day (today from a different date) is treated as 'new'", () => {
    const c = suiteStatus(mem({
      "countle-v1": { schemaVersion: 1, streak: 9, today: { dateKey: "2026-06-26", guesses: ["1"], solved: true, finished: true } },
    }), DATE)[0];
    expect(c.status).toBe("new");
    expect(c.resultLabel).toBeNull();
    expect(c.streak).toBe(9); // streak still surfaces
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/hub/status.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `status.ts`**

`src/lib/hub/status.ts`:
```ts
import { loadStateFrom, type StorageLike } from "../countle/persistence";
import { loadConnectionsState } from "../connections/persistence";
import { loadWarmerState } from "../warmer/persistence";

export type GameId = "countle" | "connections" | "warmer";
export type PlayStatus = "new" | "playing" | "done";

export interface GameStatus {
  id: GameId;
  name: string;
  tagline: string;
  href: string;
  accent: string;
  streak: number;
  status: PlayStatus;
  resultLabel: string | null;
}

const META: Record<GameId, { name: string; tagline: string; href: string; accent: string }> = {
  countle: { name: "Countle", tagline: "Guess the mystery county from its six stats", href: "/countle", accent: "#16a34a" },
  connections: { name: "County Connections", tagline: "Find the four hidden groups of sixteen", href: "/connections", accent: "#a96fc0" },
  warmer: { name: "Warmer", tagline: "Hot or cold — find today's county on the map", href: "/warmer", accent: "#dc2626" },
};

export function suiteStatus(storage: StorageLike, dateKey: string): GameStatus[] {
  const countle = loadStateFrom(storage);
  const connections = loadConnectionsState(storage);
  const warmer = loadWarmerState(storage);

  const cToday = countle.today && countle.today.dateKey === dateKey ? countle.today : null;
  const countleCard: GameStatus = {
    id: "countle", ...META.countle, streak: countle.streak,
    status: cToday ? (cToday.finished ? "done" : cToday.guesses.length > 0 ? "playing" : "new") : "new",
    resultLabel: cToday && cToday.finished ? (cToday.solved ? `solved in ${cToday.guesses.length}` : "out of guesses") : null,
  };

  const xToday = connections.today && connections.today.dateKey === dateKey ? connections.today : null;
  const connectionsCard: GameStatus = {
    id: "connections", ...META.connections, streak: connections.streak,
    status: xToday ? (xToday.finished ? "done" : xToday.submissions.length > 0 ? "playing" : "new") : "new",
    resultLabel: xToday && xToday.finished ? (xToday.won ? "solved" : "missed") : null,
  };

  const wToday = warmer.today && warmer.today.dateKey === dateKey ? warmer.today : null;
  const warmerDone = wToday ? wToday.solved || wToday.gaveUp : false;
  const warmerCard: GameStatus = {
    id: "warmer", ...META.warmer, streak: warmer.streak,
    status: wToday ? (warmerDone ? "done" : wToday.guesses.length > 0 ? "playing" : "new") : "new",
    resultLabel: wToday && warmerDone ? (wToday.solved ? `found in ${wToday.guesses.length}` : "gave up") : null,
  };

  return [countleCard, connectionsCard, warmerCard];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/hub/status.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/hub/status.ts src/lib/hub/status.test.ts
git commit -m "feat(hub): suiteStatus — per-game today-status + streak from localStorage"
```

---

## Task 2: Hub UI (`GameCard`, `HubApp`, `HubLink`)

**Files:**
- Create: `src/components/hub/GameCard.tsx`, `src/components/hub/HubApp.tsx`, `src/components/hub/HubLink.tsx`

**Interfaces:**
- Consumes: `GameStatus`, `suiteStatus` from `@/lib/hub/status`; `dateKeyUTC` from `@/lib/countle`; `INK` from `@/components/countle/theme`; Next `<Link>`.
- Produces: `GameCard({ g }: { g: GameStatus })`; `HubApp` (default); `HubLink` (default).

**Verification:** `npx tsc --noEmit`.

- [ ] **Step 1: Create `GameCard.tsx`**
```tsx
"use client";
import Link from "next/link";
import type { GameStatus, GameId } from "@/lib/hub/status";
import { INK } from "@/components/countle/theme";

function Motif({ id }: { id: GameId }) {
  if (id === "connections") {
    return (
      <div style={{ display: "flex", gap: 4 }}>
        {["#f2c14e", "#6fae53", "#5a8fd6", "#a96fc0"].map((c) => (
          <span key={c} style={{ width: 14, height: 14, borderRadius: 3, background: c, display: "inline-block" }} />
        ))}
      </div>
    );
  }
  if (id === "warmer") {
    return (
      <div style={{ display: "flex", gap: 4 }}>
        {["#93b4d6", "#fbbf24", "#f97316", "#dc2626"].map((c) => (
          <span key={c} style={{ width: 14, height: 14, borderRadius: 3, background: c, display: "inline-block" }} />
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "flex-end" }}>
      {[10, 16, 8, 14, 12, 18].map((h, i) => (
        <span key={i} style={{ width: 8, height: h, borderRadius: 2, background: "#16a34a", display: "inline-block" }} />
      ))}
    </div>
  );
}

const CTA: Record<GameStatus["status"], string> = { new: "Play", playing: "Continue", done: "" };

export default function GameCard({ g }: { g: GameStatus }) {
  return (
    <Link href={g.href} style={{ textDecoration: "none", color: INK }}>
      <div style={{
        background: "#fffaf0", borderRadius: 18, border: "2px solid rgba(36,29,18,0.1)", borderLeft: `8px solid ${g.accent}`,
        padding: "18px 20px", boxShadow: "0 8px 24px rgba(40,30,10,0.06)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 26, margin: 0 }}>{g.name}</h2>
          <Motif id={g.id} />
        </div>
        <p style={{ color: "#7c715c", fontSize: 14, margin: "6px 0 12px" }}>{g.tagline}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 14 }}>
          <span title="streak">🔥 {g.streak}</span>
          <span style={{ marginLeft: "auto", fontWeight: 800, color: g.status === "done" ? "#15803d" : g.accent }}>
            {g.status === "done" ? `✓ ${g.resultLabel}` : CTA[g.status]}
          </span>
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Create `HubApp.tsx`**
```tsx
"use client";
import { useEffect, useState } from "react";
import { suiteStatus, type GameStatus } from "@/lib/hub/status";
import { dateKeyUTC } from "@/lib/countle";
import GameCard from "./GameCard";
import { INK } from "@/components/countle/theme";

// SSR-safe initial render: deterministic all-"new" status (no window access).
const INITIAL: GameStatus[] = suiteStatus({ getItem: () => null, setItem: () => {} }, "");

export default function HubApp() {
  const [games, setGames] = useState<GameStatus[]>(INITIAL);
  useEffect(() => {
    setGames(suiteStatus(window.localStorage, dateKeyUTC(new Date())));
  }, []);

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "40px 18px 80px" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 44, margin: 0, letterSpacing: -1, color: INK }}>COUNTY GAMES</h1>
      <p style={{ color: "#7c715c", fontSize: 16, margin: "6px 0 28px" }}>Three daily games on every US county.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {games.map((g) => <GameCard key={g.id} g={g} />)}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Create `HubLink.tsx`**
```tsx
"use client";
import Link from "next/link";

export default function HubLink() {
  return (
    <Link href="/" style={{ display: "inline-block", marginBottom: 12, fontSize: 13, color: "#9b8f78", textDecoration: "none" }}>
      ‹ County Games
    </Link>
  );
}
```

- [ ] **Step 4: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors. (`dateKeyUTC` is exported from `@/lib/countle` per the existing `useCountle.ts`; `GameStatus`/`GameId`/`suiteStatus` from `@/lib/hub/status`.)
```bash
git add src/components/hub/GameCard.tsx src/components/hub/HubApp.tsx src/components/hub/HubLink.tsx
git commit -m "feat(hub): GameCard, HubApp landing, HubLink back-link"
```

---

## Task 3: Route relocation + back-links + verification

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/app/countle/page.tsx`
- Modify: `src/components/countle/CountleApp.tsx`, `src/components/connections/ConnectionsApp.tsx`, `src/components/warmer/WarmerApp.tsx` (add `<HubLink/>`)

**Interfaces:**
- Consumes: `HubApp` from `@/components/hub/HubApp`; `CountleApp` from `@/components/countle/CountleApp`; `HubLink` from `@/components/hub/HubLink`.

- [ ] **Step 1: Point `/` at the hub**

Replace `src/app/page.tsx` entirely with:
```tsx
import HubApp from "@/components/hub/HubApp";

export default function Page() {
  return <HubApp />;
}
```

- [ ] **Step 2: Create Countle's new route**

Create `src/app/countle/page.tsx`:
```tsx
import CountleApp from "@/components/countle/CountleApp";

export default function Page() {
  return <CountleApp />;
}
```

- [ ] **Step 3: Add the back-link to each game**

In each of `CountleApp.tsx`, `ConnectionsApp.tsx`, `WarmerApp.tsx`:
1. Add the import at the top (with the other component imports):
```tsx
import HubLink from "@/components/hub/HubLink";
```
2. Insert `<HubLink />` as the **first child** of the success-path `<main ...>` element (the one that renders the game, i.e. immediately before the `<Header ... />`). For example, in `CountleApp.tsx` the success return becomes:
```tsx
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "28px 18px 80px" }}>
      <HubLink />
      <Header puzzleNumber={session.puzzleNumber} streak={session.streak} guessesLeft={session.guessesLeft}
        onOpenStats={() => setOverlay("stats")} onOpenMap={() => setOverlay("map")} />
      {/* …rest unchanged… */}
```
Do the equivalent in `ConnectionsApp.tsx` (before its `<Header .../>`) and `WarmerApp.tsx` (before its `<Header .../>`). Leave the loading/error `<main>` branch unchanged.

- [ ] **Step 4: Typecheck + production build**

Run: `npx tsc --noEmit` → no errors.
Run: `npm run build` → succeeds; the route table shows `/` (hub), `/countle`, `/connections`, `/warmer`.

- [ ] **Step 5: Commit**
```bash
git add src/app/page.tsx src/app/countle/page.tsx src/components/countle/CountleApp.tsx src/components/connections/ConnectionsApp.tsx src/components/warmer/WarmerApp.tsx
git commit -m "feat(hub): hub at /, Countle → /countle, back-link on each game"
```

- [ ] **Step 6: Playwright visual verification (controller-run)**

Start the dev server. Navigate to `http://localhost:3000/` and confirm: the **COUNTY GAMES** wordmark + three cards (Countle/Connections/Warmer) each with tagline, motif, `🔥 0`, and a `Play` CTA. Click the Countle card → lands on `/countle` and Countle plays. Play one game to completion, return to `/` → that card now shows `✓ <result>` + updated streak. Click the "‹ County Games" back-link from a game → returns to `/`. Confirm `/connections` and `/warmer` still load. Console has no errors. Save screenshots of the hub (fresh + with one game done) for review.

---

## Self-Review (author)

- **Spec coverage:** hub at `/` + Countle→`/countle` (Task 3) · three status cards with streak + Play/Continue/✓ (Tasks 1–2) · pure tested `suiteStatus` reading each game's loader with the exact per-game `done`/`resultLabel`/stale-day mapping (Task 1) · accents `#16a34a`/`#a96fc0`/`#dc2626` (Task 1 META) · per-game back-link (Tasks 2–3) · SSR-safe all-`new` initial render (Task 2 `INITIAL` + effect). All §6 MVP scope covered; no backend/data.
- **Type consistency:** `GameStatus`/`GameId`/`PlayStatus` defined in Task 1 are consumed unchanged by `GameCard`/`HubApp` (Task 2). `suiteStatus` signature `(StorageLike, string) → GameStatus[]` is used by both the test (Task 1) and `HubApp` (Task 2).
- **Import discipline:** the pure module uses relative `../countle`/`../connections`/`../warmer` imports (vitest, no `@/`); components use `@/`. The loaders all accept `StorageLike` (confirmed: each game's persistence module).
- **No link rot:** a repo-wide grep found no existing `href`/`router`/`window.location` navigation in `src`, so relocating Countle breaks nothing; all navigation introduced here uses Next `<Link>`.
```
