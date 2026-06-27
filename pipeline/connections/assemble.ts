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
function sample<T>(rng: () => number, arr: T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

// Family difficulty order → color: easiest yellow … hardest purple.
const FAMILY_RANK: Record<string, number> = { sameState: 0, sameRegion: 1, stateCapital: 2, presidentName: 3, sharedName: 4 };

/** A state and that state's own region are co-extensive — never use both. */
export function regionOfState(groups: CandidateGroup[], stateKey: string, byFips: Map<string, CountyEntry>): string | null {
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
    // convert CountyEntry predicates to string-based predicates for the solver
    const predicates = chosen.map((g) => (fips: string) => {
      const county = byFips.get(fips);
      return county ? g.predicate(county) : false;
    });
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
