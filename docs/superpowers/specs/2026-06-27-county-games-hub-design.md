# County Games Hub — Design Spec

**Date:** 2026-06-27
**Status:** Approved design, pre-implementation
**Relationship:** The front door for the daily-game suite — **Countle**, **County Connections**, and **Warmer**. It ties the three existing games into one product. Reuses the locked `public/data/counties.json` (none needed directly), each game's existing localStorage + loaders, and the Bold Pop Almanac theme.

---

## 1. Summary

**County Games** is a Bold Pop landing page at `/` that is the suite's front door: three game cards, each showing **today's status** (Play / Continue / ✓ done) and the player's **streak**, linking into the game. **Countle relocates from `/` to `/countle`** (joining `/connections` and `/warmer`); `/` becomes the hub. Static + localStorage, no backend.

This closes the suite's one structural gap — a visitor currently lands straight in Countle with no way to discover Connections or Warmer.

**Owner decisions (2026-06-27):** suite name **"County Games"**; hub at `/`, Countle → `/countle`; per-game back-link to the hub is **in MVP scope**.

---

## 2. Route changes

- `src/app/page.tsx` — now renders `<HubApp/>` (was `<CountleApp/>`).
- `src/app/countle/page.tsx` — **new**, renders `<CountleApp/>`. Countle's component, daily logic, and `countle-v1` localStorage are unchanged; only the URL moves (the daily puzzle is date-based, not route-based, so there is no functional impact).
- `/connections`, `/warmer` — unchanged.
- Any hardcoded `/` links inside the game components that assumed Countle lived at the root are repointed (grep `href="/"` / `router.push("/")` during implementation; repoint to `/countle` or the hub as appropriate). The back-link (Section 4) points each game to `/`.

---

## 3. Status logic — `src/lib/hub/status.ts` (pure, TDD'd)

The one piece of logic. `suiteStatus(storage, dateKey)` reads each game's existing localStorage through its own loader (all three already accept a `StorageLike`) and maps each game's `today`/`streak` into a uniform card model.

```ts
type GameId = "countle" | "connections" | "warmer";
type PlayStatus = "new" | "playing" | "done";

interface GameStatus {
  id: GameId;
  name: string;          // "Countle" | "County Connections" | "Warmer"
  tagline: string;
  href: string;          // "/countle" | "/connections" | "/warmer"
  accent: string;        // Bold Pop accent hex
  streak: number;
  status: PlayStatus;
  resultLabel: string | null; // e.g. "solved in 2", "missed", "gave up" — null unless done
}

function suiteStatus(storage: StorageLike, dateKey: string): GameStatus[]; // order: countle, connections, warmer
```

