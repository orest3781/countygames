# Countle — Design Spec

**Date:** 2026-06-23
**Status:** Approved design, pre-implementation
**Supersedes:** the current County Wars card/gacha game (`src/`), which is retired except for reused components noted below.

---

## 1. Summary

**Countle** is a once-per-day county-deduction game built on the existing County Wars dataset (all 3,144 US counties, each with 6 real-data stats). It is the Wordle/Worldle playbook applied to US geography: every player gets the **same mystery county each day**, has **6 guesses**, and after each guess sees how the mystery county compares to their guess across **6 real stats plus geographic distance/direction**. Solving fills in your map of America. A spoiler-free emoji share grid drives virality.

The product goal (set by the project owner) is **daily retention + virality**, web-first and mobile-responsive, buildable solo on the existing Next.js stack. Only the **county data is sacred**; all prior gameplay (packs, gacha, stat-pick battle) is replaceable.

### Why this design (evidence basis)

A deep-research pass (23 sources, 25 claims adversarially verified 3-vote, run `wf_4f11be49-c35`) produced four high-confidence, primary-sourced findings that this design implements directly, and one set of **refuted** claims that this design deliberately avoids:

- **Intrinsic integration** (Habgood & Ainsworth 2011, peer-reviewed): binding the data to the *core* action — not bolted-on quiz trivia — drove ~7× longer voluntary play. → The 6 stats **are** the deduction mechanic.
- **Strict once-per-day cadence** (Wordle/Worldle/NYT): one shared puzzle, midnight reset, no endless play, no push spam. "Retention is king" (NYT 7-day/30-day return). → Daily mystery county.
- **Spoiler-free emoji share grid** (Wordle 90→2M players in ~10 weeks; copied by Worldle & Connections): the single transferable virality mechanic. → Per-guess share grid.
- **Quantified proximity feedback over a small guess budget** (Worldle: distance + direction + proximity % across 6 guesses): → per-stat warmer/colder + geo distance/bearing.
- **Refuted (0-3 votes), avoided here:** "pack-opening / the collection loop is the core retention driver," "collection carries the game despite shallow battles." → Collection is a *skill-earned reward*, never a gacha and never the retention engine.

Top Trumps' "unbeatable card" balance failure mode does **not** apply: Countle is deduction, not stat-combat, and the stats are already percentile-normalized (0–100), not raw.

---

## 2. Core loop

1. Player opens the app. One **mystery county** is active for the current day, identical for all players.
2. Player has **6 guesses**. Each guess is any of the 3,144 counties (typed, with autocomplete). Obscure counties are valid *guesses* (probes) but are never the *answer*.
3. After each guess, the player receives feedback (Section 4) and the answer's map art de-blurs one step.
4. Win = guessing the exact county within 6 tries. Loss = 6 wrong guesses, then the answer is revealed.
5. Win or lose, the player gets a **share grid** and updated stats/streak. Solved counties fill with their region color on the map (§7).
6. Next puzzle unlocks at the daily reset.

**One puzzle per day. No replay of today. No endless mode in MVP** (archive/practice is Phase 3).

---

## 3. The answer pool (~300 famous counties)

- The daily answer is drawn only from **recognizable counties**, to keep the game accessible and reduce rage-quit. Obscure counties remain fully usable as guesses.
- **Definition:** counties whose `rarity` is `epic` or `legendary` (~315 in the current data), which already encode prominence. This is the MVP definition; a hand-curated "famous list" can refine it later.
- **Constraint:** every county in the answer pool **must have map art** (for the progressive reveal) and ideally a notable-person clue. The answer pool is therefore `(rarity ∈ {epic, legendary}) ∩ (has art PNG)`. Verifying art coverage of the pool is an implementation task (Section 10).
- **Daily selection:** deterministic and shared. `index = hash(dateKey) % poolSize`, with the pool sorted by `fips` for stability. `dateKey` is the **UTC date** (`YYYY-MM-DD`) so every player worldwide gets the same county the same day (maximizes the "did you get today's?" social effect). Reusing the existing `hashString(getTodayString())` pattern from `QuizOverlay`.
- Pool cycles without repeats until exhausted (~300 days), then reshuffles.

---

## 4. Feedback model (the mechanic)

After each guess, comparing the **mystery** county to the **guessed** county:

### Per-stat (all 6, every guess)
For each stat (Wealth, Health, People, Land, Danger, Education), compare percentile values:
- `delta = mystery.stat - guess.stat` (both 0–100).
- **Direction:** `↑` mystery higher, `↓` mystery lower.
- **Magnitude:** `|delta| ≤ MAG_THRESHOLD` → single arrow; `|delta| > MAG_THRESHOLD` → double arrow (`↑↑`/`↓↓`). `MAG_THRESHOLD` starts at **33** (tunable).
- **Match:** `|delta| ≤ CLOSE_THRESHOLD` (start **8**) → shown green/"close" (used by the share grid).

