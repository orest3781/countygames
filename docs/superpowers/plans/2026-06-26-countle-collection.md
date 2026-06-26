# Countle Collection Layer Implementation Plan (Plan 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the collection + retention layer to the playable Countle game: a **county-level choropleth map** (the saturated region-color mosaic — solved counties pop in their region color, encountered ones dim, the rest faint) and a **Wordle-style stats modal** (guess distribution, win %, current/max streak, per-region progress), both opened from header buttons.

**Architecture:** Pure, vitest-TDD'd selectors (`src/lib/countle/collection.ts`) derive map status / region progress / stats from `(dataset, CountleState)`. A `CountyMap` SVG choropleth lazy-loads a pre-projected US-counties TopoJSON (`us-atlas`) and colors each of ~3,144 county paths by status. A `StatsModal` renders the distribution + streaks. A light `Overlay` shell hosts both; `Header` gets 📊/🗺️ buttons; `CountleApp` owns the open/close state and now exposes the raw `state` from `useCountle`.

**Tech Stack:** Next 16 + React 19 + Tailwind 4; the Plan 2 engine; `vitest` (already configured). New deps: `d3-geo`, `topojson-client` (runtime), `@types/d3-geo`, `@types/topojson-client`, `us-atlas` (dev — ships the TopoJSON data file).

## Global Constraints

