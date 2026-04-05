# County Wars Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip County Wars from 7 routes to 1. The game becomes a daily pack-rip ritual on a map screen, with a 60-second quick battle for coins. Delete all other pages.

**Architecture:** Single `page.tsx` manages 4 overlay states (map, pack-opening, battle, quiz) via React state — no routing. Simplified `store.ts` for localStorage. Simplified `battle.ts` with only questions + resolveRound. Existing `CountyCard.tsx` and `USMap.tsx` kept as-is.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4, Supabase, localStorage.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/store.ts` | **Rewrite** | Simplified GameState: collection, coins, streak, pity, milestones, quiz. Remove campaign/daily/homeState. |
| `src/lib/battle.ts` | **Rewrite** | Questions array, simple resolveRound, cpuPickCard. Remove modifiers, synergies, abilities, combos. |
| `src/lib/supabase.ts` | **Modify** | Export `CARD_SELECT` and `parseCardRow`. Update PACK_TYPES to match spec. Remove `guaranteedCount`. |
| `src/app/page.tsx` | **Rewrite** | The ONLY page. Map + overlays for pack opening, battle, quiz. Two floating action buttons. |
| `src/components/CountyCard.tsx` | **Modify** | Add `isDaily` prop for County of the Day cyan ring. |
| `src/components/USMap.tsx` | **Keep** | No changes needed. |
| `src/app/battle/page.tsx` | **Delete** | |
| `src/app/campaign/page.tsx` | **Delete** | |
| `src/app/daily/page.tsx` | **Delete** | |
| `src/app/draft/page.tsx` | **Delete** | |
| `src/app/packs/page.tsx` | **Delete** | |
| `src/app/trivia/page.tsx` | **Delete** | |

---

### Task 1: Delete Old Pages

**Files:**
- Delete: `src/app/battle/page.tsx`
- Delete: `src/app/campaign/page.tsx`
- Delete: `src/app/daily/page.tsx`
- Delete: `src/app/draft/page.tsx`
- Delete: `src/app/packs/page.tsx`
- Delete: `src/app/trivia/page.tsx`

- [ ] **Step 1: Delete all 6 page files and their directories**

```bash
rm -rf s:/CivilWar/src/app/battle
rm -rf s:/CivilWar/src/app/campaign
rm -rf s:/CivilWar/src/app/daily
rm -rf s:/CivilWar/src/app/draft
rm -rf s:/CivilWar/src/app/packs
rm -rf s:/CivilWar/src/app/trivia
```

- [ ] **Step 2: Verify only page.tsx, layout.tsx, globals.css remain in app/**

```bash
ls s:/CivilWar/src/app/
```

Expected: `globals.css  layout.tsx  page.tsx`

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: delete campaign, draft, trivia, daily, packs, battle pages"
```

---

### Task 2: Rewrite store.ts

**Files:**
- Rewrite: `src/lib/store.ts`

- [ ] **Step 1: Rewrite store.ts with simplified GameState**