Stat labels are reframed for clarity (internal field → label): `stat_power`→**Wealth**, `stat_resilience`→**Health**, `stat_population`→**People**, `stat_terrain`→**Land**, `stat_chaos`→**Danger**, `stat_culture`→**Education**.

### Geographic (every guess)
- **Distance:** haversine between guess and mystery coordinates (county-seat lat/lng), shown in miles.
- **Direction:** initial bearing → nearest of 8 compass arrows pointing from guess toward mystery.

### Progressive reveal
- **Map art** starts heavily blurred (guess 1) and sharpens each guess; fully clear on solve/reveal. Blur schedule e.g. `[24, 18, 12, 8, 4, 2, 0]px`. In the *Bold Pop Almanac* layout (§7) this lives as a small **accent tile** that de-resolves per guess; the full-bleed art reveal is saved for the win.
- **Notable person** unlocks as a lifeline clue at **guess 5** if available ("Named after / birthplace of …").

### Example (text)
```
Your guess: COOK COUNTY, IL                    Guess 2 / 6
 💰 Wealth     ↓     🏥 Health  ↑↑    👥 People  ↓↓
 📐 Land       ↑     ⚠️ Danger  ↑     🎓 Education ↓
 📍 1,740 mi   ↙ (southwest)
```

---

## 5. Share grid (virality)

Spoiler-free. One row per guess; **6 squares per row**, one per stat, colored by that stat's closeness on that guess:
- 🟩 green = within `CLOSE_THRESHOLD`, 🟨 yellow = within `MAG_THRESHOLD`, ⬛ = far.
- The grid encodes the player's deductive path and difficulty; it **never reveals the county**.

```
Countle #247   4/6   🔥 12
🟨⬛⬛🟩🟨⬛
🟩🟨⬛🟩🟩🟨
🟩🟩🟨🟩🟩🟩
🟩🟩🟩🟩🟩🟩
countle.app
```
Copy-to-clipboard (text + emoji), like Wordle. A rendered image share is a later enhancement.

---

## 6. Collection & progression

### Two-layer US map (reuses `USMap`)
- 🎨 **Solved (region color):** the daily answer, once solved, permanently fills with its region-palette color (§7) — the US map becomes a saturated mosaic over time. Answer pool ≈ 300 → a year-long "collect all landmarks" Pokédex arc.
- ✨ **Encountered (dim):** any county the player has ever typed as a guess lights faintly (light grey) — fast early-progress fill and a reward for exploring with obscure probes.
- Progress readouts: `X / ~300 landmarks`, `X / 3,144 encountered`, per-state completion.

### Retention / identity layer (each = a confirmed research lever)
- 🔥 **Daily streak** (consecutive days solved) + max streak.
- 📊 **Stats modal** (Wordle pattern): guess distribution (1/6…6/6, plus fail), win %, current/max streak, games played.

---

## 7. Visual design — "Bold Pop Almanac"

**Chosen direction (owner, 2026-06-24):** bright, editorial, NYT-Games-clean *with personality* — deliberately **not** dark-gamer. The cinematic AI renders are used as a **payoff/reward**, not full-bleed wallpaper. Excitement comes from **bold color, big type, and snappy motion**, with the full-art reveal saved for the win.

### Design principles
- **Clean during play, gorgeous at the win.** The play screen is type-forward and bright; the heavy cinematic render is revealed full-size only when you solve.
- **Color carries meaning twice:** (a) Wordle's universal green/yellow/grey for stat closeness *during play*; (b) the 8 **region palettes** (`data/.pipeline-config.json` `REGION_MAP`) as *identity* — used in the win wash and the collection map.
- **Motion is the excitement budget.** Bars slam and numbers count up on each guess; the compass snaps to bearing; the win triggers a region-color confetti wash. Springy easing, no slow cinematic fades.
- **Big, confident type.** Heavy geometric/grotesque display face for the wordmark + county name; tabular-figure numerals so stat numbers align and animate cleanly.

