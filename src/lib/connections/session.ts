import type { ConnectionsPayload, ConnectionsPuzzle, ConnectionsState, GroupColor, SubmissionResult } from "./types";
import { getDailyPuzzle, dailyCardOrder } from "./daily";
import { evaluateSubmission, shareRow, buildShareText } from "./game";
import { startDay, recordSubmission } from "./state";
import { cardLabel } from "./labels";
import { puzzleNumber } from "../countle/daily";
import type { Dataset } from "../countle/types";

export interface ViewCard {
  fips: string;
  label: string;
}
export interface ViewGroup {
  color: GroupColor;
  label: string;
  cards: ViewCard[];
}
export interface ConnectionsView {
  dateKey: string;
  puzzleNumber: number;
  puzzle: ConnectionsPuzzle;
  solvedGroups: ViewGroup[];
  remainingFips: string[];
  mistakes: number;
  mistakesLeft: number;
  finished: boolean;
  won: boolean;
  unsolvedGroups: ViewGroup[];
  shareRows: string[];
  shareText: string;
  streak: number;
}

const MISTAKE_LIMIT = 4;

function labelOf(dataset: Dataset, fips: string): string {
  const c = dataset.byFips.get(fips);
  return c ? cardLabel(c.name, c.state_abbr) : fips;
}

function toGroup(dataset: Dataset, puzzle: ConnectionsPuzzle, color: GroupColor): ViewGroup {
  const g = puzzle.groups.find((x) => x.color === color)!;
  return { color, label: g.label, cards: g.fips.map((f) => ({ fips: f, label: labelOf(dataset, f) })) };
}

export function buildConnectionsView(
  payload: ConnectionsPayload,
  dataset: Dataset,
  state: ConnectionsState,
  dateKey: string
): ConnectionsView {
  const puzzle = getDailyPuzzle(payload, dateKey);
  const today = state.today && state.today.dateKey === dateKey ? state.today : null;
  const solvedColors = today?.solvedColors ?? [];
  const mistakes = today?.mistakes ?? 0;

  const solvedGroups = solvedColors.map((c) => toGroup(dataset, puzzle, c));
  const solvedFips = new Set(solvedGroups.flatMap((g) => g.cards.map((c) => c.fips)));
  const remainingFips = dailyCardOrder(puzzle, dateKey).filter((f) => !solvedFips.has(f));
  const unsolvedGroups = puzzle.groups
    .filter((g) => !solvedColors.includes(g.color))
    .map((g) => toGroup(dataset, puzzle, g.color));

  const shareRows = (today?.submissions ?? []).map((sub) => shareRow(puzzle, sub));
  const won = today?.won ?? false;
  return {
    dateKey,
    puzzleNumber: puzzleNumber(dateKey),
    puzzle,
    solvedGroups,
    remainingFips,
    mistakes,
    mistakesLeft: MISTAKE_LIMIT - mistakes,
    finished: today?.finished ?? false,
    won,
    unsolvedGroups,
    shareRows,
    shareText: buildShareText({ puzzleNumber: puzzleNumber(dateKey), solved: won, mistakes, rows: shareRows }),
    streak: state.streak,
  };
}

export type ApplyResult =
  | { ok: true; state: ConnectionsState; result: SubmissionResult }
  | { ok: false; reason: "finished" | "duplicate" | "invalid" };

const keyOf = (fips4: string[]) => [...fips4].sort().join(",");

export function applySubmission(
  payload: ConnectionsPayload,
  state: ConnectionsState,
  dateKey: string,
  fips4: string[]
): ApplyResult {
  if (fips4.length !== 4 || new Set(fips4).size !== 4) return { ok: false, reason: "invalid" };
  const puzzle = getDailyPuzzle(payload, dateKey);
  const started = startDay(state, dateKey);
  if (started.today!.finished) return { ok: false, reason: "finished" };
  const k = keyOf(fips4);
  if (started.today!.submissions.some((s) => keyOf(s) === k)) return { ok: false, reason: "duplicate" };
  const result = evaluateSubmission(puzzle, fips4);
  const next = recordSubmission(started, fips4, result, dateKey);
  return { ok: true, state: next, result };
}
