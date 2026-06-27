# Warmer — Design Spec

**Date:** 2026-06-27
**Status:** Approved design, pre-implementation
**Relationship:** The third daily game in the County suite, alongside **Countle** (deduction) and **County Connections** (grouping). **Warmer** is the *spatial-proximity* entry. It reuses the locked `public/data/counties.json`, the existing county-choropleth map stack (`public/data/counties-albers-10m.json` + the `CountyMap` render pattern), Countle's geo helpers (`src/lib/countle/geo.ts`), the daily-selection helpers (`src/lib/countle/daily.ts`), and the Bold Pop Almanac UI.

---

## 1. Summary

**Warmer** is a daily "hot/cold" proximity game on the US county map (a Globle for counties). A hidden target county is the same for everyone each day. You **type any county** and it lights up on the map by how close it is to the target — **scorching red** when you're nearly there, **cold blue** when you're across the country — plus the exact **miles** and a **compass arrow** pointing toward the target. You keep guessing (no limit) and the national map floods with heat until you find it. Your score is **how few guesses** it took.

This directly answers the central challenge surfaced in research: US counties are extremely obscure (~950:1 less known than states), so the *feedback itself must teach geography within one session*. The hot/cold + distance + bearing loop lets a player who knows zero counties triangulate their way in — and learn the map as they go.

**Owner decisions (2026-06-27):** name = **Warmer**; **unlimited** guesses scored by guess count (always winnable; streak = days solved); feedback = **heat color + exact miles + 8-point compass arrow**; target drawn from the **271 famous** (`isAnswerPool`) counties, salted to a different daily pick than Countle.

---

## 2. Core loop & rules

1. One hidden **target county** per UTC day, identical for everyone. Drawn from the 271 `isAnswerPool` counties via the existing `pickDailyFips`, using a **salted date key** (`"<dateKey>:warmer"`) so Warmer and Countle never share the day's answer.
2. The player **types a county name**; autocomplete spans **all 3,144 counties** (any county is a legal guess) via the existing `searchCounties`. Submitting adds the guess to the board.
3. Each guess yields **feedback** (Section 3): a heat color on the map + distance + direction.
4. **Unlimited guesses.** The day is **solved** when the player names the target. Always winnable — there is no fail state.
5. **Score = guess count** (fewer is better; 5–8 is strong). **Streak = consecutive days solved.** A player may **give up** to reveal the answer (counts as played, breaks the streak, no score).
6. One puzzle per day, no replay of today (MVP).
7. **Share** (spoiler-free): a column of heat emoji encoding the cold→hot journey, ending 🟩, plus the target's **state** and the guess count. Copy-to-clipboard.

---

## 3. Feedback & the heat model

Each guess produces three layers — the antidote to county-obscurity:

