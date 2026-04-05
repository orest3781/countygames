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

export function addCards(state: GameState, cards: CountyCard[]): GameState {
  const ownedFips = new Set(state.collection.map((c) => c.fips));
  const newCards = cards.filter((c) => !ownedFips.has(c.fips));
  const dupeCount = cards.length - newCards.length;

  const next = {
    ...state,
    collection: [...state.collection, ...newCards],
    coins: state.coins + cards.length * 10 + dupeCount * 25,
  };

  const MILESTONES = [50, 100, 150, 200, 300, 500, 1000, 1500, 2000, 2500, 3000, 3143];
  const uniqueCount = next.collection.length;
  for (const m of MILESTONES) {
    if (uniqueCount >= m && !next.milestonesAwarded.includes(m)) {
      next.milestonesAwarded = [...next.milestonesAwarded, m];
    }
  }

  const byState = new Map<string, number>();
  for (const c of next.collection) {
    byState.set(c.state_abbr, (byState.get(c.state_abbr) || 0) + 1);
  }
  for (const [abbr, count] of byState) {
    const total = STATE_COUNTY_COUNTS[abbr] || 999;
    if (count >= total && !next.stateCompletions.includes(abbr)) {
      next.stateCompletions = [...next.stateCompletions, abbr];
      next.coins += 500;
    }
  }

  return next;
}

export function canOpenDailyPack(state: GameState): boolean {
  if (!state.lastPackDate) return true;
  return state.lastPackDate.slice(0, 10) !== getTodayString();
}

export function getNextPackTime(state: GameState): string | null {
  if (canOpenDailyPack(state)) return null;
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const diff = tomorrow.getTime() - now.getTime();
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

export function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export const STATE_COUNTY_COUNTS: Record<string, number> = {
  AL: 67, AK: 30, AZ: 15, AR: 75, CA: 58, CO: 64, CT: 8, DE: 3, DC: 1,
  FL: 67, GA: 159, HI: 5, ID: 44, IL: 102, IN: 92, IA: 99, KS: 105,
  KY: 120, LA: 64, ME: 16, MD: 24, MA: 14, MI: 83, MN: 87, MS: 82,
  MO: 115, MT: 56, NE: 93, NV: 17, NH: 10, NJ: 21, NM: 33, NY: 62,
  NC: 100, ND: 53, OH: 88, OK: 77, OR: 36, PA: 67, RI: 5, SC: 46,
  SD: 66, TN: 95, TX: 254, UT: 29, VT: 14, VA: 133, WA: 39, WV: 55,
  WI: 72, WY: 23,
};

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