### Type & color tokens
- **Display face:** a heavy grotesque/geometric (e.g. Archivo Black / Clash Display / similar, self-hosted) — wordmark, county name, big numerals.
- **Body/UI:** existing system sans; tabular figures for all stat numbers.
- **Neutrals:** warm off-white background (almanac paper, not pure white); near-black ink. Bright, not dark.
- **Feedback colors (universal, fixed):** 🟩 close · 🟨 ballpark · ⬛/grey far — never region-tinted (readability + share-grid consistency).
- **Region palettes (identity):** the 8 `REGION_MAP` moods drive the win wash + map fill (Southwest terracotta/turquoise; Pacific emerald/Pacific-blue; New England slate-blue/amber; etc.).

### Screen: the daily round (play)
```
┌──────────────────────────────────────┐
│ COUNTLE             #142   🔥7   📊 ↗  │  ← wordmark · puzzle # · streak · stats/share
│                                        │
│  ┌────────┐  today's mystery           │  ← small accent tile: pixelated art swatch,
│  │ ▓▒░ ?  │  guess 3 of 6              │    de-resolves one notch per guess
│  └────────┘                            │
│                                        │
│  Wealth     ▮▮▮▮▮▮▮○○○   72  ↑          │  ← chunky bars · big tabular numbers
│  Health     ▮▮▮▮▮○○○○○   48  ↓↓         │    green/yellow/grey by closeness
│  People     ▮▮▮▮▮▮○○○○   55  ↑          │    slam-in + count-up on each guess
│  Land       ▮▮▮○○○○○○○   24  ↓          │
│  Danger     ▮▮▮▮▮▮▮▮○○   80  ↑↑         │
│  Education  ▮▮▮▮▮○○○○○   49  ↓          │
│                                        │
│  ↗  412 mi northeast                    │  ← bold compass glyph + distance
│  〔 name a county … 〕                    │  ← fat pill input w/ autocomplete
│                                        │
│  prior guesses ▸ compact stat strips    │
└──────────────────────────────────────┘
```

### Screen: the win (the payoff)
- The accent tile **explodes to full-bleed** — the county's cinematic render resolves to crisp.
- The screen **floods with the county's region palette**; region-color confetti; mobile haptic thump.
- County name in huge display type + state + county seat; one flavor line.
- "Solved in 3! 🔥 streak 8" → Share button (emoji grid, §5).
- **Loss variant:** same reveal, "The answer was …" in grey, streak resets.

### Screen: the collection map (bright mosaic)
- Reuses `USMap`, recolored for Bold Pop: solved counties fill with their **region color** (the US becomes a saturated patchwork over time); encountered-but-unsolved = light grey; untouched = faint paper.
- Replaces the earlier "gold star" treatment — region-color fill is more on-brand and more satisfying as it accumulates.
- Tap a solved county → re-open its full art card. Region-completion readouts (e.g. "Southwest 18 / 41").

### Motion spec (where the "exciting" goes)
- **Guess submit:** bars animate width + number count-up (~350 ms, spring); arrows pop; compass needle snaps.
- **Art de-resolve:** accent tile steps down the blur schedule (§4) with a quick crossfade.
- **Win:** tile → full-bleed scale (~500 ms) → region-color wash → confetti burst → haptic.
- **Map open:** each newly-solved county does a single color-pop pulse.

### Reuse note
`CountyCard` is repurposed as the **win reveal** (full art + name + flavor) and the **map detail** view. `USMap` is recolored (region-fill) rather than rebuilt.

---

## 8. Architecture

**MVP needs no database.** The entire county dataset ships as a **static bundle**; daily selection is deterministic from the date; state is localStorage. The deleted Supabase project is **off the MVP critical path** — it returns only in Phase 2.

- **Frontend:** existing Next.js 16 + React 19 + Tailwind 4 app, one game route.
- **Data:** `public/data/counties.json` (all 3,144). Art as static files (`public/art/{fips}.png` or CDN), lazy-loaded.
- **Game logic:** client-side (guess resolution, feedback, daily selection).
- **Persistence:** localStorage key `countle-v1`.

### Reuse / repurpose / retire
| Keep | Repurpose | Retire |
|------|-----------|--------|
| `USMap` (two-layer map) | `QuizOverlay` daily-hash pattern | pack/gacha overlays |
| `CountyCard` (reveal display) | `store.ts` persistence pattern | `battle.ts` stat-pick combat |
| data pipeline (stages 1–5) | Next/Tailwind setup | `supabase.ts` pack logic (MVP) |