Per-game mapping (using each game's loader + state shape):

- **Countle** (`loadStateFrom`, `../countle/persistence`; state `today: { dateKey, guesses, solved, finished } | null`, `streak`):
  `done` if `today?.dateKey === dateKey && today.finished` → result `today.solved ? "solved in " + today.guesses.length : "out of guesses"`; `playing` if same-day, not finished, `guesses.length > 0`; else `new`.
- **County Connections** (`loadConnectionsState`, `../connections/persistence`; state `today: { dateKey, submissions, solvedColors, mistakes, finished, won } | null`, `streak`):
  `done` if `today?.dateKey === dateKey && today.finished` → result `today.won ? "solved" : "missed"`; `playing` if same-day, not finished, `submissions.length > 0`; else `new`.
- **Warmer** (`loadWarmerState`, `../warmer/persistence`; state `today: { dateKey, guesses, solved, gaveUp } | null`, `streak`):
  `done` if `today?.dateKey === dateKey && (today.solved || today.gaveUp)` → result `today.solved ? "found in " + today.guesses.length : "gave up"`; `playing` if same-day, not solved/gaveUp, `guesses.length > 0`; else `new`.

`streak` is each state's `.streak`. Name/tagline/href/accent are static per game. Pure given `(storage, dateKey)` — vitest-tested with an in-memory `StorageLike` across new/playing/done/stale-day cases.

Static card metadata:
| id | name | tagline | href | accent |
|----|------|---------|------|--------|
| countle | Countle | Guess the mystery county from its six stats | /countle | `#16a34a` |
| connections | County Connections | Find the four hidden groups of sixteen | /connections | `#a96fc0` |
| warmer | Warmer | Hot or cold — find today's county on the map | /warmer | `#dc2626` |

---

## 4. UI (Bold Pop) — `src/components/hub/`

- `HubApp` — orchestrator (`"use client"`): on mount reads `suiteStatus(window.localStorage, dateKeyUTC(new Date()))`, renders the wordmark + three `GameCard`s. (Reads localStorage in an effect to avoid SSR/hydration mismatch — render a neutral "new" state first, then hydrate the real status, mirroring how the game apps gate on a `ready` flag.)
- `GameCard` — one game: big display-font name, tagline, the game's accent (left border / chip), a status row (`🔥 <streak>` · `Play` / `Continue` / `✓ <resultLabel>`), and a per-game visual motif (Countle = stat bars; Connections = the 🟨🟩🟦🟪 blocks; Warmer = cold→hot swatches). The whole card is a link to `href`.
- Wordmark "**COUNTY GAMES**" + tagline "Three daily games on every US county."
- **Back-link:** a small "‹ County Games" link added at the top of each game (`CountleApp`, `ConnectionsApp`, `WarmerApp`) routing to `/`.

Route: `src/app/page.tsx` → `<HubApp/>`. Reuses theme tokens (`PAPER`/`INK`), fonts, and the page background. Uses Next's `<Link>` for navigation.

---

## 5. Architecture / reuse

- **Static + localStorage, no backend** (identical to the games).
- **Reuse:** each game's loader (`loadStateFrom`/`loadConnectionsState`/`loadWarmerState`) + state types; `dateKeyUTC` from `@/lib/countle/daily`; the Bold Pop theme/fonts; Next `<Link>`.
- **New:** `src/lib/hub/status.ts` (pure, tested) + `src/components/hub/` (`HubApp`, `GameCard`) + the route relocation. The back-link is a tiny shared element added to the three game orchestrators.
- No new data assets, no content pipeline.

---

## 6. Scope

**MVP:** the hub at `/` with three status-aware game cards (name, tagline, accent + motif, today-status, streak, CTA), Countle relocated to `/countle`, and the "‹ County Games" back-link on each game. localStorage, anonymous, static.

**Later:** a "you've played N/3 today" suite-completion nudge; animated card reveals; a combined suite streak; the eventual accounts/leaderboard (shared Phase 2).

---

## 7. Risks & open questions

1. **SSR/hydration:** localStorage isn't available during server render. `HubApp` must read status in a client effect and render a stable initial (all-`new`, streak 0) state first, then hydrate — otherwise React hydration mismatches. (Same gating the game apps already use.)
2. **Countle relocation link rot:** anything that assumed Countle at `/` (internal links, share-text URLs) must be repointed. Mitigation: grep during implementation; the games' share text uses `county.games` (a brand string, not a route), so shares are unaffected.
3. **State-shape coupling:** the hub reads each game's `today`/`streak` shape directly. If a game's state schema changes, the hub's adapter must change too. Mitigation: the adapter lives in one tested module; each game's loader (not raw key access) is used, so key/parse changes are absorbed.
4. **First-time visitor:** lands on the hub (all three "Play") rather than straight into a game — intended (it's the front door), and the cards make the first click obvious.

---

## 8. Success criteria

- A visitor lands on `/`, immediately sees the three games with today's status + streaks, and one click starts any game.
- Returning mid-day, the hub shows accurate Continue/✓ status per game and current streaks.
- Countle plays identically at `/countle`; `/connections` and `/warmer` unchanged; each game can return to the hub.
- The status logic is pure and vitest-tested; the rest is presentational. No backend, no new data.
