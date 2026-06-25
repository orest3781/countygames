import type { Dataset, CountyEntry } from "./types";
import { EPOCH_DATE_KEY } from "./constants";

const MS_PER_DAY = 86_400_000;

/** UTC YYYY-MM-DD for a Date. */
export function dateKeyUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function keyToUTC(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** The UTC day before dateKey, as YYYY-MM-DD. */
export function prevDateKey(dateKey: string): string {
  return dateKeyUTC(new Date(keyToUTC(dateKey) - MS_PER_DAY));
}

/** Whole UTC days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((keyToUTC(b) - keyToUTC(a)) / MS_PER_DAY);
}

/** 1-based puzzle number relative to EPOCH_DATE_KEY. */
export function puzzleNumber(dateKey: string): number {
  return daysBetween(EPOCH_DATE_KEY, dateKey) + 1;
}

/** Deterministic non-negative string hash (djb2-style, >>> 0). */
export function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/** Pick the daily fips deterministically from a pool sorted ascending by fips. */
export function pickDailyFips(poolSortedFips: string[], dateKey: string): string {
  if (poolSortedFips.length === 0) throw new Error("empty answer pool");
  return poolSortedFips[hashString(dateKey) % poolSortedFips.length];
}

export function getDailyCounty(dataset: Dataset, dateKey: string): CountyEntry {
  const fips = pickDailyFips(dataset.answerPoolFips, dateKey);
  const c = dataset.byFips.get(fips);
  if (!c) throw new Error(`daily fips ${fips} not in dataset`);
  return c;
}