```typescript
"use client";

import { type CountyCard } from "./supabase";

export interface GameState {
  collection: CountyCard[];
  coins: number;
  streak: number;
  lastPackDate: string | null;
  lastQuizDate: string | null;
  lastQuizResult: boolean | null;
  pityCounter: number;
  totalPacksOpened: number;
  milestonesAwarded: number[];
  stateCompletions: string[];
}

const STORAGE_KEY = "county-wars-v2";

const DEFAULT_STATE: GameState = {
  collection: [],
  coins: 500,
  streak: 0,
  lastPackDate: null,
  lastQuizDate: null,
  lastQuizResult: null,
  pityCounter: 0,
  totalPacksOpened: 0,
  milestonesAwarded: [],
  stateCompletions: [],
};

export function loadState(): GameState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveState(state: GameState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Add cards to collection. Dupes give +25 coins each. New cards added. */
export function addCards(state: GameState, cards: CountyCard[]): GameState {
  const ownedFips = new Set(state.collection.map((c) => c.fips));
  const newCards = cards.filter((c) => !ownedFips.has(c.fips));
  const dupeCount = cards.length - newCards.length;

  const next = {
    ...state,
    collection: [...state.collection, ...newCards],
    coins: state.coins + cards.length * 10 + dupeCount * 25,
  };

  // Check milestones
  const MILESTONES = [50, 100, 150, 200, 300, 500, 1000, 1500, 2000, 2500, 3000, 3143];
  const uniqueCount = next.collection.length;
  for (const m of MILESTONES) {
    if (uniqueCount >= m && !next.milestonesAwarded.includes(m)) {
      next.milestonesAwarded = [...next.milestonesAwarded, m];
      // Milestone bonus will be handled by the caller (triggers milestone pack)
    }
  }

  // Check state completions
  const byState = new Map<string, number>();
  for (const c of next.collection) {
    byState.set(c.state_abbr, (byState.get(c.state_abbr) || 0) + 1);
  }
  for (const [abbr, count] of byState) {
    const total = STATE_COUNTY_COUNTS[abbr] || 999;
    if (count >= total && !next.stateCompletions.includes(abbr)) {
      next.stateCompletions = [...next.stateCompletions, abbr];
      next.coins += 500; // State Champion bonus
    }
  }

  return next;
}

/** Can the player open a free daily pack? */
export function canOpenDailyPack(state: GameState): boolean {
  if (!state.lastPackDate) return true;
  const last = new Date(state.lastPackDate).toDateString();
  const now = new Date().toDateString();
  return last !== now; // One per calendar day
}

/** Get time until next daily pack */
export function getNextPackTime(state: GameState): string | null {
  if (canOpenDailyPack(state)) return null;
  // Next pack available at midnight
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const diff = tomorrow.getTime() - now.getTime();
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

/** Get today's date string for deterministic daily content */
export function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** County counts per state for completion tracking */
export const STATE_COUNTY_COUNTS: Record<string, number> = {
  AL: 67, AK: 30, AZ: 15, AR: 75, CA: 58, CO: 64, CT: 8, DE: 3, DC: 1,
  FL: 67, GA: 159, HI: 5, ID: 44, IL: 102, IN: 92, IA: 99, KS: 105,
  KY: 120, LA: 64, ME: 16, MD: 24, MA: 14, MI: 83, MN: 87, MS: 82,
  MO: 115, MT: 56, NE: 93, NV: 17, NH: 10, NJ: 21, NM: 33, NY: 62,
  NC: 100, ND: 53, OH: 88, OK: 77, OR: 36, PA: 67, RI: 5, SC: 46,
  SD: 66, TN: 95, TX: 254, UT: 29, VT: 14, VA: 133, WA: 39, WV: 55,
  WI: 72, WY: 23,
};

/** US state full names */
export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin",
  WY: "Wyoming",
};
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd s:/CivilWar && npx next build 2>&1 | tail -5
```

Expected: Build may fail since `page.tsx` still imports old store types — that's fine. The store itself should have no TS errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/store.ts && git commit -m "refactor: simplify store.ts — remove campaign, daily, homeState"
```

---

### Task 3: Rewrite battle.ts

**Files:**
- Rewrite: `src/lib/battle.ts`

- [ ] **Step 1: Rewrite battle.ts — questions + simple resolveRound only**

```typescript
/**
 * Battle engine — simplified for quick 3-round battles.
 * No modifiers, synergies, abilities, or combos.
 */
import { type CountyCard } from "./supabase";

export type StatKey =
  | "stat_power"
  | "stat_resilience"
  | "stat_population"
  | "stat_terrain"
  | "stat_chaos"
  | "stat_culture";

export interface Question {
  stat: StatKey;
  text: string;
  icon: string;
}