- **Build on the engine + Plan 3 UI.** Consume `CountleState`, `Dataset`, `CountyEntry` from `@/lib/countle`; `regionColor`, `INK`, `PAPER` from `@/components/countle/theme`.
- **Pure selectors stay pure** (`collection.ts`): no React/DOM/fs; node-testable. Components are `"use client"`, inline-styled, default exports.
- **Color rules (spec §6/§7):** solved county → its **region color** (`regionColor(entry.region)`); encountered-but-unsolved → light grey `#d9d2c4`; untouched → faint paper `#efe9dc`. State borders → `#fffaf0` hairlines for legibility. The map is the ONLY place the full county set is region-tinted; stat-feedback colors are unaffected.
- **Map data is lazy.** The ~600 KB `counties-albers-10m.json` is served from `public/data/` and fetched only when the map overlay opens — never in the initial bundle.
- **County id → FIPS:** us-atlas county feature `id` may drop leading zeros — always `String(feature.id).padStart(5, "0")`.
- **No backend.** Everything derives from the existing localStorage `CountleState`.
- **Playable game must keep working** — the daily round, win/lose, share are untouched; this only adds two overlays + two header buttons.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/countle/collection.ts` | Pure selectors: `countyStatus`, `regionProgress`, `statsSummary` + their types. |
| `src/lib/countle/collection.test.ts` | Vitest unit tests. |
| `src/components/countle/useCountle.ts` | MODIFY — also return `state: CountleState \| null`. |
| `public/data/counties-albers-10m.json` | Pre-projected US counties+states TopoJSON (copied from `us-atlas`). |
| `src/components/countle/Overlay.tsx` | Light modal shell (backdrop + centered card + close). |
| `src/components/countle/CountyMap.tsx` | The choropleth: lazy-load topojson, color paths by status, region-progress readout. |
| `src/components/countle/StatsModal.tsx` | Distribution bars + win% + streaks + region progress. |
| `src/components/countle/Header.tsx` | MODIFY — add 📊 and 🗺️ buttons (new optional props). |
| `src/components/countle/CountleApp.tsx` | MODIFY — overlay open/close state, pass `state`, render overlays. |

### Selector shapes (consumed by the components)
```ts
export type CountyStatus = "solved" | "encountered" | "untouched";
export interface RegionProgress { region: string; solved: number; total: number; }
export interface StatsSummary {
  played: number; wins: number; winPct: number;
  distribution: number[];   // length 6 (index i = solved in i+1)
  maxBucket: number;        // largest distribution value (for bar scaling; >=1)
  currentStreak: number; maxStreak: number;
}
```

---

## Task 1: Pure collection selectors + expose `state`

**Files:**
- Create: `src/lib/countle/collection.ts`, `src/lib/countle/collection.test.ts`
- Modify: `src/components/countle/useCountle.ts` (return `state`)

**Interfaces:**
- Consumes: `CountleState`, `Dataset` (engine).
- Produces: `countyStatus(state, fips): CountyStatus`, `regionProgress(dataset, state): RegionProgress[]`, `statsSummary(state): StatsSummary`; `useCountle()` now also returns `state`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/countle/collection.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { countyStatus, regionProgress, statsSummary } from "./collection";
import { buildDataset } from "./data";
import { initialState } from "./state";
import type { CountiesPayload, CountyEntry, StatKey, CountleState } from "./types";

function county(fips: string, region: string, pool: boolean): CountyEntry {
  const z: Record<StatKey, number> = { wealth: 1, health: 1, people: 1, land: 1, danger: 1, education: 1 };
  return { fips, name: fips, state_abbr: "XX", state_name: "X", region, county_seat: null, lat: 0, lng: 0,
    stats: z, display: { wealth: "", health: "", people: "", land: "", danger: "", education: "" },
    rarity: "common", hasArt: false, isAnswerPool: pool, notable_person: null, notable_person_desc: null, flavor: null };
}
const payload: CountiesPayload = { schemaVersion: 1, generatedAt: "x", count: 4, answerPoolCount: 3,
  counties: {
    "06037": county("06037", "Pacific", true),
    "06075": county("06075", "Pacific", true),
    "04013": county("04013", "Southwest", true),
    "99999": county("99999", "Pacific", false),
  } };
const ds = buildDataset(payload);

describe("countyStatus", () => {
  const s: CountleState = { ...initialState(), solvedCounties: ["06037"], encounteredCounties: ["06037", "17031"] };
  it("solved > encountered > untouched", () => {
    expect(countyStatus(s, "06037")).toBe("solved");
    expect(countyStatus(s, "17031")).toBe("encountered");
    expect(countyStatus(s, "99999")).toBe("untouched");
  });
});

describe("regionProgress", () => {
  it("counts solved answer-pool counties per region over the region total", () => {
    const s: CountleState = { ...initialState(), solvedCounties: ["06037"] };
    const rp = regionProgress(ds, s);
    const pacific = rp.find((r) => r.region === "Pacific")!;
    const sw = rp.find((r) => r.region === "Southwest")!;
    expect(pacific).toEqual({ region: "Pacific", solved: 1, total: 2 }); // 06037 solved of {06037,06075}; 99999 not in pool
    expect(sw).toEqual({ region: "Southwest", solved: 0, total: 1 });
  });
});

describe("statsSummary", () => {
  it("computes wins, winPct, maxBucket from distribution + fails", () => {
    const s: CountleState = { ...initialState(), gamesPlayed: 5, fails: 1, guessDistribution: [1, 0, 2, 1, 0, 0], streak: 2, maxStreak: 3 };
    const sum = statsSummary(s);
    expect(sum.played).toBe(5);
    expect(sum.wins).toBe(4);           // 1+0+2+1
    expect(sum.winPct).toBe(80);        // 4/5
    expect(sum.maxBucket).toBe(2);
    expect(sum.currentStreak).toBe(2);
    expect(sum.maxStreak).toBe(3);
  });
  it("winPct is 0 when nothing played", () => {
    expect(statsSummary(initialState()).winPct).toBe(0);
    expect(statsSummary(initialState()).maxBucket).toBe(1); // never 0 (avoids divide-by-zero in bars)
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- collection.test`
Expected: FAIL — cannot resolve `./collection`.

- [ ] **Step 3: Implement `collection.ts`**

