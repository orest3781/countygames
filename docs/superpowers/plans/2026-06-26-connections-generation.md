# County Connections Generation Implementation Plan (Plan 2 — generation pipeline)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce `public/data/connections.json` — a pool of ~300 **provably-solvable, trap-rich** County Connections puzzles — generated offline from the famous-county data by category generators + a constraint solver that proves a unique 4-per-category solution. No backend, no Ollama (LLM enhancement is Phase 2).

**Architecture:** Pure, deterministic (seeded) modules under `pipeline/connections/`, run with `tsx`. Category generators emit candidate groups (each a category predicate + ≥4 member fips) over the ~271 famous counties. An assembler picks 4 *diverse-family* groups + 4 members each (16 distinct cards), and the **solver proves the intended partition is unique** (rejecting ambiguous puzzles) and scores traps. The best ~300 (deduped) are written and validated by the Plan 1 engine validator.

**Tech Stack:** TypeScript via `tsx`; the Plan 1 engine (`src/lib/connections`: types + `validateConnections`); the locked `public/data/counties.json` (via `buildDataset` from `src/lib/countle`); `STATE_CAPITAL_FIPS` from `pipeline/countle/lib`. `vitest` for the pure logic. No new dependencies.

## Global Constraints

- **Faithful to the spec's MVP scope (§3, §4):** families = `sameState`, `sameRegion`, `stateCapital`, `sharedName`, `presidentName`. **No themes, no LLM** (both Phase 2). Heuristic labels + heuristic quality.
- **Cards are famous-only:** every card fips must have `isAnswerPool === true` in `counties.json`. Show-state is a UI concern; here we only emit fips.
- **Pure + deterministic.** Generators/solver/assembler are pure (no `Date.now()`, no `Math.random()` — use a seeded PRNG). The orchestrator script does the IO.
- **The output MUST pass `validateConnections`** (Plan 1): each puzzle = 4 groups × 4 distinct fips, 16 distinct, 4 distinct colors, `count === puzzles.length`.
- **Uniqueness is mandatory:** a puzzle is emitted ONLY if the solver proves exactly one valid 4-per-category assignment of its 16 cards. **Trap score ≥ 1** required (reject trivial puzzles).
- **Family diversity:** a puzzle's 4 groups must come from **≥3 distinct families** (never 4 same-state groups); and never pair a state with that state's own region (they're co-extensive). The solver is the final safety net; these are cheap pre-filters.
- **Colors:** assign yellow→green→blue→purple by a fixed family-difficulty order (sameState easiest → name hardest), tie-broken deterministically.
- **FIPS are 5-digit strings.**

---

## File Structure

| File | Responsibility |
|------|----------------|
| `pipeline/connections/families.ts` | `bareName`, `PRESIDENTS`, and the category generators → `CandidateGroup[]` (family, key, label, predicate, members). |
| `pipeline/connections/families.test.ts` | Vitest unit tests. |
| `pipeline/connections/solver.ts` | `countAssignments`, `isUniqueSolution`, `trapScore` — the uniqueness proof + trap metric. |
| `pipeline/connections/solver.test.ts` | Vitest unit tests (the crux). |
| `pipeline/connections/assemble.ts` | `mulberry32` seed, `assemblePuzzles(groups, opts)` → ranked, deduped, unique `ConnectionsPuzzle[]`. |
| `pipeline/connections/assemble.test.ts` | Vitest unit tests. |
| `pipeline/connections/generate.ts` | Orchestrator script: load data → build families → assemble → validate → write `public/data/connections.json`. |
| `public/data/connections.json` | **The deliverable** (committed). |

### Shared shapes
```ts
import type { CountyEntry } from "../../src/lib/countle/types"; // generation imports the engine type
type Family = "sameState" | "sameRegion" | "stateCapital" | "sharedName" | "presidentName";
interface CandidateGroup {
  family: Family;
  key: string;                    // unique category id, e.g. "state:TX", "region:Pacific", "capitals", "name:Washington", "presidents"
  label: string;                  // heuristic display label
  predicate: (c: CountyEntry) => boolean; // category membership test (used by the solver for traps)
  members: string[];              // ≥4 famous fips in this category (assembler picks 4)
}
```

---

## Task 1: Category generators (`families.ts`)

**Files:**
- Create: `pipeline/connections/families.ts`, `pipeline/connections/families.test.ts`

**Interfaces:**
- Consumes: `CountyEntry` from `@/lib/countle`.
- Produces: `bareName(name): string`, `PRESIDENTS: Set<string>`, `buildCandidateGroups(famous: CountyEntry[], capitalFips: Set<string>): CandidateGroup[]`, and the `Family`/`CandidateGroup` types.

- [ ] **Step 1: Write the failing test**

Create `pipeline/connections/families.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { bareName, buildCandidateGroups } from "./families";
import type { CountyEntry, StatKey } from "../../src/lib/countle/types";

function county(fips: string, name: string, st: string, stateName: string, region: string): CountyEntry {
  const z: Record<StatKey, number> = { wealth: 1, health: 1, people: 1, land: 1, danger: 1, education: 1 };
  return { fips, name, state_abbr: st, state_name: stateName, region, county_seat: null, lat: 0, lng: 0,
    stats: z, display: { wealth: "", health: "", people: "", land: "", danger: "", education: "" },
    rarity: "common", hasArt: false, isAnswerPool: true, notable_person: null, notable_person_desc: null, flavor: null };
}

describe("bareName", () => {
  it("strips county-type suffixes", () => {
    expect(bareName("Cook County")).toBe("Cook");
    expect(bareName("Orleans Parish")).toBe("Orleans");
    expect(bareName("North Slope Borough")).toBe("North Slope");
    expect(bareName("Carson City")).toBe("Carson"); // " City" stripped
  });
});

describe("buildCandidateGroups", () => {
  // 4 Texas (Southwest), 4 Pacific (CA), 4 capitals, 4 named Washington (across states)
  const counties: CountyEntry[] = [
    county("48001", "Travis County", "TX", "Texas", "Southwest"),
    county("48002", "Harris County", "TX", "Texas", "Southwest"),
    county("48003", "Dallas County", "TX", "Texas", "Southwest"),
    county("48004", "Bexar County", "TX", "Texas", "Southwest"),
    county("06001", "Alameda County", "CA", "California", "Pacific"),
    county("06002", "Sonoma County", "CA", "California", "Pacific"),
    county("06003", "Marin County", "CA", "California", "Pacific"),
    county("06004", "Napa County", "CA", "California", "Pacific"),
    county("11001", "Washington County", "AA", "Alpha", "Northeast"),
    county("22001", "Washington County", "BB", "Beta", "South"),
    county("33001", "Washington County", "CC", "Gamma", "Midwest"),
    county("44001", "Washington County", "DD", "Delta", "Mountain"),
  ];
  const caps = new Set(["48001", "06001", "11001", "22001"]); // 4 capitals across the set
  const groups = buildCandidateGroups(counties, caps);

  it("emits a same-state group for Texas with its 4 members", () => {
    const tx = groups.find((g) => g.key === "state:TX")!;
    expect(tx.family).toBe("sameState");
    expect(tx.members.sort()).toEqual(["48001", "48002", "48003", "48004"]);
    expect(tx.predicate(counties[0])).toBe(true);
    expect(tx.predicate(counties[4])).toBe(false); // a CA county
  });
  it("emits a same-region group for Pacific", () => {
    expect(groups.find((g) => g.key === "region:Pacific")!.members).toHaveLength(4);
  });
  it("emits a single state-capitals group with the 4 capital members", () => {
    const cap = groups.find((g) => g.key === "capitals")!;
    expect(cap.members.sort()).toEqual(["06001", "11001", "22001", "48001"]);
    expect(cap.predicate(counties[0])).toBe(true);
  });
  it("emits a shared-name group for Washington (>=4 states)", () => {
    const wn = groups.find((g) => g.key === "name:Washington")!;
    expect(wn.family).toBe("sharedName");
    expect(wn.members).toHaveLength(4);
  });
  it("does NOT emit a same-state group for a state with <4 famous counties", () => {
    expect(groups.find((g) => g.key === "state:AA")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- connections/families.test`
Expected: FAIL — cannot resolve `./families`.

- [ ] **Step 3: Implement `families.ts`**

```ts
import type { CountyEntry } from "../../src/lib/countle/types";

export type Family = "sameState" | "sameRegion" | "stateCapital" | "sharedName" | "presidentName";

export interface CandidateGroup {
  family: Family;
  key: string;
  label: string;
  predicate: (c: CountyEntry) => boolean;
  members: string[];
}

export function bareName(name: string): string {
  return name.replace(/ (County|Parish|Borough|Census Area|Municipality|City and Borough|city|City)$/i, "").trim();
}

/** US president surnames that appear as county names. */
export const PRESIDENTS = new Set<string>([
  "Washington", "Adams", "Jefferson", "Madison", "Monroe", "Jackson", "Van Buren", "Harrison",
  "Tyler", "Polk", "Taylor", "Fillmore", "Pierce", "Buchanan", "Lincoln", "Johnson", "Grant",
  "Hayes", "Garfield", "Arthur", "Cleveland", "McKinley", "Roosevelt", "Taft", "Wilson", "Harding",
  "Coolidge", "Hoover", "Truman", "Eisenhower", "Kennedy", "Nixon", "Carter", "Reagan",
]);

export function buildCandidateGroups(famous: CountyEntry[], capitalFips: Set<string>): CandidateGroup[] {
  const groups: CandidateGroup[] = [];
  const byFips = new Map(famous.map((c) => [c.fips, c]));

  // sameState — one group per state with >=4 famous counties.
  const byState = new Map<string, CountyEntry[]>();
  for (const c of famous) (byState.get(c.state_abbr) ?? byState.set(c.state_abbr, []).get(c.state_abbr)!).push(c);
  for (const [st, list] of byState) {
    if (list.length < 4) continue;
    groups.push({
      family: "sameState", key: `state:${st}`, label: `Counties in ${list[0].state_name}`,
      predicate: (c) => c.state_abbr === st, members: list.map((c) => c.fips),
    });
  }

  // sameRegion — one group per region with >=4.
  const byRegion = new Map<string, CountyEntry[]>();
  for (const c of famous) (byRegion.get(c.region) ?? byRegion.set(c.region, []).get(c.region)!).push(c);
  for (const [region, list] of byRegion) {
    if (list.length < 4) continue;
    groups.push({
      family: "sameRegion", key: `region:${region}`, label: `${region} counties`,
      predicate: (c) => c.region === region, members: list.map((c) => c.fips),
    });
  }

  // stateCapital — one group; members = famous capital counties.
  const capMembers = famous.filter((c) => capitalFips.has(c.fips)).map((c) => c.fips);
  if (capMembers.length >= 4) {
    groups.push({
      family: "stateCapital", key: "capitals", label: "State capitals",
      predicate: (c) => capitalFips.has(c.fips), members: capMembers,
    });
  }

  // sharedName — one group per bare name occurring in >=4 distinct states (one member per state).
  const byName = new Map<string, Map<string, string>>(); // bareName -> (state -> fips)
  for (const c of famous) {
    const b = bareName(c.name);
    if (!byName.has(b)) byName.set(b, new Map());
    const m = byName.get(b)!;
    if (!m.has(c.state_abbr)) m.set(c.state_abbr, c.fips);
  }
  for (const [name, perState] of byName) {
    if (perState.size < 4) continue;
    groups.push({
      family: "sharedName", key: `name:${name}`, label: `Counties named “${name}”`,
      predicate: (c) => bareName(c.name) === name, members: [...perState.values()],
    });
  }

  // presidentName — one group; members = famous counties whose bare name is a president surname.
  const presMembers = famous.filter((c) => PRESIDENTS.has(bareName(c.name))).map((c) => c.fips);
  if (presMembers.length >= 4) {
    groups.push({
      family: "presidentName", key: "presidents", label: "Named after a U.S. president",
      predicate: (c) => PRESIDENTS.has(bareName(c.name)), members: presMembers,
    });
  }

  void byFips; // reserved for future families
  return groups;
}
```

> Note: imports use **relative paths to specific engine submodules** (`../../src/lib/countle/types`, `/data`, `../../src/lib/connections/types`, `/validate`). `pipeline/` is tsconfig-excluded, so the `@/` alias is NOT reliably available to `tsx`/`vitest` here; and the connections barrel does NOT re-export the validator (Plan 1 kept it out for bundle safety). Importing the specific files also avoids directory-index resolution ambiguity.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- connections/families.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/connections/families.ts pipeline/connections/families.test.ts
git commit -m "feat(connections-gen): category generators (state/region/capital/sharedName/president)"
```

---

## Task 2: The uniqueness solver (`solver.ts`)

**Files:**
- Create: `pipeline/connections/solver.ts`, `pipeline/connections/solver.test.ts`

**Interfaces:**
- Produces: `countAssignments(cards: string[], predicates: ((fips: string) => boolean)[], cap?: number): number`, `isUniqueSolution(cards: string[], predicates: ((fips: string) => boolean)[]): boolean`, `trapScore(cards: string[], predicates: ((fips: string) => boolean)[]): number`.

- [ ] **Step 1: Write the failing test**

Create `pipeline/connections/solver.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { countAssignments, isUniqueSolution, trapScore } from "./solver";

// 4 categories, predicates by membership sets.
function preds(sets: string[][]) {
  return sets.map((s) => (fips: string) => s.includes(fips));
}

describe("countAssignments", () => {
  it("a clean partition (each card fits exactly one category) is unique", () => {
    const cards = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p"];
    const sets = [["a", "b", "c", "d"], ["e", "f", "g", "h"], ["i", "j", "k", "l"], ["m", "n", "o", "p"]];
    expect(countAssignments(cards, preds(sets))).toBe(1);
  });
  it("a trap that still forces a unique solution counts 1", () => {
    // 'a' fits cat0 AND cat1, but cat1 already has its 4 (e,f,g,h) and cat0 needs a → forced.
    const cards = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p"];
    const sets = [["a", "b", "c", "d"], ["a", "e", "f", "g", "h"], ["i", "j", "k", "l"], ["m", "n", "o", "p"]];
    expect(countAssignments(cards, preds(sets))).toBe(1);
  });
  it("a genuinely ambiguous set counts >= 2", () => {
    // 'a' and 'e' can swap between cat0 and cat1 → two valid assignments.
    const cards = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p"];
    const sets = [["a", "e", "b", "c", "d"], ["a", "e", "f", "g", "h"], ["i", "j", "k", "l"], ["m", "n", "o", "p"]];
    expect(countAssignments(cards, preds(sets))).toBeGreaterThanOrEqual(2);
  });
});

describe("isUniqueSolution", () => {
  it("true for the forced-trap case, false for the ambiguous case", () => {
    const cards = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p"];
    expect(isUniqueSolution(cards, preds([["a", "b", "c", "d"], ["a", "e", "f", "g", "h"], ["i", "j", "k", "l"], ["m", "n", "o", "p"]]))).toBe(true);
    expect(isUniqueSolution(cards, preds([["a", "e", "b", "c", "d"], ["a", "e", "f", "g", "h"], ["i", "j", "k", "l"], ["m", "n", "o", "p"]]))).toBe(false);
  });
});

describe("trapScore", () => {
  it("counts cards that satisfy more than one category", () => {
    const cards = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p"];
    // 'a' fits cat0 + cat1 → 1 trap card.
    expect(trapScore(cards, preds([["a", "b", "c", "d"], ["a", "e", "f", "g", "h"], ["i", "j", "k", "l"], ["m", "n", "o", "p"]]))).toBe(1);
    // clean → 0 traps.
    expect(trapScore(cards, preds([["a", "b", "c", "d"], ["e", "f", "g", "h"], ["i", "j", "k", "l"], ["m", "n", "o", "p"]]))).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- connections/solver.test`
Expected: FAIL — cannot resolve `./solver`.

- [ ] **Step 3: Implement `solver.ts`**

```ts
type Pred = (fips: string) => boolean;

/** Candidate categories (indices) each card satisfies. */
function candidates(cards: string[], predicates: Pred[]): number[][] {
  return cards.map((fips) => predicates.map((p, i) => (p(fips) ? i : -1)).filter((i) => i >= 0));
}

/**
 * Count complete assignments of the 16 cards to the 4 categories such that each
 * card goes to a category it satisfies AND each category gets exactly 4 cards.
 * Capped (default 2) — we only need to distinguish "unique" (===1) from "ambiguous" (>=2).
 */
export function countAssignments(cards: string[], predicates: Pred[], cap = 2): number {
  const cand = candidates(cards, predicates);
  const need = predicates.map(() => 4);
  let count = 0;
  function bt(idx: number): void {
    if (count >= cap) return;
    if (idx === cards.length) { count++; return; }
    // Prune: if any card from here has no candidate with remaining capacity, fail fast handled by the loop.
    for (const cat of cand[idx]) {
      if (need[cat] > 0) {
        need[cat]--;
        bt(idx + 1);
        need[cat]++;
        if (count >= cap) return;
      }
    }
  }
  bt(0);
  return count;
}

export function isUniqueSolution(cards: string[], predicates: Pred[]): boolean {
  return countAssignments(cards, predicates, 2) === 1;
}

/** Number of cards that satisfy more than one category (the trap cards). */
export function trapScore(cards: string[], predicates: Pred[]): number {
  return candidates(cards, predicates).filter((c) => c.length >= 2).length;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- connections/solver.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/connections/solver.ts pipeline/connections/solver.test.ts
git commit -m "feat(connections-gen): uniqueness solver (countAssignments/isUnique/trapScore)"
```

---

## Task 3: Puzzle assembler (`assemble.ts`)

**Files:**
- Create: `pipeline/connections/assemble.ts`, `pipeline/connections/assemble.test.ts`

**Interfaces:**
- Consumes: `CandidateGroup` (Task 1), `isUniqueSolution`/`trapScore` (Task 2), `ConnectionsPuzzle`/`ConnectionsGroup`/`COLORS` from `@/lib/connections`, `CountyEntry`.
- Produces: `mulberry32(seed)`, `assemblePuzzles(groups: CandidateGroup[], byFips: Map<string, CountyEntry>, opts: { seed: number; target: number; attempts: number }): ConnectionsPuzzle[]`.

- [ ] **Step 1: Write the failing test**

Create `pipeline/connections/assemble.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mulberry32, assemblePuzzles } from "./assemble";
import { validateConnections } from "../../src/lib/connections/validate";
import type { CandidateGroup } from "./families";
import type { CountyEntry, StatKey } from "../../src/lib/countle/types";

function county(fips: string, st: string, region: string): CountyEntry {
  const z: Record<StatKey, number> = { wealth: 1, health: 1, people: 1, land: 1, danger: 1, education: 1 };
  return { fips, name: fips, state_abbr: st, state_name: st, region, county_seat: null, lat: 0, lng: 0,
    stats: z, display: { wealth: "", health: "", people: "", land: "", danger: "", education: "" },
    rarity: "common", hasArt: false, isAnswerPool: true, notable_person: null, notable_person_desc: null, flavor: null };
}

// Six clean, non-overlapping member-disjoint groups across distinct families → assembler can pick 4.
const fipsOf = (p: string, n: number) => `${p}${String(n).padStart(3, "0")}`;
const mk = (family: any, key: string, n: number, base: string): CandidateGroup => ({
  family, key, label: key, members: Array.from({ length: 5 }, (_, i) => fipsOf(base, n * 10 + i)),
  predicate: (c) => c.state_abbr === key, // disjoint membership by a unique state tag
});
const groups: CandidateGroup[] = [
  mk("sameState", "S1", 1, "10"), mk("sameState", "S2", 2, "20"),
  mk("sameRegion", "R1", 3, "30"), mk("stateCapital", "C1", 4, "40"),
  mk("presidentName", "P1", 5, "50"), mk("sharedName", "N1", 6, "60"),
];
const allFips = groups.flatMap((g) => g.members);
const byFips = new Map(allFips.map((f) => [f, county(f, "X", "Midwest")]));
// give each card the state tag its group's predicate checks
for (const g of groups) for (const f of g.members) byFips.get(f)!.state_abbr = g.key;

describe("mulberry32", () => {
  it("is deterministic", () => {
    const a = mulberry32(42), b = mulberry32(42);
    expect(a()).toBe(b());
  });
});

describe("assemblePuzzles", () => {
  const puzzles = assemblePuzzles(groups, byFips, { seed: 1, target: 3, attempts: 500 });
  it("produces valid puzzles that pass the engine validator", () => {
    expect(puzzles.length).toBeGreaterThan(0);
    expect(validateConnections({ schemaVersion: 1, generatedAt: "x", count: puzzles.length, puzzles }).ok).toBe(true);
  });
  it("every emitted puzzle is structurally valid (16 distinct cards, 4 groups × 4)", () => {
    for (const p of puzzles) {
      expect(new Set(p.groups.flatMap((g) => g.fips)).size).toBe(16);
      expect(p.groups.every((g) => g.fips.length === 4)).toBe(true);
    }
    // (Uniqueness + trap correctness is proven in solver.test.ts; the assembler only emits puzzles that pass it.)
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- connections/assemble.test`
Expected: FAIL — cannot resolve `./assemble`.

- [ ] **Step 3: Implement `assemble.ts`**

```ts
import type { CandidateGroup } from "./families";
import { isUniqueSolution, trapScore } from "./solver";
import { COLORS, type ConnectionsPuzzle, type ConnectionsGroup } from "../../src/lib/connections/types";
import type { CountyEntry } from "../../src/lib/countle/types";

export function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick<T>(rng: () => number, arr: T[]): T { return arr[Math.floor(rng() * arr.length)]; }
function sample<T>(rng: () => number, arr: T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

// Family difficulty order → color: easiest yellow … hardest purple.
const FAMILY_RANK: Record<string, number> = { sameState: 0, sameRegion: 1, stateCapital: 2, presidentName: 3, sharedName: 4 };

/** A state and that state's own region are co-extensive — never use both. */
function regionOfState(groups: CandidateGroup[], stateKey: string, byFips: Map<string, CountyEntry>): string | null {
  const g = groups.find((x) => x.key === stateKey);
  if (!g || g.members.length === 0) return null;
  return byFips.get(g.members[0])!.region;
}

export function assemblePuzzles(
  groups: CandidateGroup[],
  byFips: Map<string, CountyEntry>,
  opts: { seed: number; target: number; attempts: number }
): ConnectionsPuzzle[] {
  const rng = mulberry32(opts.seed);
  const out: ConnectionsPuzzle[] = [];
  const seen = new Set<string>(); // dedupe by sorted group-key set
  let id = 1;

  for (let attempt = 0; attempt < opts.attempts && out.length < opts.target; attempt++) {
    // pick 4 groups with >=3 distinct families
    const chosen = sample(rng, groups, 4);
    if (chosen.length < 4) continue;
    if (new Set(chosen.map((g) => g.family)).size < 3) continue;
    // skip a state paired with its own region
    const stateKeys = chosen.filter((g) => g.family === "sameState").map((g) => g.key);
    const regionKeys = new Set(chosen.filter((g) => g.family === "sameRegion").map((g) => g.key));
    if (stateKeys.some((sk) => { const r = regionOfState(groups, sk, byFips); return r && regionKeys.has(`region:${r}`); })) continue;

    const dedupeKey = [...chosen.map((g) => g.key)].sort().join("|");
    if (seen.has(dedupeKey)) continue;

    // pick 4 distinct members per group, all 16 distinct overall
    const used = new Set<string>();
    const pickedPerGroup: string[][] = [];
    let ok = true;
    for (const g of chosen) {
      const avail = g.members.filter((f) => !used.has(f));
      if (avail.length < 4) { ok = false; break; }
      const four = sample(rng, avail, 4);
      four.forEach((f) => used.add(f));
      pickedPerGroup.push(four);
    }
    if (!ok) continue;

    // prove uniqueness against the FULL category predicates over the 16 cards
    const cards = pickedPerGroup.flat();
    const predicates = chosen.map((g) => g.predicate);
    if (!isUniqueSolution(cards, predicates)) continue;
    if (trapScore(cards, predicates) < 1) continue;

    // color by family difficulty rank (stable)
    const order = chosen
      .map((g, i) => ({ i, rank: FAMILY_RANK[g.family] ?? 9 }))
      .sort((a, b) => a.rank - b.rank || a.i - b.i)
      .map((x) => x.i);
    const connGroups: ConnectionsGroup[] = order.map((gi, colorIdx) => ({
      label: chosen[gi].label, color: COLORS[colorIdx], fips: pickedPerGroup[gi],
    }));

    out.push({ id: id++, groups: connGroups });
    seen.add(dedupeKey);
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- connections/assemble.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/connections/assemble.ts pipeline/connections/assemble.test.ts
git commit -m "feat(connections-gen): seeded puzzle assembler (diverse families, unique, deduped)"
```

---

## Task 4: Generator orchestrator + npm script

**Files:**
- Create: `pipeline/connections/generate.ts`
- Modify: `package.json` (add `gen:connections` script)

**Interfaces:**
- Consumes: `buildDataset` from `@/lib/countle`, `STATE_CAPITAL_FIPS` from `pipeline/countle/lib`, `buildCandidateGroups`, `assemblePuzzles`, `validateConnections`.
- Produces: `public/data/connections.json`.

- [ ] **Step 1: Add the npm script**

In `package.json` `"scripts"`, add:
```json
    "gen:connections": "tsx pipeline/connections/generate.ts",
    "validate:connections": "tsx src/lib/connections/validate.ts",
```

- [ ] **Step 2: Write the orchestrator**

Create `pipeline/connections/generate.ts`:

```ts
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { buildDataset } from "../../src/lib/countle/data";
import type { CountiesPayload, CountyEntry } from "../../src/lib/countle/types";
import { validateConnections } from "../../src/lib/connections/validate";
import { STATE_CAPITAL_FIPS } from "../countle/lib";
import { buildCandidateGroups } from "./families";
import { assemblePuzzles } from "./assemble";

const TARGET = 300;
const ATTEMPTS = 200_000;
const SEED = 20260626;

function main() {
  const payload = JSON.parse(readFileSync(join(process.cwd(), "public", "data", "counties.json"), "utf-8")) as CountiesPayload;
  const ds = buildDataset(payload);
  const famous: CountyEntry[] = ds.all.filter((c) => c.isAnswerPool);
  const byFips = new Map(famous.map((c) => [c.fips, c]));
  const capitalFips = new Set(STATE_CAPITAL_FIPS);

  const groups = buildCandidateGroups(famous, capitalFips);
  console.log(`candidate groups: ${groups.length} (${[...new Set(groups.map((g) => g.family))].join(", ")})`);

  const puzzles = assemblePuzzles(groups, byFips, { seed: SEED, target: TARGET, attempts: ATTEMPTS });
  console.log(`assembled ${puzzles.length} unique puzzles`);

  const out = { schemaVersion: 1 as const, generatedAt: new Date().toISOString(), count: puzzles.length, puzzles };
  const res = validateConnections(out);
  if (!res.ok) { console.error("GENERATED POOL INVALID:"); res.errors.forEach((e) => console.error("  " + e)); process.exit(1); }

  const dir = join(process.cwd(), "public", "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "connections.json"), JSON.stringify(out));
  console.log(`=== wrote public/data/connections.json — ${puzzles.length} puzzles ===`);
}

main();
```

- [ ] **Step 3: Verify it builds (typecheck the pipeline file under tsx)**

Run: `npx tsx --eval "import('./pipeline/connections/generate.ts').catch(e=>{console.error(e);process.exit(1)})"` is NOT needed; instead just confirm the imports resolve by running it in Task 5. For now:
Run: `npm test`
Expected: all prior + connections-gen tests pass (this task added no tests; confirms nothing broke).

- [ ] **Step 4: Commit**

```bash
git add package.json pipeline/connections/generate.ts
git commit -m "feat(connections-gen): generator orchestrator + gen:connections script"
```

---

## Task 5: Generate the pool + validate (acceptance)

**Files:**
- Create: `public/data/connections.json` (generated, committed)

- [ ] **Step 1: Run generation**

Run: `npm run gen:connections`
Expected: prints `candidate groups: N (sameState, sameRegion, stateCapital, sharedName, presidentName)`, `assembled <K> unique puzzles`, and `=== wrote public/data/connections.json — <K> puzzles ===`. K should be in the low hundreds (target 300; if the famous pool can't yield 300 distinct quality puzzles, K may be lower — that is acceptable, report the actual number).

> All engine imports already use relative submodule paths (`../../src/lib/...`). If `tsx` still can't resolve one, point it at the exact file (e.g. `../../src/lib/countle/data`). Re-run `npm test` after any such change.

- [ ] **Step 2: Validate the generated pool**

Run: `npm run validate:connections`
Expected: `VALID: <K> connections puzzles.` and exit 0.

- [ ] **Step 3: Spot-check a puzzle for fairness**

Run: `node -e "const d=require('./public/data/connections.json'); const p=d.puzzles[0]; console.log('puzzle 0:'); for(const g of p.groups){const c=require('./public/data/counties.json').counties; console.log(' ', g.color, g.label, '→', g.fips.map(f=>c[f].name+', '+c[f].state_abbr).join(' | '));}"`
Expected: four sensible, distinct labeled groups whose member counties plausibly fit. Eyeball that the groups are non-trivial (the families differ) and the labels read fairly.

- [ ] **Step 4: Commit the pool**

```bash
git add public/data/connections.json
git commit -m "feat(connections-gen): generate the connections.json puzzle pool"
```

---

## Self-Review

**Spec coverage (§3 families, §4 generation):**
- §3 the 5 MVP families → Task 1 `buildCandidateGroups`. ✓ (themes/LLM are Phase 2 per spec — correctly excluded.)
- §4.2 uniqueness proof (only the intended partition) + trap score → Task 2 `isUniqueSolution`/`trapScore`, enforced in Task 3. ✓
- §4.2 family diversity + no state/own-region pairing → Task 3 pre-filters. ✓
- §4.3 color by difficulty order → Task 3 `FAMILY_RANK`. ✓
- §4.5 curate ~300, dedupe by group-set → Task 3 `seen` + `target`. ✓
- §5 output shape + validation → Task 4 (via Plan 1 `validateConnections`) + Task 5. ✓

**Placeholder scan:** none — complete code. (Task 4 Step 3 is a "did it break" guard, not a placeholder; real validation is Task 5.)

**Type consistency:** `CandidateGroup`/`Family` defined in Task 1 and consumed by Tasks 3–4; `isUniqueSolution`/`trapScore` (Task 2) consumed by Task 3; `ConnectionsPuzzle`/`COLORS`/`validateConnections` from the Plan 1 engine barrel; `STATE_CAPITAL_FIPS` from `pipeline/countle/lib`.

## Notes / deferred
- **Themes + LLM** (qwen label polish, themed categories, obscurity scoring) are Phase 2 per the spec — not in this plan.
- The famous pool has only 3 shared-name and ~20 president-name members, so name groups are rare *spice*; the bulk of variety + traps comes from mixing state/region/capital groups (the assembler enforces ≥3 distinct families).
- If Task 5 yields well under ~300 puzzles, loosening the dedupe (allow member-different reuse of a group-set) or adding the curated theme family (Phase 2) are the levers.
