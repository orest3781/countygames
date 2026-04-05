/**
 * game-sim.ts — Simulate the full County Wars game loop with state-targeted packs.
 *
 * Simulates 100 players x 90 days for each player type.
 * NEW: Players can buy state-targeted packs (400⬡, 5 cards from one state)
 * to complete states faster.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const PULL_RATES = [
  { rarity: "common", weight: 50 },
  { rarity: "uncommon", weight: 30 },
  { rarity: "rare", weight: 14 },
  { rarity: "epic", weight: 5 },
  { rarity: "legendary", weight: 1 },
];

const REWARDS = { battleWin: 50, battleLoss: 15, quizCorrect: 75 };
const MILESTONES = [50, 100, 150, 200, 300, 500, 1000, 1500, 2000, 2500, 3000, 3143];
const TOTAL_COUNTIES = 3143;
const TARGETED_PACK_COST = 400;
const TARGETED_PACK_CARDS = 5;

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface CardInfo { fips: string; state_abbr: string; rarity: string; }

interface SimState {
  collection: Set<string>;
  coins: number;
  streak: number;
  pityCounter: number;
  totalPacksOpened: number;
  milestonesHit: number[];
  statesCompleted: string[];
  rarityPulled: Record<string, number>;
  battlesPlayed: number;
  battlesWon: number;
  quizzesTaken: number;
  targetedPacksBought: number;
}

type PlayerType = "casual" | "grinder" | "whale" | "completionist";

/* ================================================================== */
/*  Data loading                                                       */
/* ================================================================== */

let ALL_CARDS: CardInfo[] = [];
let CARDS_BY_RARITY: Record<string, CardInfo[]> = {};
let CARDS_BY_STATE: Record<string, CardInfo[]> = {};
let CARDS_BY_STATE_RARITY: Record<string, Record<string, CardInfo[]>> = {};
let STATE_COUNTS: Record<string, number> = {};

async function loadCards() {
  console.log("Loading card data...");
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("cards")
      .select("fips, rarity, counties!inner(state_abbr)")
      .order("fips")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const row of data) {
      ALL_CARDS.push({
        fips: row.fips.trim(),
        state_abbr: (row as any).counties.state_abbr.trim(),
        rarity: row.rarity.trim(),
      });
    }
    if (data.length < 1000) break;
    offset += 1000;
  }

  for (const card of ALL_CARDS) {
    // By rarity
    if (!CARDS_BY_RARITY[card.rarity]) CARDS_BY_RARITY[card.rarity] = [];
    CARDS_BY_RARITY[card.rarity].push(card);
    // By state
    if (!CARDS_BY_STATE[card.state_abbr]) CARDS_BY_STATE[card.state_abbr] = [];
    CARDS_BY_STATE[card.state_abbr].push(card);
    // By state+rarity
    if (!CARDS_BY_STATE_RARITY[card.state_abbr]) CARDS_BY_STATE_RARITY[card.state_abbr] = {};
    if (!CARDS_BY_STATE_RARITY[card.state_abbr][card.rarity]) CARDS_BY_STATE_RARITY[card.state_abbr][card.rarity] = [];
    CARDS_BY_STATE_RARITY[card.state_abbr][card.rarity].push(card);
    // State counts
    STATE_COUNTS[card.state_abbr] = (STATE_COUNTS[card.state_abbr] || 0) + 1;
  }

  console.log(`Loaded ${ALL_CARDS.length} cards, ${Object.keys(STATE_COUNTS).length} states\n`);
}

/* ================================================================== */
/*  Gacha                                                              */
/* ================================================================== */

function rollRarity(floor?: string, pityCount = 0): string {
  const floorOrder = ["common", "uncommon", "rare", "epic", "legendary"];
  const floorIdx = floor ? floorOrder.indexOf(floor) : 0;
  let rates = PULL_RATES.map((p) => ({ ...p }));
  if (pityCount >= 30) {
    const bonus = (pityCount - 29) * 3;
    rates = rates.map((p) => {
      if (p.rarity === "epic") return { ...p, weight: p.weight + bonus };
      if (p.rarity === "legendary") return { ...p, weight: p.weight + Math.floor(bonus / 3) };
      return p;
    });
  }
  if (pityCount >= 40) {
    const hardFloor = floorOrder.indexOf("epic");
    if (hardFloor > floorIdx) return rollFromRates(rates, hardFloor);
  }
  return rollFromRates(rates, floorIdx);
}

