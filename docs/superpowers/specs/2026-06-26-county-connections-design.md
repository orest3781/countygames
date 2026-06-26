# County Connections — Design Spec

**Date:** 2026-06-26
**Status:** Approved design, pre-implementation
**Relationship:** A second daily game in the "Daily County Games" suite alongside Countle. Reuses the locked `public/data/counties.json`, the Countle engine patterns (`src/lib/countle`), and the Bold Pop Almanac UI (`src/components/countle`).

---

## 1. Summary

**County Connections** is an NYT-Connections-style daily puzzle built on the US county dataset: a 4×4 grid of 16 county cards, find the four hidden groups of 4. It exercises *categorization* (vs Countle's *deduction*), targets daily retention + virality via a spoiler-free colored share grid, and ships static + localStorage with **no backend**.

The hard problem — generating solvable, unambiguous-yet-tricky puzzles — is solved offline by a **constraint solver that proves a unique solution**, optionally enhanced by a local LLM for labels/quality. The vetted puzzles ship as a static pool.

**Owner decisions (2026-06-26):** pre-generated LLM-vetted pool; cards drawn only from the ~271 **famous** (answer-pool) counties; each card shows **"County, ST"**; categories **hidden** (true Connections). Standard NYT rules (4 mistakes, one-away). Categories use **name / geography / fame** traits — the 6 stats sit this game out (they aren't player-recognizable).

---

## 2. Core loop & rules (NYT-faithful)

1. 16 county cards in a 4×4 grid, each labeled `"<County>, <ST>"` (e.g. `Travis, TX`).
2. Player selects exactly 4 cards → **Submit**.
3. Correct group → the four cards lock into a colored row with the (now-revealed) category label.
4. Wrong group → costs one of **4 mistakes**; if exactly 3 of the 4 belong to one group, show "**One away…**".
5. **Shuffle** re-orders unsolved cards; **Deselect all**.
6. Win = all four groups found. Loss = 4 mistakes used (then auto-reveal the remaining groups).
7. One puzzle per day, identical for everyone (UTC date key). No replay of today (MVP).
8. **Share grid:** one row of 4 squares per submission, each square colored by the *group that card actually belongs to* (🟨🟩🟦🟪) — encodes the solve path, never names a county. Copy-to-clipboard.

Difficulty colors (NYT convention): 🟨 yellow (easiest) → 🟩 green → 🟦 blue → 🟪 purple (trickiest).

---

## 3. Category taxonomy

Only **knowledge-recognizable** traits (a player can plausibly know them). Three families:

- **Name-based:** shared county name across states (4 different counties all named *Franklin*); named after a **US president** (Washington, Jefferson, Madison, Jackson, Lincoln, Monroe, Adams, Harrison, …); county is the home of a famous **city/landmark** (Clark→Las Vegas, Coconino→Grand Canyon) — a small curated seed map.
- **Geography-based:** same **state**; same **region** (the 8 `REGION_MAP` regions); **state-capital** county (the county containing a state capital); borders an **ocean / Mexico / Canada** (derived from a curated coastal/border flag, MVP-optional).
- **Theme-based (LLM-derived, stretch / Phase 2):** "wine country", "tornado alley", "tech hubs", etc.

**The trap is the point.** A card may satisfy *two* category predicates (e.g. *Washington County* matches both "all named Washington" and "named after a president"); the other 15 cards force which group claims it. Puzzles with traps are preferred (Section 4).

MVP families (crisp, no LLM required): shared-name, president-name, same-state, same-region, state-capital. The famous-city and border families are curated-seed add-ons; themes are Phase 2.

---

## 4. Puzzle generation — the constraint solver (the crux)

An offline pipeline stage `pipeline/connections/generate.ts` (run with `tsx`), producing `public/data/connections.json`. Pure, deterministic given a seed; **no Supabase, Ollama optional.**

### 4.1 Category generators
Pure functions over the famous-county pool (`isAnswerPool` ∩ recognizable). Each emits candidate **groups**, where a group is `{ family, predicate, label, members: fips[] }` with `members.length ≥ 4`:
- `sameState` — for each state with ≥4 famous counties, the member set is those counties.
- `sameRegion` — per region with ≥4.
- `stateCapital` — the ~51 state-capital counties (one member set).
- `sharedName` — county names occurring in ≥4 distinct states; one group per such name (members = one famous county per state with that name).
- `presidentName` — famous counties whose name ∈ the president surname list.
- `cityFame` (curated seed) / `border` (curated flag) — optional.

Each group carries a **predicate** `(county) => boolean` so membership can be re-tested against any card (this is what detects traps).

### 4.2 Assembly + uniqueness proof
For a candidate puzzle, choose **4 groups** (diverse families preferred) and pick exactly **4 members** from each → 16 distinct cards. Then **prove a unique solution**:
1. Build the bipartite graph **cards ↔ the 4 category predicates** (edge if the card satisfies that predicate — this surfaces cross-membership traps).
2. The puzzle is **valid iff the only perfect "4-per-category" assignment is the intended one.** Verify by searching for any *second* distinct assignment (each category gets exactly 4, each card to exactly one satisfied category); reject if a second exists. The card set is tiny (16×4), so exhaustive/backtracking search is fast.
3. **Trap score** = number of cards with predicate-degree ≥ 2 (cards that *could* fit another group but are forced). Prefer higher trap scores; reject trivial puzzles with zero traps.

### 4.3 Difficulty/color ordering
Rank the 4 groups by trickiness (theme > famous-city > shared-name > president > region > same-state, weighted by trap involvement) → assign 🟨→🟩→🟦→🟪. The LLM may refine; the heuristic is the fallback.

### 4.4 LLM enhancement (optional — qwen via Ollama, with fallback)
For each assembled candidate, *if Ollama is available*: rewrite the 4 labels in punchy NYT style, confirm/swap the color order, score overall quality (fairness, wit, obscurity), and **reject** unfair/ambiguous/too-obscure puzzles. **Fallback (no Ollama):** template labels (`"Counties in Texas"`, `"Named after a president"`, `"All named Franklin"`), heuristic color order, and a heuristic quality filter (reject puzzles whose cards are below a fame threshold or whose trap score is 0).

### 4.5 Curate
Generate many candidates (seeded, deduped by group-set), keep the **top ~300 by quality+trap score** → `connections.json`. ~300 = ~10 months of daily puzzles.

---

## 5. Data model + daily selection

`public/data/connections.json`:
```ts
interface ConnectionsGroup { label: string; color: "yellow" | "green" | "blue" | "purple"; fips: string[]; } // fips.length === 4
interface ConnectionsPuzzle { id: number; groups: ConnectionsGroup[]; }                                       // groups.length === 4
interface ConnectionsPayload { schemaVersion: 1; generatedAt: string; count: number; puzzles: ConnectionsPuzzle[]; }
```
- **Daily puzzle:** `puzzles[hashString(dateKey) % count]` (reuses Countle's `hashString`/`dateKeyUTC`).
- **Card order:** the 16 fips deterministically shuffled by a `hash(dateKey + ":order")` seed (so the grid is stable per day but not grouped).
- Card display (name, state_abbr) comes from the locked `counties.json` via `buildDataset` — `connections.json` stores only fips + group metadata.

### localStorage state — `connections-v1`
```ts
interface ConnectionsState {
  schemaVersion: 1;
  lastPlayedDateKey: string | null;
  today: { dateKey: string; submissions: string[][]; solvedColors: string[]; mistakes: number; finished: boolean; won: boolean } | null;
  streak: number; maxStreak: number; gamesPlayed: number; wins: number; perfectGames: number; // perfect = 0 mistakes
}
```

---

## 6. Engine (pure, TDD'd) — `src/lib/connections/`

- `types.ts` — the interfaces above.
- `daily.ts` — `getDailyPuzzle(payload, dateKey)`, `dailyCardOrder(puzzle, dateKey): string[]` (seeded shuffle). Reuses `hashString`/`dateKeyUTC` from `src/lib/countle`.
- `game.ts` — `evaluateSubmission(puzzle, fips4): { result: "correct" | "one-away" | "wrong"; color?: string }`; `shareRowFor(puzzle, fips4): string` (4 emoji squares by each card's true group); `buildShareText(...)`.
- `state.ts` — pure state machine: `recordSubmission(state, fips4, result, dateKey)`, finalize on win/4-mistakes; streak/wins/perfect tracking. Mirrors Countle's `state.ts`.
- `validate.ts` — zod schema gate for `connections.json` (every puzzle: 4 groups × 4 distinct fips, 16 distinct cards total, valid colors, all fips ∈ counties.json). Used by generation.

Engine is headless (no React/DOM); the generation pipeline shares its types + validator.

---

## 7. UI (Bold Pop Almanac) — `src/components/connections/`

Reuses theme tokens, `Overlay`, fonts, animations. New components:
- `ConnectionsApp` — orchestrator (fetch `counties.json` + `connections.json`, `useConnections` hook over localStorage).
- `Grid` — 4×4 of `Card` (county+state, selectable, color when solved); solved rows collapse to a colored band with the revealed label (pop-in animation).
- `Controls` — Shuffle / Deselect all / Submit (Submit enabled at exactly 4 selected); mistakes shown as 4 dots.
- `WinLose` overlay — result + the four group bands + **Share** (clipboard).
- Header reuses Countle's wordmark style ("CONNECTIONS", puzzle #, streak, 📊).

Route: `src/app/connections/page.tsx` → `<ConnectionsApp/>`. (Countle stays at `/`.) A small shared landing/hub linking both games is Phase 2.

---

## 8. Architecture / reuse

- **Static + localStorage, no backend** (identical to Countle).
- **Reuse:** `buildDataset` + the locked `counties.json`; `hashString`/`dateKeyUTC`; the Bold Pop theme + `Overlay`; the state-machine + share-text patterns; vitest setup.
- **New:** the `connections` engine (Section 6), the generation pipeline stage (Section 4), the grid UI (Section 7).
- Generation: `npm run gen:connections` → writes `public/data/connections.json` (committed, ~small). Art is not used in this game.

---

## 9. Scope

**MVP:** generation (crisp families: shared-name, president, same-state, same-region, state-capital) with the uniqueness solver + heuristic labels/quality (LLM optional) → vetted pool · the daily game (grid, select-4, 4 mistakes, one-away, shuffle, win/lose reveal, streak, stats, share). localStorage, anonymous, static.

**Later:** LLM-authored themed categories + label polish · famous-city/landmark + border families · the cross-game hub · accounts/leaderboard (shared with Countle Phase 2) · archive/practice.

---

## 10. Risks & open questions

1. **Generation quality is the whole game.** A dull or unfair pool kills it. Mitigation: the uniqueness proof guarantees *solvable*; the trap score guarantees *non-trivial*; the LLM/heuristic quality filter guards *fairness/obscurity*. Manual spot-check of the first generated pool before shipping.
2. **Obscurity.** Even famous counties are less known than NYT words; showing "County, ST" + drawing only from the 271 pool is the mitigation. If still too hard, fall back to the word-bank variant (show the 4 labels).
3. **Same-name confusion is a *feature*** (the shared-name family) but must not collide with disambiguation — cards always show state, and the share grid never reveals identity.
4. **Pool size & variety.** Need ~300 *distinct* quality puzzles; the generator must dedupe by group-set and cap repeated states/regions so days don't feel samey. Risk if the famous pool can't yield enough variety — measure during generation.
5. **LLM dependency.** Kept optional with a full heuristic fallback so the MVP ships without Ollama.
6. **Daily collisions.** `hash % count` can repeat before the pool exhausts (same gap noted for Countle) — acceptable for MVP; a seeded no-repeat permutation is a later polish (could fix both games at once).

---

## 11. Success criteria

- A new visitor solves or fails a fair, unambiguous daily puzzle with no instructions in <90s.
- Every shipped puzzle has exactly one solution (solver-proven) and ≥1 trap.
- The colored share grid is compelling enough to post.
- Reuses Countle's data + engine + theme — each new suite game is mostly a front-end + rules.