### Data model — `public/data/counties.json`
Map of `fips → CountyEntry`:
```ts
interface CountyEntry {
  fips: string;            // 5-digit zero-padded
  name: string;            // "Cook County"
  state_abbr: string;      // "IL"
  county_seat: string;     // "Chicago"
  lat: number; lng: number;// county-seat coordinates (geo feedback)
  stats: {                 // percentile 0–100
    wealth: number; health: number; people: number;
    land: number; danger: number; education: number;
  };
  display: {               // human-readable for the reveal
    income: string; population: string; area: string;
    disasters: string; health: string; education: string;
  };
  rarity: "common"|"uncommon"|"rare"|"epic"|"legendary"; // answer-pool tiering
  hasArt: boolean;         // art availability
  notable_person?: string;
  notable_person_desc?: string;
  flavor?: string;
}
```

### localStorage state — `countle-v1`
```ts
interface CountleState {
  schemaVersion: 1;
  lastPlayedDateKey: string | null;     // UTC YYYY-MM-DD
  today: {                              // cleared on date rollover
    dateKey: string;
    guesses: string[];                  // fips guessed today, in order
    solved: boolean;
    finished: boolean;
  } | null;
  streak: number;
  maxStreak: number;
  gamesPlayed: number;
  guessDistribution: number[];          // index 0..5 = solved in N+1; separate fail count
  fails: number;
  solvedCounties: string[];             // gold (deduped fips)
  encounteredCounties: string[];        // dim (deduped fips)
}
```

### Regenerating the dataset (the one prerequisite)
The computed stats/display lived only in the deleted Supabase `cards`/`counties` tables. AI-expensive artifacts survived locally (2,333 art PNGs, `descriptions.json`, `enrichment.json`, `wiki.json`). Recovery is the **cheap** pipeline stages, retargeted to a static file:
1. Re-fetch federal sources (`pipeline/sources/00–05`) — free APIs.
2. Recompute the 6 stats (`pipeline/derive/compute-stats.ts`).
3. Pull lat/lng + county seats from the gazetteer (`pipeline/sources/00-gazetteer.ts`).
4. **New export target:** assemble `public/data/counties.json` (instead of, or in addition to, Supabase).
No AI regeneration; no live DB for MVP.

---

## 9. Scope

### MVP (first shippable slice)
Daily mystery county · 6 guesses · all-county autocomplete with same-name disambiguation · 6-stat + geo feedback · progressive art reveal · notable-person lifeline at guess 5 · win/lose + answer reveal · spoiler-free share grid · daily streak · Wordle-style stats modal · two-layer US map. **localStorage, anonymous, static data, no backend.**

### Out of MVP (later phases)
- **Phase 2:** optional Supabase account → cross-device sync + **global daily leaderboard** (rank by guesses used + solve time on the shared daily county).
- **Phase 3:** archive/practice mode (replay past days); soft monetization.

### Monetization — deferred
Ship free and anonymous; grow first (the research is emphatic that gating/aggression kills the "human" feel behind viral spread). *Later, only if retention proves out:* light non-intrusive ads, a small premium for archive/practice (Worldle's model), or optional cosmetic map themes. **Never sell power** — there is none to sell.

---

## 10. Risks & open questions

1. **Difficulty calibration.** "Famous-only pool" + full 6-stat feedback may be too easy. `MAG_THRESHOLD`/`CLOSE_THRESHOLD` and which clues appear when are the tuning knobs; needs playtesting. Mitigation: tune thresholds; consider hiding magnitude (single-arrow only) if too easy.
2. **Missing display values for Health & Education.** The prior build showed only percentile scores for these two stats (no real-world display string). The reveal and `display.health`/`display.education` need real values derived in `compute-stats.ts` (e.g., life expectancy, bachelor's-degree %). Flagged in the earlier audit too.
3. **Art coverage of the answer pool.** Only 2,333/3,144 counties have art. The answer pool must be `∩ hasArt`; verify all ~300 landmarks have PNGs, else render the gaps (needs ComfyUI) or narrow the pool.
4. **Bundle size.** `counties.json` for 3,144 counties may be several MB raw (≈1 MB gzipped). If too heavy, split into a light index (name/state/fips/coords/stats) shipped eagerly + per-county detail (person/flavor) lazy-loaded.
5. **Same-name disambiguation.** ~30 "Washington County"s etc. — autocomplete must show `County, ST` and key on fips.
6. **UTC vs local daily reset.** Spec chooses UTC (global shared county). Revisit if a local-midnight feel is preferred (Worldle uses local).
7. **Spoiler leakage check.** Confirm the 6-square share grid cannot be reverse-engineered to the answer (it encodes the player's guesses' closeness, not the answer's identity — believed safe, like Wordle).

---

## 11. Success criteria

- A new visitor can play a full daily round, with zero onboarding, in under 60 seconds.
- Solving feels like deduction over real data, not luck.
- The share grid is compelling enough to post unprompted.
- Target retention metric (NYT standard): 7-day and 30-day daily return.