function rollFromRates(rates: { rarity: string; weight: number }[], floorIdx: number): string {
  const floorOrder = ["common", "uncommon", "rare", "epic", "legendary"];
  const eligible = rates.filter((p) => floorOrder.indexOf(p.rarity) >= floorIdx);
  const total = eligible.reduce((s, p) => s + p.weight, 0);
  let roll = Math.random() * total;
  for (const p of eligible) { roll -= p.weight; if (roll <= 0) return p.rarity; }
  return eligible[eligible.length - 1].rarity;
}

function pullCard(rarity: string, stateFilter?: string): CardInfo {
  if (stateFilter) {
    const statePool = CARDS_BY_STATE_RARITY[stateFilter]?.[rarity];
    if (statePool && statePool.length > 0) {
      return statePool[Math.floor(Math.random() * statePool.length)];
    }
    // Fallback: any card from this state
    const allStateCards = CARDS_BY_STATE[stateFilter] || [];
    if (allStateCards.length > 0) return allStateCards[Math.floor(Math.random() * allStateCards.length)];
  }
  const pool = CARDS_BY_RARITY[rarity] || CARDS_BY_RARITY["common"];
  return pool[Math.floor(Math.random() * pool.length)];
}

function openPack(state: SimState, cardCount: number, floor?: string, stateFilter?: string): CardInfo[] {
  const cards: CardInfo[] = [];
  for (let i = 0; i < cardCount; i++) {
    const isLast = i === cardCount - 1;
    const rarity = rollRarity(isLast ? floor : undefined, isLast ? state.pityCounter : 0);
    cards.push(pullCard(rarity, stateFilter));
    state.rarityPulled[rarity] = (state.rarityPulled[rarity] || 0) + 1;
  }
  const hasEpicPlus = cards.some((c) => c.rarity === "epic" || c.rarity === "legendary");
  state.pityCounter = hasEpicPlus ? 0 : state.pityCounter + 1;
  state.totalPacksOpened++;
  return cards;
}

function collectCards(state: SimState, cards: CardInfo[]): { newCount: number; dupeCount: number } {
  let newCount = 0, dupeCount = 0;
  for (const card of cards) {
    if (state.collection.has(card.fips)) { dupeCount++; state.coins += 25; }
    else { state.collection.add(card.fips); newCount++; }
    state.coins += 10;
  }

  // Milestones
  for (const m of MILESTONES) {
    if (state.collection.size >= m && !state.milestonesHit.includes(m)) {
      state.milestonesHit.push(m);
      const milestoneCards = openPack(state, 7, "rare");
      collectCards(state, milestoneCards);
    }
  }

  // State completions
  const byState = new Map<string, number>();
  for (const fips of state.collection) {
    const card = ALL_CARDS.find((c) => c.fips === fips);
    if (card) byState.set(card.state_abbr, (byState.get(card.state_abbr) || 0) + 1);
  }
  for (const [abbr, count] of byState) {
    if (count >= (STATE_COUNTS[abbr] || 999) && !state.statesCompleted.includes(abbr)) {
      state.statesCompleted.push(abbr);
      state.coins += 500;
    }
  }

  return { newCount, dupeCount };
}

/* ================================================================== */
/*  Battle & Quiz                                                      */
/* ================================================================== */

function simulateBattle(state: SimState): boolean {
  const winRate = 0.55 + Math.min(state.collection.size / TOTAL_COUNTIES, 0.2) * 0.5;
  const won = Math.random() < winRate;
  state.battlesPlayed++;
  if (won) state.battlesWon++;
  state.coins += won ? REWARDS.battleWin : REWARDS.battleLoss;
  return won;
}

