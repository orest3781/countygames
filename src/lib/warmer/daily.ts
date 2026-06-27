import type { CountyEntry, Dataset } from "../countle/types";
import { pickDailyFips } from "../countle/daily";

/** Salted so Warmer's daily target never coincides with Countle's. */
export function warmerDateKey(dateKey: string): string {
  return `${dateKey}:warmer`;
}

export function getDailyTarget(dataset: Dataset, dateKey: string): CountyEntry {
  const fips = pickDailyFips(dataset.answerPoolFips, warmerDateKey(dateKey));
  const c = dataset.byFips.get(fips);
  if (!c) throw new Error(`warmer target ${fips} not in dataset`);
  return c;
}
