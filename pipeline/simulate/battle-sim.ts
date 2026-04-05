/**
 * battle-sim.ts — Simulate the v8 simultaneous-pick battle system
 * on our real card data to find balance issues.
 *
 * Battle rules (v8):
 * - Each player has a hand of 3 cards
 * - Best of 5 rounds (first to 3 wins)
 * - Each round: both players simultaneously pick a card + stat
 * - Same stat picked: higher value wins (1 point)
 * - Different stats: dual resolution — each stat comparison = 0.5 points
 * - Card can only be used once per match
 * - Ties broken by total_score of the card played
 */
import { supabase } from "../config.js";

const STATS = ["stat_power", "stat_resilience", "stat_population", "stat_terrain", "stat_chaos", "stat_culture"] as const;
type StatKey = typeof STATS[number];

interface Card {
  fips: string;
  name: string;
  rarity: string;
  total_score: number;
  stats: Record<StatKey, number>;
}

interface MatchResult {
  p1Score: number;
  p2Score: number;
  rounds: number;
  isSweep: boolean;
  winner: "p1" | "p2" | "tie";
}

/** Smart AI: pick the card+stat combo that maximizes expected value. */
function smartPick(hand: Card[]): { card: Card; stat: StatKey } {
  // Pick the card+stat with the highest value
  let bestCard = hand[0];
  let bestStat: StatKey = STATS[0];
  let bestVal = 0;

  for (const card of hand) {
    for (const stat of STATS) {
      if (card.stats[stat] > bestVal) {
        bestVal = card.stats[stat];
        bestCard = card;
        bestStat = stat;
      }
    }
  }
  return { card: bestCard, stat: bestStat };
}

/** Random AI: pick a random card and random stat. */
function randomPick(hand: Card[]): { card: Card; stat: StatKey } {
  const card = hand[Math.floor(Math.random() * hand.length)];
  const stat = STATS[Math.floor(Math.random() * STATS.length)];
  return { card, stat };
}

function resolveRound(
  p1Card: Card, p1Stat: StatKey,
  p2Card: Card, p2Stat: StatKey
): { p1Points: number; p2Points: number } {
  if (p1Stat === p2Stat) {
    // Same stat: direct comparison
    const v1 = p1Card.stats[p1Stat];
    const v2 = p2Card.stats[p2Stat];
    if (v1 > v2) return { p1Points: 1, p2Points: 0 };
    if (v2 > v1) return { p1Points: 0, p2Points: 1 };
    // Tie: use total_score
    if (p1Card.total_score > p2Card.total_score) return { p1Points: 1, p2Points: 0 };
    if (p2Card.total_score > p1Card.total_score) return { p1Points: 0, p2Points: 1 };
    return { p1Points: 0.5, p2Points: 0.5 };
  } else {
    // Different stats: dual resolution
    let p1Points = 0;
    let p2Points = 0;

    // P1's chosen stat
    const v1a = p1Card.stats[p1Stat];
    const v2a = p2Card.stats[p1Stat];
    if (v1a > v2a) p1Points += 0.5;
    else if (v2a > v1a) p2Points += 0.5;
    else { p1Points += 0.25; p2Points += 0.25; }

    // P2's chosen stat
    const v1b = p1Card.stats[p2Stat];
    const v2b = p2Card.stats[p2Stat];
    if (v1b > v2b) p1Points += 0.5;
    else if (v2b > v1b) p2Points += 0.5;
    else { p1Points += 0.25; p2Points += 0.25; }

    return { p1Points, p2Points };
  }
}