function simulateQuiz(state: SimState): boolean {
  const correct = Math.random() < 0.6;
  state.quizzesTaken++;
  if (correct) state.coins += REWARDS.quizCorrect;
  return correct;
}

/* ================================================================== */
/*  State targeting AI                                                 */
/* ================================================================== */

/** Pick the state closest to completion that isn't done yet */
function getBestTargetState(state: SimState): string | null {
  const byState = new Map<string, number>();
  for (const fips of state.collection) {
    const card = ALL_CARDS.find((c) => c.fips === fips);
    if (card) byState.set(card.state_abbr, (byState.get(card.state_abbr) || 0) + 1);
  }

  let bestState: string | null = null;
  let bestPct = 0;

  for (const [abbr, count] of byState) {
    const total = STATE_COUNTS[abbr] || 999;
    if (state.statesCompleted.includes(abbr)) continue;
    const pct = count / total;
    // Only target states where we have at least 30% and < 100%
    if (pct >= 0.3 && pct > bestPct) {
      bestPct = pct;
      bestState = abbr;
    }
  }
  return bestState;
}

/* ================================================================== */
/*  Player behaviors                                                   */
/* ================================================================== */

function getPlayerBehavior(type: PlayerType) {
  switch (type) {
    case "casual":
      return { battlesPerDay: 2, description: "Daily pack + quiz + 2 battles, no premium packs" };
    case "grinder":
      return { battlesPerDay: 8, description: "Daily + quiz + 8 battles + best affordable pack (prefers targeted)" };
    case "whale":
      return { battlesPerDay: 15, description: "Daily + quiz + 15 battles + targeted packs for nearest-complete state" };
    case "completionist":
      return { battlesPerDay: 10, description: "Daily + quiz + 10 battles + ALWAYS buys targeted pack for nearest state" };
  }
}

function simulateDay(state: SimState, type: PlayerType): void {
  // Daily pack
  collectCards(state, openPack(state, 5));
  state.streak++;
  if (state.streak % 7 === 0) collectCards(state, openPack(state, 7, "rare"));

  // Quiz
  simulateQuiz(state);

  // Battles
  const behavior = getPlayerBehavior(type);
  for (let i = 0; i < behavior.battlesPerDay; i++) simulateBattle(state);

  // Premium pack buying strategy
  if (type === "casual") return; // casuals never buy

  const targetState = getBestTargetState(state);

  if (type === "completionist" || type === "whale") {
    // Buy targeted packs for the closest-to-complete state, as many as affordable
    while (targetState && state.coins >= TARGETED_PACK_COST) {
      state.coins -= TARGETED_PACK_COST;
      state.targetedPacksBought++;
      collectCards(state, openPack(state, TARGETED_PACK_CARDS, undefined, targetState));
    }
    // If no target state (none at 30%+), buy generic premium
    if (!targetState && state.coins >= 500) {
      state.coins -= 500;
      collectCards(state, openPack(state, 5, "rare"));
    }
  } else if (type === "grinder") {
    // Grinder: buy targeted if close to completing a state, otherwise best generic
    if (targetState && state.coins >= TARGETED_PACK_COST) {
      state.coins -= TARGETED_PACK_COST;
      state.targetedPacksBought++;
      collectCards(state, openPack(state, TARGETED_PACK_CARDS, undefined, targetState));
    } else {
      // Best affordable generic pack
      const packs = [
        { cost: 1000, cards: 7, floor: "epic" },
        { cost: 500, cards: 5, floor: "rare" },
        { cost: 250, cards: 5, floor: "uncommon" },
        { cost: 100, cards: 3 },
      ];
      for (const p of packs) {
        if (state.coins >= p.cost) {
          state.coins -= p.cost;
          collectCards(state, openPack(state, p.cards, p.floor));
          break;
        }
      }
    }
  }
}

/* ================================================================== */
/*  Main                                                               */
/* ================================================================== */

