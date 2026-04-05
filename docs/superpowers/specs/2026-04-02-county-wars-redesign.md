# County Wars Redesign Spec

**Date:** 2026-04-02
**Status:** Approved
**Summary:** Strip County Wars down to a daily pack-rip ritual with a map collection screen and a 60-second quick battle for coins. One screen. Two buttons. One addiction.

---

## Core Identity

County Wars is a daily pack-rip ritual where you fill a map of America. The map is the game. Packs are the ritual. Battles are a coin machine. Everything else is cut.

## Core Loop

```
Open app → Rip daily pack → Watch map light up → Battle for coins → Buy more packs → Come back tomorrow
```

---

## The Map Screen (Only Screen)

The app has ONE route: `/`. No navigation bar. No other pages.

### Layout
- **Center:** US state tile grid (existing `USMap.tsx` component), colored by collection progress per state (gray → green → blue → purple → gold as completion increases)
- **Top bar:** County count ("847 / 3,143"), coin balance, streak counter (flame icon + day count)
- **Bottom floating buttons:**
  - 📦 "Open Daily Pack" — glows when available, shows countdown timer ("4h 23m") when on cooldown
  - ⚔️ "Quick Battle" — always available, shows "25⬡" reward label
- **Corner icon:** ❓ County of the Day quiz (small, unobtrusive)

### State Tap Interaction
- Tap a state tile → slide-up panel from the bottom
- Panel shows: state name, "X / Y counties collected", progress bar
- Scrollable list of owned county cards from that state (using existing `CountyCard` component in compact mode)
- If 100% complete: gold border on tile, "State Champion!" badge displayed, +500⬡ one-time bonus

### What's NOT on the screen
- No campaign link
- No draft link
- No trivia link
- No separate battle or packs routes
- No nav bar

---

## Daily Pack Rip

The centerpiece of the game. One free pack every 24 hours (not 8 hours — once per day to create scarcity).

### Pack Opening Flow
1. Player taps "Open Daily Pack" button
2. Pack appears centered on screen (overlay on top of map)
3. Tap to rip — 5 cards slide out face-down
4. Tap each card to flip (sorted common → legendary for crescendo)
5. After all revealed: summary shows new vs duplicate count
6. "Collect" button — new counties animate onto the map with a flash on their state tile
7. Overlay dismisses, map is updated

### County of the Day
- One card in every daily pack is the **County of the Day** — the same county for ALL players
- Highlighted with a distinct border/glow (different from rarity glow — a "daily" indicator)
- This is the social hook — everyone gets the same featured county
- If the player already owns this county, they still see it highlighted and get the dupe bonus

### Streaks
- Consecutive daily pack opens tracked as a streak (1, 2, 3... days)
- Day 7 streak: bonus premium pack (7 cards, 1 rare+ guaranteed) awarded automatically
- Streak resets to 0 if a day is missed
- Streak counter shown in top bar

### Milestone Packs
- Every 50th unique county collected triggers a Milestone Pack
- 7 cards, 1 rare+ guaranteed
- Milestones: 50, 100, 150, 200, 300, 500, 1000, 1500, 2000, 2500, 3000, 3143
- Milestone notification overlays on the map

### Pity System
- Soft pity at 30 packs without epic+: epic rate increases +3% per pack
- Hard pity at 40 packs: guaranteed epic+
- Display: simple text under pack button — "Rare+ guaranteed in X packs"
- Pity counter persists in localStorage

### Pack Types (purchasable with coins)
| Pack | Cost | Cards | Guarantee |
|------|------|-------|-----------|
| Daily Pack | Free (1/day) | 5 | None |
| Quick Pack | 100⬡ | 3 | None |
| State Pack | 250⬡ | 5 | 1 Uncommon+ |
| Regional Pack | 500⬡ | 5 | 1 Rare+ |
| Legendary Crate | 1000⬡ | 7 | 1 Epic+ |

When the daily pack is on cooldown, the "Open Daily Pack" button changes to show the cooldown timer and the paid pack options appear as a secondary row of buttons below it.

---

## Quick Battle (60-Second Coin Machine)

Battles exist to earn coins. They are fast, simple, and endlessly replayable.

### Format
- 3 rounds, ~60 seconds total
- 3 cards auto-selected from player's collection
- CPU gets 3 cards at similar power level (tier-matched from database)

### Round Flow
1. Question appears: "Which county is BIGGER?" (random from the 6 question types)
2. Player's 3 cards shown with the relevant stat value displayed as a badge below each
3. Player taps their best card
4. CPU card revealed next to player's card
5. Higher stat value wins the round (ties broken by total_score)
6. 1-second result display, then next round

### Scoring
- Win 2 of 3 rounds: Victory → +25⬡
- Win 1 or 0: Defeat → +5⬡
- Coins saved to localStorage immediately

### After Match
- Result screen: "VICTORY! +25⬡" or "DEFEAT +5⬡"
- Two buttons: "Battle Again" and "Back to Map"
- "Battle Again" starts a new match instantly (no loading screen)

### What's NOT in battles
- No modifiers
- No synergies
- No abilities
- No combo rounds
- No deck building / hand selection
- No 5-round format
- No complex scoring (no 0.5 points, no split resolution)

### Card Auto-Selection
- Game picks 3 cards from the player's collection
- Selection favors variety (different archetypes/states when possible)
- If collection has < 3 cards, fill with random cards from database