```ts
import type { CountleState, Dataset } from "./types";

export type CountyStatus = "solved" | "encountered" | "untouched";
export interface RegionProgress { region: string; solved: number; total: number; }
export interface StatsSummary {
  played: number; wins: number; winPct: number;
  distribution: number[]; maxBucket: number;
  currentStreak: number; maxStreak: number;
}

export function countyStatus(state: CountleState, fips: string): CountyStatus {
  if (state.solvedCounties.includes(fips)) return "solved";
  if (state.encounteredCounties.includes(fips)) return "encountered";
  return "untouched";
}

export function regionProgress(dataset: Dataset, state: CountleState): RegionProgress[] {
  const solved = new Set(state.solvedCounties);
  const totals = new Map<string, number>();
  const got = new Map<string, number>();
  for (const c of dataset.all) {
    if (!c.isAnswerPool) continue;
    totals.set(c.region, (totals.get(c.region) ?? 0) + 1);
    if (solved.has(c.fips)) got.set(c.region, (got.get(c.region) ?? 0) + 1);
  }
  return [...totals.entries()]
    .map(([region, total]) => ({ region, total, solved: got.get(region) ?? 0 }))
    .sort((a, b) => b.solved - a.solved || a.region.localeCompare(b.region));
}

export function statsSummary(state: CountleState): StatsSummary {
  const wins = state.guessDistribution.reduce((a, b) => a + b, 0);
  const played = state.gamesPlayed;
  return {
    played,
    wins,
    winPct: played > 0 ? Math.round((wins / played) * 100) : 0,
    distribution: state.guessDistribution,
    maxBucket: Math.max(1, ...state.guessDistribution),
    currentStreak: state.streak,
    maxStreak: state.maxStreak,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- collection.test`
Expected: PASS.

- [ ] **Step 5: Expose `state` from `useCountle`**

In `src/components/countle/useCountle.ts`, change the return object to also include `state`:

```ts
  return { status, session, guess, lastError, dataset, state };
```