- **Heat color** on the guessed county on the map.
- **Exact distance** in miles (centroid-to-centroid, via `haversineMiles` on `lat`/`lng`).
- **8-point compass arrow + label** toward the target (via `bearingDeg` → `compass8`, arrows `↑↗→↘↓↙←↖`), shown **in the guess list, not drawn on the map** (a line on the map would spoiler the target's location).

### 3.1 Heat tiers
A single 5-tier scale drives both the map color and the share emoji (so players learn one legend). Distances are tuned to the US scale; thresholds are starting points to refine in playtesting.

| Tier | Distance (mi) | Map color | Share emoji |
|------|---------------|-----------|-------------|
| Found | 0 (it's the target) | `#15803d` green | 🟩 |
| Hot | < 75 | `#dc2626` red | 🟥 |
| Warm | < 250 | `#f97316` orange | 🟧 |
| Tepid | < 700 | `#fbbf24` gold | 🟨 |
| Cold | ≥ 700 | `#93b4d6` cool blue | 🟦 |

The **closest guess so far** is ringed on the map and pinned to the top of the guess list.

### 3.2 The map (the star)
The national county choropleth — our existing `counties-albers-10m.json` rendered with the `CountyMap` pattern (`d3-geo` `geoPath` + `topojson-client`), nearly unchanged. **Only *guessed* counties are colored** (by tier); unguessed counties stay neutral paper. So the heatmap **accumulates as you play**, and the gestalt ("the warm zone is around the eastern Great Lakes") emerges. Individual counties are tiny at national zoom, which is fine: **the player types guesses rather than reading the map to find a county, and the guess list carries every label, distance, and arrow.** This is the deliberate answer to the "unreadable national county map" pitfall — the map is the *feedback gestalt*, the list is the *precise readout*. No click-to-guess and no zoom in MVP.

---

## 4. Daily target + data

**No new data file is generated.** Unlike Connections, Warmer ships zero authored content:
- The daily **target** is computed at runtime: `pickDailyFips(dataset.answerPoolFips, "<dateKey>:warmer")` → a `CountyEntry`.
- **Distance/bearing** come from `lat`/`lng` (100% coverage in `counties.json`) via `geo.ts`.
- The **map** reuses the already-shipped `counties-albers-10m.json`.

The only new persisted artifact is localStorage state.

### localStorage state — `warmer-v1`
```ts
interface WarmerState {
  schemaVersion: 1;
  lastPlayedDateKey: string | null;
  today: { dateKey: string; guesses: string[]; solved: boolean; gaveUp: boolean } | null; // guesses = fips, in order
  streak: number; maxStreak: number;
  gamesPlayed: number; solves: number;
  bestGuesses: number | null;                 // fewest guesses to a solve, all-time
  guessDistribution: Record<string, number>;  // bucketed solve-guess-counts for the stats modal (e.g. "1-3","4-6","7-9","10+")
}
```
Per-guess feedback (miles, bearing, tier) is **recomputed** from the target + stored fips on load — the engine is pure, so nothing derived is persisted.

---

## 5. Engine (pure, TDD'd) — `src/lib/warmer/`

- `types.ts` — `HeatTier = "found" | "hot" | "warm" | "tepid" | "cold"`; `GuessFeedback { fips; miles; bearingDeg; arrow; label; tier }`; `WarmerState` (Section 4).
- `daily.ts` — `getDailyTarget(dataset, dateKey): CountyEntry` (salted `pickDailyFips`). Reuses `pickDailyFips`/`dateKeyUTC`/`puzzleNumber` from `../countle/daily`.
- `game.ts` — `heatTier(miles): HeatTier`; `evaluateGuess(target, guess): GuessFeedback` (uses `haversineMiles`/`bearingDeg`/`compass8` from `../countle/geo`); `isSolved(target, guessFips)`.
- `state.ts` — pure machine: `initialState`, `parseState`/`serializeState`, `startDay`, `recordGuess(state, fips, target, dateKey)` (appends; on solve finalizes streak/score/stats), `giveUp`. Streak finalization mirrors Countle/Connections (`prevDateKey`).
- `session.ts` — `buildWarmerSession(dataset, state, dateKey)` → view model: `{ puzzleNumber, guesses: GuessFeedback[] (closest-first), guessCount, closest, solved, gaveUp, target?: CountyEntry (only when finished), streak, shareRows, shareText }`. `applyGuess(dataset, state, dateKey, fips)` → `{ ok, state } | { ok:false, reason:"duplicate"|"unknown" }`.
- `share.ts` — `tierEmoji(tier)`; `buildShareText({ puzzleNumber, stateName, guessCount, solved, tiers })` → e.g. `Warmer #12 — found it in Texas in 7 🟦🟦🟨🟧🟥🟥🟩`.
- `persistence.ts` — `STORAGE_KEY = "warmer-v1"`, `loadWarmerState`/`saveWarmerState` (mirrors Countle/Connections).

Engine is headless (no React/DOM). No zod data-validator is needed (no generated data file).

---

## 6. UI (Bold Pop Almanac) — `src/components/warmer/`

Reuses theme tokens, fonts, animations, and `Overlay` from the Countle components.
- `WarmerApp` — orchestrator (fetch `counties.json`; `useWarmer` hook over localStorage; mounts the map, input, list, win banner, stats).
- `useWarmer` — fetch `counties.json` + build dataset, load/save `warmer-v1`, expose the session + a `guess(fips)` action.
- `WarmerMap` — the national choropleth (reuses the `CountyMap` topo-load + `geoPath` pattern). Colors **only guessed** counties by tier; rings the closest guess. (No click/zoom in MVP.)
- `GuessInput` — county autocomplete (reuses `searchCounties`; adapts Countle's `GuessInput`). Any county allowed; rejects duplicates with a soft notice.
- `GuessList` — closest-first rows: `"<County>, <ST> · <miles> mi <arrow>"` + tier color swatch.
- `Header` — `WARMER` wordmark + `#N` + streak + 📊 (mirrors Countle/Connections headers).
- `WinBanner` — on solve: "Found it!" + the target revealed + guess count/score + **Share** (clipboard). On give-up: reveals the target.
- `StatsModal` — games played, solve %, current/max streak, best (fewest) guesses, and the guess-count distribution.

Route: `src/app/warmer/page.tsx` → `<WarmerApp/>`. (Countle stays at `/`, Connections at `/connections`.) A cross-game hub is Phase 2.

---

## 7. Architecture / reuse

- **Static + localStorage, no backend** (identical to Countle/Connections).
- **Reuse:** `buildDataset` + the locked `counties.json`; the `counties-albers-10m.json` map + the `CountyMap` render pattern; `geo.ts` (`haversineMiles`/`bearingDeg`/`compass8`); `daily.ts` (`pickDailyFips`/`dateKeyUTC`/`puzzleNumber`/`hashString`/`prevDateKey`); `searchCounties`; the Bold Pop theme + `Overlay` + fonts + CSS animations; the state-machine + persistence + share-text patterns; vitest setup.
- **New:** the `warmer` engine (Section 5) and the `warmer` UI (Section 6). No content-generation pipeline, no new data assets.

---

## 8. Scope

**MVP:** the daily game — national heat map (only guessed counties colored), type-to-guess autocomplete over all counties, per-guess heat color + exact miles + compass arrow (arrow in the list), closest-guess ring, unlimited guesses, solve → score (guess count) + streak + stats, give-up/reveal, spoiler-free heat-emoji share naming the state. localStorage, anonymous, static.

**Later:** a "color-only" Hard Mode (no miles/arrow); tap-to-zoom and tap-a-guessed-county to inspect; the cross-game hub linking all three games; accounts/leaderboard (shared suite Phase 2); archive/practice.

---

## 9. Risks & open questions

1. **Map legibility at national zoom.** Individual counties are tiny. Mitigation: the guess **list** carries all precise labels/distances/arrows; the map is the heat *gestalt*; the closest guess is ringed. If still weak, a Phase-2 tap-to-zoom is the fallback.
2. **Centroid distance between adjacent counties is small** (~30–60 mi), so distance is a coarse signal near the target; the final pin-down leans on the compass arrow + local knowledge. That endgame difficulty is acceptable (it's where skill shows) as long as the arrow keeps the player oriented.
3. **Difficulty self-calibrates** via guess count (experts low, novices high, everyone solves) — which structurally avoids the "too easy / 91–100% perfect" problem our capped games hit, since there is no pass/fail, only a score gradient.
4. **Heat thresholds need playtesting** — the Section 3.1 distances are a starting scale, tuned for the contiguous US; Alaska/Hawaii targets produce very large distances and should be rare (they're a small slice of the 271 pool).
5. **Share legibility for non-players** — the share text names the **state** (not just the county) so the result reads to people who haven't played, preserving the viral conversion funnel.
6. **Daily collisions** — `hash % poolSize` can repeat a target before the 271 pool exhausts (same gap as Countle/Connections); acceptable for MVP, a seeded no-repeat permutation is a shared later polish.
7. **TopoJSON vs `counties.json` FIPS mismatch** — `counties-albers-10m.json` is pre-2022 topology and differs from `counties.json` by a handful of FIPS (e.g. new Alaska boroughs, Connecticut planning regions), and renders Alaska/Hawaii as insets. A guessed (or target) county absent from the TopoJSON must still be **scored** (distance/bearing come from `lat`/`lng`, which has full coverage) — it simply isn't *drawn* on the map. The engine must never depend on a county existing in the TopoJSON; the map layer degrades gracefully.

---

## 10. Success criteria

- A new visitor with no county knowledge can solve the daily target in a single session, learning US geography through the hot/cold + distance + arrow feedback, with no instructions.
- The national map visibly floods with heat as guesses accumulate — the map is unmistakably the star.
- The spoiler-free heat-emoji share (naming the state) is compelling enough to post and legible to non-players.
- Reuses Countle's data + map + geo + theme — the new game is mostly engine + front-end, no new data pipeline.
