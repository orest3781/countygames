export type StatKey = "wealth" | "health" | "people" | "land" | "danger" | "education";
export const STAT_KEYS: StatKey[] = ["wealth", "health", "people", "land", "danger", "education"];

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface CountyEntry {
  fips: string;
  name: string;
  state_abbr: string;
  state_name: string;
  region: string;
  county_seat: string | null;
  lat: number;
  lng: number;
  stats: Record<StatKey, number>;
  display: Record<StatKey, string>;
  rarity: Rarity;
  hasArt: boolean;
  isAnswerPool: boolean;
  notable_person: string | null;
  notable_person_desc: string | null;
  flavor: string | null;
}

export interface CountiesPayload {
  schemaVersion: number;
  generatedAt: string;
  count: number;
  answerPoolCount: number;
  counties: Record<string, CountyEntry>;
}

export interface Dataset {
  byFips: Map<string, CountyEntry>;
  all: CountyEntry[];
  answerPoolFips: string[]; // ascending by fips
}

export type Direction = "up" | "down" | "equal";
export type Closeness = "close" | "near" | "far"; // 🟩 / 🟨 / ⬛

export interface StatFeedback {
  key: StatKey;
  guessValue: number;     // the guessed county's stat (shown in UI)
  direction: Direction;   // arrow toward the mystery
  magnitude: 1 | 2;       // single or double arrow
  closeness: Closeness;   // drives the share square
}

export interface GuessResult {
  guess: CountyEntry;
  isCorrect: boolean;
  stats: StatFeedback[];  // length 6, STAT_KEYS order
  distanceMiles: number;  // 0 when correct
  bearingDeg: number;     // 0..360, 0 when correct
  compass: { arrow: string; label: string };
  shareRow: string;       // 6 emoji squares
}

export interface CountleState {
  schemaVersion: 1;
  lastPlayedDateKey: string | null;
  today: { dateKey: string; guesses: string[]; solved: boolean; finished: boolean } | null;
  streak: number;
  maxStreak: number;
  gamesPlayed: number;
  guessDistribution: number[]; // length 6; index i = solved in (i+1) guesses
  fails: number;
  solvedCounties: string[];
  encounteredCounties: string[];
}