(`state` is already in scope — it's the `useState<CountleState | null>` value.)

- [ ] **Step 6: Run the whole suite + commit**

Run: `npm test`
Expected: PASS (all prior + new collection tests). Then `npm run build` to confirm the hook change compiles.

```bash
git add src/lib/countle/collection.ts src/lib/countle/collection.test.ts src/components/countle/useCountle.ts
git commit -m "feat(collection): pure selectors (status/region progress/stats) + expose state"
```

---

## Task 2: Geo dependencies + the counties TopoJSON

**Files:**
- Modify: `package.json` (deps)
- Create: `public/data/counties-albers-10m.json` (copied from `us-atlas`)

**Interfaces:**
- Produces: `d3-geo` + `topojson-client` available at runtime with types; `public/data/counties-albers-10m.json` served statically.

- [ ] **Step 1: Install the geo libraries + data package**

Run: `npm install d3-geo@^3 topojson-client@^3`
Run: `npm install -D @types/d3-geo @types/topojson-client us-atlas@^3`
Expected: all install without peer-dependency errors.

- [ ] **Step 2: Copy the pre-projected counties TopoJSON into `public/data/`**

Run (Git Bash):
```bash
cp node_modules/us-atlas/counties-albers-10m.json public/data/counties-albers-10m.json
ls -la public/data/counties-albers-10m.json
```
Expected: the file exists (~600 KB). It contains `objects.counties` and `objects.states`, pre-projected to a 975×610 viewport.

- [ ] **Step 3: Sanity-check the file shape**

Run:
```bash
node -e "const t=require('./public/data/counties-albers-10m.json'); console.log('objects:', Object.keys(t.objects)); const g=t.objects.counties.geometries[0]; console.log('sample county id:', g.id, '(', typeof g.id, ')');"
```
Expected: `objects: [ 'counties', 'states', 'nation' ]` (or similar incl. counties + states), and a sample county id that is a FIPS-like string/number (confirming we must `padStart(5,"0")`).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json public/data/counties-albers-10m.json
git commit -m "feat(collection): add d3-geo/topojson + counties TopoJSON asset"
```

---

## Task 3: `CountyMap` choropleth

**Files:**
- Create: `src/components/countle/CountyMap.tsx`

**Interfaces:**
- Consumes: `Dataset`, `CountleState`; `regionProgress` (Task 1); `regionColor`, `INK` (theme); `d3-geo` `geoPath`; `topojson-client` `feature`, `mesh`. (The per-county solved/encountered check is inlined as `Set`s for performance — the pure `countyStatus` logic, tested in Task 1, mirrors it.)
- Produces: `<CountyMap dataset={Dataset} state={CountleState} />`.

- [ ] **Step 1: Implement `CountyMap.tsx`**

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { Dataset, CountleState } from "@/lib/countle";
import { regionProgress } from "@/lib/countle/collection";
import { regionColor, INK } from "./theme";

const ENCOUNTERED = "#d9d2c4";
const UNTOUCHED = "#efe9dc";

export default function CountyMap({ dataset, state }: { dataset: Dataset; state: CountleState }) {
  const [topo, setTopo] = useState<any | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/counties-albers-10m.json")
      .then((r) => r.json())
      .then((t) => { if (!cancelled) setTopo(t); })
      .catch(() => { /* leave null → loading text */ });
    return () => { cancelled = true; };
  }, []);

  const rendered = useMemo(() => {
    if (!topo) return null;
    const path = geoPath();
    const counties = (feature(topo, topo.objects.counties) as any).features as any[];
    const statesMesh = path(mesh(topo, topo.objects.states, (a: any, b: any) => a !== b) as any) ?? "";
    const solved = new Set(state.solvedCounties);
    const encountered = new Set(state.encounteredCounties);
    const paths = counties.map((f) => {
      const fips = String(f.id).padStart(5, "0");
      const fill = solved.has(fips)
        ? regionColor(dataset.byFips.get(fips)?.region ?? "Unknown")
        : encountered.has(fips)
        ? ENCOUNTERED
        : UNTOUCHED;
      return <path key={fips} d={path(f) ?? ""} fill={fill} stroke="#fffaf0" strokeWidth={0.2} />;
    });
    return { paths, statesMesh };
  }, [topo, state, dataset]);

  const rp = regionProgress(dataset, state);
  const totalSolved = state.solvedCounties.length;
  const totalPool = dataset.answerPoolFips.length;

  return (
    <div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: INK, marginBottom: 4 }}>Your map</div>
      <div style={{ color: "#7c715c", fontSize: 14, marginBottom: 12 }}>
        {totalSolved} / {totalPool} landmarks solved · {state.encounteredCounties.length} counties encountered
      </div>
      {!rendered ? (
        <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: "#9b8f78" }}>Loading map…</div>
      ) : (
        <svg viewBox="0 0 975 610" style={{ width: "100%", height: "auto", display: "block" }}>
          <g>{rendered.paths}</g>
          <path d={rendered.statesMesh} fill="none" stroke="#fffaf0" strokeWidth={0.8} strokeLinejoin="round" />
        </svg>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginTop: 12 }}>
        {rp.filter((r) => r.total > 0).map((r) => (
          <span key={r.region} style={{ fontSize: 12.5, color: INK }}>
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: regionColor(r.region), marginRight: 5, verticalAlign: "middle" }} />
            {r.region} {r.solved}/{r.total}
          </span>
        ))}
      </div>
    </div>
  );
}
```

> **Type note:** `topojson-client`'s `feature`/`mesh` return loosely-typed geometry; the `as any` casts above are deliberate and confined to the topojson boundary. If `npm run build` flags `topo.objects.counties`, keep the `as any` on the topo object — do not add runtime validation (YAGNI).

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: compiles (no type errors). Visual verification happens in Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/components/countle/CountyMap.tsx
git commit -m "feat(collection): county-choropleth map (region-color mosaic)"
```

---

## Task 4: `StatsModal`

**Files:**
- Create: `src/components/countle/StatsModal.tsx`

**Interfaces:**
- Consumes: `CountleState`; `statsSummary` (Task 1); `INK` (theme).
- Produces: `<StatsModal state={CountleState} />`.

- [ ] **Step 1: Implement `StatsModal.tsx`**

```tsx
"use client";
import type { CountleState } from "@/lib/countle";
import { statsSummary } from "@/lib/countle/collection";
import { INK } from "./theme";

function Stat({ big, label }: { big: string | number; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 26, color: INK, lineHeight: 1 }}>{big}</div>
      <div style={{ fontSize: 11.5, color: "#8a7d65", marginTop: 3 }}>{label}</div>
    </div>
  );
}

