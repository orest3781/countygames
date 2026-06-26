export type GroupColor = "yellow" | "green" | "blue" | "purple";
export const COLORS: GroupColor[] = ["yellow", "green", "blue", "purple"];
export const COLOR_EMOJI: Record<GroupColor, string> = { yellow: "🟨", green: "🟩", blue: "🟦", purple: "🟪" };

export interface ConnectionsGroup {
  label: string;
  color: GroupColor;
  fips: string[]; // exactly 4, distinct
}

export interface ConnectionsPuzzle {
  id: number;
  groups: ConnectionsGroup[]; // exactly 4
}

export interface ConnectionsPayload {
  schemaVersion: 1;
  generatedAt: string;
  count: number;
  puzzles: ConnectionsPuzzle[];
}

export type SubmissionResult =
  | { kind: "correct"; color: GroupColor; groupIndex: number }
  | { kind: "one-away" }
  | { kind: "wrong" };

export interface ConnectionsState {
  schemaVersion: 1;
  lastPlayedDateKey: string | null;
  today: {
    dateKey: string;
    submissions: string[][]; // each a 4-fips array, in order
    solvedColors: GroupColor[];
    mistakes: number;
    finished: boolean;
    won: boolean;
  } | null;
  streak: number;
  maxStreak: number;
  gamesPlayed: number;
  wins: number;
  perfectGames: number; // won with 0 mistakes
}