async function main() {
  await loadCards();

  // Show small states
  const smallStates = Object.entries(STATE_COUNTS)
    .filter(([, c]) => c <= 10)
    .sort((a, b) => a[1] - b[1]);
  console.log("Small states (≤10 counties):", smallStates.map(([s, c]) => `${s}:${c}`).join(", "));
  console.log();

  const playerTypes: PlayerType[] = ["casual", "grinder", "whale", "completionist"];
  const NUM_SIMS = 100;
  const DAYS = 90;

  for (const type of playerTypes) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`PLAYER TYPE: ${type.toUpperCase()} — ${getPlayerBehavior(type).description}`);
    console.log("=".repeat(70));

    const allFinalStates: SimState[] = [];
    const checkpoints = [1, 7, 14, 30, 60, 90];
    const snapshotsByDay: Record<number, { collection: number; coins: number; states: number; dupeRate: number; targeted: number }[]> = {};
    for (const d of checkpoints) snapshotsByDay[d] = [];

    for (let sim = 0; sim < NUM_SIMS; sim++) {
      const state: SimState = {
        collection: new Set(), coins: 500, streak: 0, pityCounter: 0,
        totalPacksOpened: 0, milestonesHit: [], statesCompleted: [],
        rarityPulled: {}, battlesPlayed: 0, battlesWon: 0, quizzesTaken: 0,
        targetedPacksBought: 0,
      };

      for (let day = 1; day <= DAYS; day++) {
        simulateDay(state, type);
        if (checkpoints.includes(day)) {
          const totalPulled = Object.values(state.rarityPulled).reduce((s, n) => s + n, 0);
          snapshotsByDay[day].push({
            collection: state.collection.size,
            coins: state.coins,
            states: state.statesCompleted.length,
            dupeRate: totalPulled > 0 ? Math.round((1 - state.collection.size / totalPulled) * 100) : 0,
            targeted: state.targetedPacksBought,
          });
        }
      }
      allFinalStates.push(state);
    }

    // Print table
    console.log("\n  Day | Cards Owned    | Coins    | States Done | Dupe % | Targeted Packs");
    console.log("  " + "-".repeat(75));

    for (const day of checkpoints) {
      const s = snapshotsByDay[day];
      const avg = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
      console.log(
        `  ${String(day).padStart(3)} | ` +
        `${String(avg(s.map(x => x.collection))).padStart(5)}/${TOTAL_COUNTIES} (${Math.round(avg(s.map(x => x.collection)) / TOTAL_COUNTIES * 100).toString().padStart(2)}%) | ` +
        `${String(avg(s.map(x => x.coins))).padStart(6)}⬡ | ` +
        `${String(avg(s.map(x => x.states))).padStart(5)}/51    | ` +
        `${String(avg(s.map(x => x.dupeRate))).padStart(4)}%  | ` +
        `${String(avg(s.map(x => x.targeted))).padStart(5)}`
      );
    }

    // State completion details
    const stateCompletionCounts = new Map<string, number>();
    for (const s of allFinalStates) {
      for (const abbr of s.statesCompleted) {
        stateCompletionCounts.set(abbr, (stateCompletionCounts.get(abbr) || 0) + 1);
      }
    }

    if (stateCompletionCounts.size > 0) {
      console.log(`\n  States completed (out of ${NUM_SIMS} players):`);
      const sorted = [...stateCompletionCounts.entries()].sort((a, b) => b[1] - a[1]);
      for (const [abbr, count] of sorted) {
        console.log(`    ${abbr} (${STATE_COUNTS[abbr]} counties): ${count}/${NUM_SIMS} players completed (${Math.round(count / NUM_SIMS * 100)}%)`);
      }
    } else {
      console.log(`\n  No states completed by any player in ${DAYS} days.`);
    }

    // Completion estimate
    const avgRate = allFinalStates.reduce((s, st) => s + st.collection.size, 0) / NUM_SIMS / DAYS;
    console.log(`\n  Avg new cards/day: ${avgRate.toFixed(1)}`);
    console.log(`  Estimated full completion: ~${Math.round(TOTAL_COUNTIES / avgRate)} days (${Math.round(TOTAL_COUNTIES / avgRate / 30)} months)`);
    console.log(`  Avg targeted packs bought: ${(allFinalStates.reduce((s, st) => s + st.targetedPacksBought, 0) / NUM_SIMS).toFixed(1)}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