export default function StatsModal({ state }: { state: CountleState }) {
  const s = statsSummary(state);
  return (
    <div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: INK, marginBottom: 14 }}>Statistics</div>
      <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 20 }}>
        <Stat big={s.played} label="played" />
        <Stat big={`${s.winPct}%`} label="win rate" />
        <Stat big={s.currentStreak} label="streak" />
        <Stat big={s.maxStreak} label="max streak" />
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#5d5343", marginBottom: 8 }}>Guess distribution</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {s.distribution.map((count, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 14, fontSize: 13, color: INK, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
            <div style={{ flex: 1 }}>
              <div style={{ width: `${Math.max(6, (count / s.maxBucket) * 100)}%`, background: "#16a34a", color: "#fff",
                fontSize: 12, fontWeight: 700, textAlign: "right", padding: "2px 8px", borderRadius: 6, minWidth: 22 }}>
                {count}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: compiles. (Visual in Task 5.)

- [ ] **Step 3: Commit**

```bash
git add src/components/countle/StatsModal.tsx
git commit -m "feat(collection): stats modal (distribution, win%, streaks)"
```

---

## Task 5: Overlay shell + header buttons + wire it all up

**Files:**
- Create: `src/components/countle/Overlay.tsx`
- Modify: `src/components/countle/Header.tsx`, `src/components/countle/CountleApp.tsx`

**Interfaces:**
- Consumes: everything above.
- Produces: a working 📊 stats overlay + 🗺️ map overlay launched from the header.

- [ ] **Step 1: Create `Overlay.tsx`**

```tsx
"use client";
import { useEffect } from "react";
import type { ReactNode } from "react";

export default function Overlay({ onClose, wide, children }: { onClose: () => void; wide?: boolean; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div onClick={onClose} className="animate-fade-in"
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(36,29,18,0.45)",
        display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="animate-modal-in"
        style={{ background: "#fffaf0", borderRadius: 20, padding: "22px 22px 26px", width: "100%",
          maxWidth: wide ? 760 : 440, boxShadow: "0 18px 50px rgba(40,30,10,0.3)", position: "relative" }}>
        <button onClick={onClose} aria-label="Close"
          style={{ position: "absolute", top: 12, right: 14, border: "none", background: "transparent", fontSize: 22, cursor: "pointer", color: "#7c715c" }}>×</button>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add buttons to `Header.tsx`**

Replace `src/components/countle/Header.tsx` with (adds two optional callbacks + buttons; existing layout preserved):

```tsx
"use client";
import { INK } from "./theme";

export default function Header({ puzzleNumber, streak, guessesLeft, onOpenStats, onOpenMap }: {
  puzzleNumber: number; streak: number; guessesLeft: number;
  onOpenStats?: () => void; onOpenMap?: () => void;
}) {
  const iconBtn = { border: "none", background: "transparent", cursor: "pointer", fontSize: 18, padding: 2 } as const;
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 40, margin: 0, letterSpacing: -0.5, color: INK }}>COUNTLE</h1>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#b98a2e" }}>#{puzzleNumber}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 15, color: INK }}>
        <span title="streak">🔥 {streak}</span>
        <span style={{ color: "#7c715c" }}>{guessesLeft} left</span>
        <button style={iconBtn} aria-label="Map" title="Your map" onClick={onOpenMap}>🗺️</button>
        <button style={iconBtn} aria-label="Statistics" title="Statistics" onClick={onOpenStats}>📊</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire overlays into `CountleApp.tsx`**

