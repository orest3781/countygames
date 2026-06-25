import type { CountiesPayload, CountyEntry, Dataset } from "./types";

export function buildDataset(payload: CountiesPayload): Dataset {
  const all = Object.values(payload.counties);
  const byFips = new Map<string, CountyEntry>(all.map((c) => [c.fips, c]));
  const answerPoolFips = all
    .filter((c) => c.isAnswerPool)
    .map((c) => c.fips)
    .sort();
  return { byFips, all, answerPoolFips };
}

/** Autocomplete over ALL counties (any county is a valid guess). */
export function searchCounties(dataset: Dataset, query: string, limit = 8): CountyEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { c: CountyEntry; score: number }[] = [];
  for (const c of dataset.all) {
    const name = c.name.toLowerCase();
    const full = `${name}, ${c.state_abbr.toLowerCase()}`;
    let score: number;
    if (name === q || full === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (name.includes(q) || full.includes(q)) score = 2;
    else continue;
    scored.push({ c, score });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      b.c.stats.people - a.c.stats.people || // bigger places first
      a.c.name.localeCompare(b.c.name, "en-US") ||
      a.c.fips.localeCompare(b.c.fips)
  );
  return scored.slice(0, limit).map((s) => s.c);
}