### The 6 Questions (reused from existing `battle.ts`)
| Icon | Question | Stat |
|------|----------|------|
| 💰 | Which county is RICHER? | stat_power (income/GDP per capita) |
| 🏥 | Which county is HEALTHIER? | stat_resilience (life expectancy, doctors) |
| 👥 | Which county has MORE PEOPLE? | stat_population |
| 📐 | Which county is BIGGER? | stat_terrain (land area) |
| ⚠️ | Which county is more DANGEROUS? | stat_chaos (disasters, crime) |
| 🎓 | Which county is more EDUCATED? | stat_culture (degrees, employment) |

---

## County of the Day Quiz

A 10-second daily micro-interaction. One question, one attempt, shareable.

### Flow
1. Player taps ❓ icon on map
2. Overlay shows today's County of the Day card (the same one in the daily pack) with its stats visible
3. One question about the county: e.g., "What state is this county in?" or "Is this county's population above or below 100,000?" or "Which region is this county in?"
4. 4 multiple-choice options
5. Correct: +50⬡, confetti animation
6. Wrong: "The answer was [X]" — no coin penalty
7. Result shareable as text: "County Wars Daily #147: ✅ Loving County, TX (Pop. 64!)"

### Question Generation
- Questions auto-generated from the card's real data
- Simple formats that teach geography without requiring prior knowledge:
  - "What state is [County] in?" (4 state options)
  - "Is [County]'s population above or below [threshold]?"
  - "Which is bigger: [County A] or [County B]?" (County of the Day vs a random county)

### Once Per Day
- Tied to the same date as the daily pack
- Stored in localStorage as `quizDate`
- If already completed, show the result and share button (no replay)

---

## Collection Milestones

### State Completion
- Complete all counties in a state = gold border on map tile + "State Champion!" badge + 500⬡ one-time bonus
- State completion percentage visible on every state tile at all times

### Region Completion
- 5 regions: Northeast, Southeast, Midwest, Southwest, West
- Complete all states in a region = 2000⬡ bonus + region badge on map

### Total Collection
- Complete all 3,143 counties = "President" title + USA Legendary card (unique, cannot be pulled from packs)

### Milestone Packs (every 50th unique county)
- See Daily Pack Rip section above

---

## Persistence (localStorage)

### Simplified GameState
```typescript
interface GameState {
  collection: CountyCard[];     // owned cards (deduplicated by fips)
  coins: number;                // current coin balance
  streak: number;               // consecutive daily pack days
  lastPackDate: string | null;  // ISO date of last daily pack
  lastQuizDate: string | null;  // ISO date of last quiz attempt
  lastQuizResult: boolean | null; // did they get it right
  pityCounter: number;          // packs since last epic+
  totalPacksOpened: number;     // lifetime packs opened
  milestonesAwarded: number[];  // milestone thresholds already awarded (50, 100, etc.)
  stateCompletions: string[];   // state abbreviations completed
}
```

### Removed from state
- `campaignProgress` — campaign is cut
- `dailyTrialDate` / `dailyTrialResult` — daily trial is cut
- `homeState` — no longer needed (was only used for campaign region unlock)

---

## Card Component

The existing `CountyCard.tsx` is kept as-is. It already has:
- Archetype-driven color themes
- Rarity border glow
- Map image with gradient overlay
- 3x2 stat grid with hot/cold coloring
- Flip animation
- Compact mode for lists

One addition: a "County of the Day" variant border (e.g., a pulsing cyan ring) applied when the card is today's featured county.

---

## File Structure After Redesign

```
src/
  app/
    page.tsx          # The ONLY page — map + pack opening + battle (all inline)
    layout.tsx        # Root layout (unchanged)
    globals.css       # Global styles (unchanged)
  components/
    CountyCard.tsx    # Card component (unchanged)
    USMap.tsx         # State tile map (unchanged)
  lib/
    battle.ts         # Simplified — just questions, resolveRound, CPU pick
    supabase.ts       # Pack opening, card types, Supabase client
    store.ts          # Simplified localStorage persistence
```

### Deleted files
- `app/battle/page.tsx`
- `app/campaign/page.tsx`
- `app/daily/page.tsx`
- `app/draft/page.tsx`
- `app/packs/page.tsx`
- `app/trivia/page.tsx`

### Deleted from `battle.ts`
- Combo round logic (`cpuPickCombo`, `isCombo` on questions)
- Battle modifiers (entire `MODIFIERS` array and `pickModifier`)
- State synergy system (`calcStateSynergy`, `getSynergyDisplay`)
- Ability system (`getAbilityBonus`)
- `HAND_SIZE` constant (now always 3)
- `RoundResult` interface (simplified)

### Deleted from `store.ts`
- `CampaignState` interface
- `getCampaignBattles` function
- `STATE_OPPONENTS` object
- `campaignProgress`, `dailyTrialDate`, `dailyTrialResult`, `homeState` from GameState

---

## What This Is NOT

- Not a competitive card battler (no PvP, no ranked, no matchmaking)
- Not a strategy game (no deck building, no synergies, no ability combos)
- Not a geography quiz app (one quiz question per day, not a quiz mode)
- Not a social game (no trading, no raiding, no friend lists — maybe later)

It is a **daily collection ritual** with a satisfying pack opening, a pretty map that fills up over time, and a simple coin-grinding battle to accelerate progress.