function simulateMatch(
  p1Hand: Card[], p2Hand: Card[],
  p1Strategy: "smart" | "random", p2Strategy: "smart" | "random"
): MatchResult {
  const p1Available = [...p1Hand];
  const p2Available = [...p2Hand];
  let p1Score = 0;
  let p2Score = 0;
  let rounds = 0;

  while (p1Score < 3 && p2Score < 3 && p1Available.length > 0 && p2Available.length > 0) {
    const p1Pick = p1Strategy === "smart" ? smartPick(p1Available) : randomPick(p1Available);
    const p2Pick = p2Strategy === "smart" ? smartPick(p2Available) : randomPick(p2Available);

    const result = resolveRound(p1Pick.card, p1Pick.stat, p2Pick.card, p2Pick.stat);
    p1Score += result.p1Points;
    p2Score += result.p2Points;
    rounds++;

    // Remove used cards
    p1Available.splice(p1Available.indexOf(p1Pick.card), 1);
    p2Available.splice(p2Available.indexOf(p2Pick.card), 1);
  }

  // Tiebreaker: total_score of all cards played
  let winner: "p1" | "p2" | "tie";
  if (p1Score > p2Score) {
    winner = "p1";
  } else if (p2Score > p1Score) {
    winner = "p2";
  } else {
    // Tie — compare total_score of hand
    const p1Total = p1Hand.reduce((s, c) => s + c.total_score, 0);
    const p2Total = p2Hand.reduce((s, c) => s + c.total_score, 0);
    winner = p1Total > p2Total ? "p1" : p2Total > p1Total ? "p2" : "tie";
  }
  const isSweep = (p1Score >= 3 && p2Score === 0) || (p2Score >= 3 && p1Score === 0);

  return { p1Score, p2Score, rounds, isSweep, winner };
}

async function main() {
  console.log("=== Battle Simulation ===\n");

  // Fetch all cards
  const allCards: Card[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("cards")
      .select("fips, rarity, total_score, stat_power, stat_resilience, stat_population, stat_terrain, stat_chaos, stat_culture, counties!inner(name)")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const row of data) {
      allCards.push({
        fips: row.fips.trim(),
        name: (row as any).counties.name,
        rarity: row.rarity,
        total_score: row.total_score,
        stats: {
          stat_power: row.stat_power,
          stat_resilience: row.stat_resilience,
          stat_population: row.stat_population,
          stat_terrain: row.stat_terrain,
          stat_chaos: row.stat_chaos,
          stat_culture: row.stat_culture,
        },
      });
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`Loaded ${allCards.length} cards\n`);

  // Group by rarity for tier-matched matchmaking
  const byRarity = new Map<string, Card[]>();
  for (const c of allCards) {
    const arr = byRarity.get(c.rarity) || [];
    arr.push(c);
    byRarity.set(c.rarity, arr);
  }

  // --- Simulation 1a: 3-card hands ---
  console.log("--- SIM 1a: 3-card hands, Smart vs Smart, 10,000 matches ---");
  let results = runSimulation(allCards, allCards, "smart", "smart", 10000, 3);
  printResults(results);

  // --- Simulation 1b: 5-card hands ---
  console.log("\n--- SIM 1b: 5-card hands, Smart vs Smart, 10,000 matches ---");
  results = runSimulation(allCards, allCards, "smart", "smart", 10000, 5);
  printResults(results);

  // --- Simulation 2: Smart vs Random (5-card) ---
  console.log("\n--- SIM 2: 5-card, Smart vs Random, 10,000 matches ---");
  results = runSimulation(allCards, allCards, "smart", "random", 10000, 5);
  printResults(results);

  // --- Simulation 3: Tier-matched (same rarity) ---
  console.log("\n--- SIM 3: Tier-matched (same rarity), Smart vs Smart ---");
  for (const [rarity, cards] of byRarity) {
    if (cards.length < 10) continue; // need at least 2 5-card hands
    const tierResults = runSimulation(cards, cards, "smart", "smart", 2000, 5);
    console.log(`\n  [${rarity.toUpperCase()}] (${cards.length} cards):`);
    printResults(tierResults, "  ");
  }

  // --- Simulation 4: Stat usefulness analysis ---
  console.log("\n--- SIM 4: Which stats actually matter? ---");
  analyzeStatUsefulness(allCards);

  // --- Simulation 5: Domination analysis ---
  console.log("\n--- SIM 5: Card domination analysis ---");
  analyzeDomination(allCards);
}

function runSimulation(
  pool1: Card[], pool2: Card[],
  strat1: "smart" | "random", strat2: "smart" | "random",
  numMatches: number,
  handSize: number = 3
): MatchResult[] {
  const results: MatchResult[] = [];
  for (let i = 0; i < numMatches; i++) {
    const shuffled1 = [...pool1].sort(() => Math.random() - 0.5);
    const shuffled2 = [...pool2].sort(() => Math.random() - 0.5);
    const p1Hand = shuffled1.slice(0, handSize);
    const p2Hand = shuffled2.slice(0, handSize);
    results.push(simulateMatch(p1Hand, p2Hand, strat1, strat2));
  }
  return results;
}