export const QUESTIONS: Question[] = [
  { stat: "stat_power", text: "Which county is RICHER?", icon: "💰" },
  { stat: "stat_resilience", text: "Which county is HEALTHIER?", icon: "🏥" },
  { stat: "stat_population", text: "Which county has MORE PEOPLE?", icon: "👥" },
  { stat: "stat_terrain", text: "Which county is BIGGER?", icon: "📐" },
  { stat: "stat_chaos", text: "Which county is more DANGEROUS?", icon: "⚠️" },
  { stat: "stat_culture", text: "Which county is more EDUCATED?", icon: "🎓" },
];

/** Pick 3 random questions for a match */
export function getMatchQuestions(): Question[] {
  const shuffled = [...QUESTIONS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 3);
}

/** Resolve one round: higher stat wins, ties broken by total_score */
export function resolveRound(
  question: Question,
  playerCard: CountyCard,
  cpuCard: CountyCard
): { playerWins: boolean; playerVal: number; cpuVal: number } {
  const playerVal = playerCard[question.stat] as number;
  const cpuVal = cpuCard[question.stat] as number;

  if (playerVal !== cpuVal) {
    return { playerWins: playerVal > cpuVal, playerVal, cpuVal };
  }
  return { playerWins: playerCard.total_score >= cpuCard.total_score, playerVal, cpuVal };
}

/** CPU picks the card with the highest value for the question's stat */
export function cpuPickCard(hand: CountyCard[], question: Question): CountyCard {
  return hand.reduce((best, card) =>
    (card[question.stat] as number) > (best[question.stat] as number) ? card : best
  );
}

/** Get the real display value for a stat on a card */
export function getDisplayValue(card: CountyCard, stat: StatKey): string {
  switch (stat) {
    case "stat_power": return card.display_income || "N/A";
    case "stat_population": return card.display_population || "N/A";
    case "stat_terrain": return card.display_area || "N/A";
    case "stat_chaos": return card.display_disasters || "N/A";
    case "stat_resilience": return `Health ${card.stat_resilience}`;
    case "stat_culture": return `Edu ${card.stat_culture}`;
  }
}