In `src/components/countle/CountleApp.tsx`:
1. Add imports at the top with the others:
```tsx
import { useState } from "react";
import Overlay from "./Overlay";
import CountyMap from "./CountyMap";
import StatsModal from "./StatsModal";
```
2. Change the hook destructure to also take `state`:
```tsx
  const { status, session, guess, dataset, state } = useCountle();
```
3. Add overlay state right after it:
```tsx
  const [overlay, setOverlay] = useState<null | "stats" | "map">(null);
```
4. Pass the openers to `Header`:
```tsx
      <Header puzzleNumber={session.puzzleNumber} streak={session.streak} guessesLeft={session.guessesLeft}
        onOpenStats={() => setOverlay("stats")} onOpenMap={() => setOverlay("map")} />
```
5. Render the overlays as the last children of `<main>`, after the `{session.finished && <WinReveal .../>}` line:
```tsx
      {overlay === "stats" && state && (
        <Overlay onClose={() => setOverlay(null)}><StatsModal state={state} /></Overlay>
      )}
      {overlay === "map" && dataset && state && (
        <Overlay wide onClose={() => setOverlay(null)}><CountyMap dataset={dataset} state={state} /></Overlay>
      )}
```

- [ ] **Step 4: Build, then verify both overlays in the browser**

Run: `npm run build`
Expected: compiles, no type errors.

Run: `npm run dev` (if not already up). The controller drives Playwright (in review if the implementer cannot):
1. Navigate to `http://localhost:3000/`; wait for "Today's mystery".
2. Click the 📊 button → the Stats overlay shows played / win% / streak / max-streak and a guess-distribution histogram. Screenshot `countle-stats.png`.
3. Close (× or Escape), click 🗺️ → the county map renders the US choropleth; any solved county shows its region color, encountered counties grey, the rest faint; the region-progress legend lists regions. Screenshot `countle-map.png`.
4. Confirm no console errors (favicon 404 is fine).

Expected: both overlays open/close; the map shows the mosaic (after at least one solved game, at least one county is region-colored).

- [ ] **Step 5: Commit**

```bash
git add src/components/countle/Overlay.tsx src/components/countle/Header.tsx src/components/countle/CountleApp.tsx
git commit -m "feat(collection): overlay shell + header map/stats buttons + wiring"
```

---

## Self-Review

**Spec coverage (§6 collection + retention):**
- Two-layer map (solved = region color, encountered = dim) → Task 3 `CountyMap` (real county choropleth, the upgrade chosen over the spec's "reuse USMap"). ✓
- Progress readouts (`X / pool landmarks`, encountered count, per-region) → Task 3 readout + `regionProgress` (Task 1). ✓
- Daily streak + max streak → already in Header (Plan 3) + Task 4 StatsModal. ✓
- Stats modal (distribution, win %, streaks) → Task 4 + `statsSummary` (Task 1). ✓

**Placeholder scan:** none — every step has complete code. The `as any` casts in `CountyMap` are a deliberate, scoped TopoJSON-boundary concession (noted), not a placeholder.

**Type consistency:** `CountyStatus`/`RegionProgress`/`StatsSummary` defined in Task 1 and consumed by Tasks 3–4; `useCountle` returns `state` (Task 1) which `CountleApp` threads to both overlays (Task 5); `regionColor`/`INK` from the shared theme throughout.

## Notes / deferred
- The county `id`→FIPS `padStart` is the one real-data risk; Task 2 Step 3 confirms the id format before the map is built.
- Polish carried from Plan 3 (GuessInput a11y, WinReveal `setTimeout` cleanup, `useCountle` error hardening) is NOT in scope here — fold into a later cleanup pass.
- Production art hosting (`public/art/` is gitignored) remains the one pre-deploy task.
```