function printResults(results: MatchResult[], indent = "") {
  const total = results.length;
  const p1Wins = results.filter((r) => r.winner === "p1").length;
  const p2Wins = results.filter((r) => r.winner === "p2").length;
  const ties = results.filter((r) => r.winner === "tie").length;
  const sweeps = results.filter((r) => r.isSweep).length;
  const avgRounds = results.reduce((s, r) => s + r.rounds, 0) / total;
  const closeMatches = results.filter(
    (r) => Math.abs(r.p1Score - r.p2Score) <= 1
  ).length;

  console.log(`${indent}P1 wins: ${((p1Wins / total) * 100).toFixed(1)}% | P2 wins: ${((p2Wins / total) * 100).toFixed(1)}% | Ties: ${((ties / total) * 100).toFixed(1)}%`);
  console.log(`${indent}Sweeps: ${((sweeps / total) * 100).toFixed(1)}% | Close matches: ${((closeMatches / total) * 100).toFixed(1)}%`);
  console.log(`${indent}Avg rounds: ${avgRounds.toFixed(2)}`);
}

function analyzeStatUsefulness(cards: Card[]) {
  // For each stat, count how often it's the BEST stat on a card
  // (i.e., a smart player would pick it)
  const statBestCount: Record<StatKey, number> = {} as any;
  for (const s of STATS) statBestCount[s] = 0;

  for (const card of cards) {
    let bestStat: StatKey = STATS[0];
    let bestVal = 0;
    for (const s of STATS) {
      if (card.stats[s] > bestVal) {
        bestVal = card.stats[s];
        bestStat = s;
      }
    }
    statBestCount[bestStat]++;
  }

  console.log("  How often each stat is a card's BEST stat:");
  for (const s of STATS) {
    const pct = ((statBestCount[s] / cards.length) * 100).toFixed(1);
    console.log(`    ${s}: ${statBestCount[s]} cards (${pct}%)`);
  }

  // Also check: for each stat, how many cards have it as their UNIQUE advantage
  // (i.e., it's significantly higher than their other stats)
  console.log("\n  How often each stat creates a NICHE (best stat by 10+ points):");
  const nicheCount: Record<StatKey, number> = {} as any;
  for (const s of STATS) nicheCount[s] = 0;

  for (const card of cards) {
    const vals = STATS.map((s) => card.stats[s]);
    const max = Math.max(...vals);
    const secondMax = vals.sort((a, b) => b - a)[1];
    if (max - secondMax >= 10) {
      const bestStat = STATS.find((s) => card.stats[s] === max)!;
      nicheCount[bestStat]++;
    }
  }
  for (const s of STATS) {
    console.log(`    ${s}: ${nicheCount[s]} cards`);
  }
}

function analyzeDomination(cards: Card[]) {
  // Sample 100 cards, check all pairs
  const sample = cards.sort(() => Math.random() - 0.5).slice(0, 100);
  let totalPairs = 0;
  let dominationCount = 0;
  let noWinStatCount = 0; // pairs where one card has NO stat advantage

  for (let i = 0; i < sample.length; i++) {
    for (let j = i + 1; j < sample.length; j++) {
      totalPairs++;
      const a = sample[i];
      const b = sample[j];

      let aWins = 0;
      let bWins = 0;
      for (const s of STATS) {
        if (a.stats[s] > b.stats[s]) aWins++;
        else if (b.stats[s] > a.stats[s]) bWins++;
      }

      if (aWins === 6 || bWins === 6) dominationCount++;
      if (aWins === 0 || bWins === 0) noWinStatCount++;
    }
  }

  console.log(`  Sample: ${sample.length} cards, ${totalPairs} pairs`);
  console.log(`  Total domination (6-0): ${dominationCount} (${((dominationCount / totalPairs) * 100).toFixed(1)}%)`);
  console.log(`  No winning stat (0-6 or worse): ${noWinStatCount} (${((noWinStatCount / totalPairs) * 100).toFixed(1)}%)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