/** Hash a string to a number (for date-based county-of-the-day) */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export const REWARDS = { battleWin: 25, battleLoss: 5, quizCorrect: 50 };
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/battle.ts && git commit -m "refactor: simplify battle.ts — questions + resolveRound only"
```

---

### Task 4: Update supabase.ts — Export Shared Utilities

**Files:**
- Modify: `src/lib/supabase.ts`

- [ ] **Step 1: Export CARD_SELECT and parseCardRow. Update PACK_TYPES to match spec.**

Changes to make:
1. Export `CARD_SELECT` as a named export
2. Export `parseCardRow` as a named export
3. Update `PACK_TYPES` to match the spec (Quick Pack 100⬡/3 cards, Regional 500⬡/5 cards/1 rare+, Legendary Crate 1000⬡/7 cards/1 epic+)
4. Remove `guaranteedCount` from `PackType` — all packs guarantee on the last slot only
5. Keep the `openPack` function but simplify: no `pityCount` parameter, just use `guaranteedFloor` on last card

The key changes in `PACK_TYPES`:
```typescript
export const PACK_TYPES: PackType[] = [
  { id: "daily", name: "Daily Pack", cardCount: 5, cost: 0, guaranteedFloor: "common", description: "Free once per day" },
  { id: "quick", name: "Quick Pack", cardCount: 3, cost: 100, guaranteedFloor: "common", description: "3 cards" },
  { id: "state", name: "State Pack", cardCount: 5, cost: 250, guaranteedFloor: "uncommon", description: "1 Uncommon+" },
  { id: "regional", name: "Regional Pack", cardCount: 5, cost: 500, guaranteedFloor: "rare", description: "1 Rare+" },
  { id: "legendary", name: "Legendary Crate", cardCount: 7, cost: 1000, guaranteedFloor: "epic", description: "1 Epic+" },
];
```

Remove `guaranteedCount` from the `PackType` interface. The last card slot always gets the `guaranteedFloor`.

Add `export` before the existing `CARD_SELECT` and `parseCardRow` definitions (they're currently non-exported).

- [ ] **Step 2: Verify the module exports compile**

```bash
cd s:/CivilWar && npx tsc --noEmit src/lib/supabase.ts 2>&1 | head -5
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase.ts && git commit -m "refactor: export CARD_SELECT/parseCardRow, update pack types"
```

---

### Task 5: Add County of the Day Border to CountyCard

**Files:**
- Modify: `src/components/CountyCard.tsx`

- [ ] **Step 1: Add `isDaily` prop and cyan ring variant**

In the `Props` interface, add:
```typescript
isDaily?: boolean;
```

In the front face `<div>`, add a conditional ring class. Change:
```
className={`absolute inset-0 rounded-xl border-2 ${RARITY_BORDER[card.rarity]} ...`}
```
to:
```
className={`absolute inset-0 rounded-xl border-2 ${card.rarity !== undefined && isDaily ? "border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.4)] ring-2 ring-cyan-400/30" : RARITY_BORDER[card.rarity]} ...`}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/CountyCard.tsx && git commit -m "feat: add isDaily prop for County of the Day border"
```

---

### Task 6: Rewrite page.tsx — The One Screen

**Files:**
- Rewrite: `src/app/page.tsx`

This is the biggest task. The page manages 4 overlay states via a `mode` state variable:

```typescript
type Mode = "map" | "pack" | "battle" | "quiz";
```

- [ ] **Step 1: Write the complete page.tsx**

The page has these sections:

**1. Top bar** (always visible): county count, coins, streak

**2. Map** (always visible behind overlays): `USMap` component. Tap state → slide-up detail panel.

**3. Bottom action buttons** (visible when `mode === "map"`):
- 📦 "Open Daily Pack" / countdown timer
- Paid pack buttons (shown when daily is on cooldown)
- ⚔️ "Quick Battle — 25⬡"
- ❓ small quiz icon

**4. Pack opening overlay** (`mode === "pack"`): Full-screen overlay with pack rip flow. Uses `openPack` from supabase.ts. County of the Day highlighted with `isDaily`. After collect → mode switches back to "map".

**5. Battle overlay** (`mode === "battle"`): Full-screen overlay. 3 auto-selected cards from collection. 3 rounds of question → pick → resolve. Result → coins → "Battle Again" or "Back to Map".

**6. Quiz overlay** (`mode === "quiz"`): Small centered card showing County of the Day + one multiple-choice question. Answer → result → share button → dismiss.

The page imports:
- `USMap` from `@/components/USMap`
- `CountyCard` from `@/components/CountyCard`
- `{ loadState, saveState, addCards, canOpenDailyPack, getNextPackTime, getTodayString, STATE_COUNTY_COUNTS, US_STATES }` from `@/lib/store`
- `{ openPack, PACK_TYPES, supabase, CARD_SELECT, parseCardRow, type CountyCard as CardType }` from `@/lib/supabase`
- `{ getMatchQuestions, resolveRound, cpuPickCard, getDisplayValue, hashString, REWARDS, type Question }` from `@/lib/battle`

**County of the Day logic:**
```typescript
// Deterministic county-of-the-day from date
const todayHash = hashString(getTodayString());
// Use hash to pick a FIPS from the card pool — fetched once on mount
```

The page.tsx will be ~400-500 lines. Write it complete — no placeholders.

Key state variables:
```typescript
const [gameState, setGameState] = useState<GameState | null>(null);
const [mode, setMode] = useState<Mode>("map");
const [statePanel, setStatePanel] = useState<string | null>(null); // state abbr for detail panel

// Pack state
const [packCards, setPackCards] = useState<CardType[]>([]);
const [flippedIdx, setFlippedIdx] = useState<Set<number>>(new Set());
const [packPhase, setPackPhase] = useState<"rip" | "reveal" | "summary">("rip");

