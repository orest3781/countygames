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