// Battle state
const [battleQuestions, setBattleQuestions] = useState<Question[]>([]);
const [battleRound, setBattleRound] = useState(0);
const [battleHand, setBattleHand] = useState<CardType[]>([]);
const [cpuHand, setCpuHand] = useState<CardType[]>([]);
const [battleScore, setBattleScore] = useState({ player: 0, cpu: 0 });
const [battleResult, setBattleResult] = useState<...>(null);

// Quiz state
const [dailyCounty, setDailyCounty] = useState<CardType | null>(null);
const [quizOptions, setQuizOptions] = useState<string[]>([]);
const [quizAnswer, setQuizAnswer] = useState<number | null>(null);
const [quizCorrectIdx, setQuizCorrectIdx] = useState(0);

// County of the Day FIPS
const [cotdFips, setCotdFips] = useState<string | null>(null);
```

- [ ] **Step 2: Verify build**

```bash
cd s:/CivilWar && npx next build 2>&1 | tail -15
```

Expected: Build succeeds with only `/` route.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx && git commit -m "feat: rewrite page.tsx as single-screen game — map, packs, battle, quiz"
```

---

### Task 7: Test End-to-End Flow

**Files:** None (testing only)

- [ ] **Step 1: Reset localStorage and verify initial state**

Open browser to `http://localhost:4000`. Verify:
- Map shows with all states at 0% (gray)
- Top bar shows "0 / 3,143" counties, 500⬡, streak 0
- "Open Daily Pack" button glows
- "Quick Battle" button shows "25⬡"
- ❓ quiz icon visible

- [ ] **Step 2: Open a daily pack**

Tap "Open Daily Pack". Verify:
- Pack overlay appears
- 5 cards face-down
- Tap each to flip (sorted common → legendary)
- One card has cyan County of the Day border
- Summary shows new vs dupe count
- "Collect" button → map updates with new counties colored on their state tiles
- Daily pack button now shows countdown timer

- [ ] **Step 3: Play a quick battle**

Tap "Quick Battle". Verify:
- 3 cards auto-selected from collection shown
- Question appears ("Which county is BIGGER?")
- Tap a card → CPU card revealed → round result shown
- After 3 rounds → "VICTORY +25⬡" or "DEFEAT +5⬡"
- "Battle Again" works instantly
- "Back to Map" returns to map with updated coin count

- [ ] **Step 4: Take the daily quiz**

Tap ❓. Verify:
- County of the Day card shown with stats
- One question with 4 options
- Correct answer → +50⬡
- Can't replay (shows result if already completed)

- [ ] **Step 5: Buy a paid pack**

Grind 3-4 battles to earn ~100⬡. Buy a Quick Pack. Verify:
- 3 cards revealed
- Coins deducted
- New counties added to map

- [ ] **Step 6: Verify state tap detail panel**

Tap a state on the map. Verify:
- Slide-up panel shows state name, X/Y counties, progress bar
- Owned cards listed in compact mode
- Dismiss by tapping outside

- [ ] **Step 7: Verify persistence**

Refresh the page. Verify:
- Collection, coins, streak all preserved
- Daily pack shows cooldown (already opened today)
- Quiz shows "already completed" state

- [ ] **Step 8: Commit final verification**

```bash
git add -A && git commit -m "test: verify end-to-end game flow"
```

---

## Summary

| Task | Description | Files Changed |
|------|-------------|---------------|
| 1 | Delete 6 old pages | -6 files |
| 2 | Rewrite store.ts | 1 file |
| 3 | Rewrite battle.ts | 1 file |
| 4 | Update supabase.ts exports | 1 file |
| 5 | Add isDaily to CountyCard | 1 file |
| 6 | Rewrite page.tsx (the whole game) | 1 file |
| 7 | End-to-end testing | 0 files |

Total: 6 pages deleted, 4 files rewritten/modified, 1 new feature (County of the Day border). Net code reduction: ~170K → ~40K.
