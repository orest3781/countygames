import { loadStateFrom, type StorageLike } from "../countle/persistence";
import { loadConnectionsState } from "../connections/persistence";
import { loadWarmerState } from "../warmer/persistence";

export type GameId = "countle" | "connections" | "warmer";
export type PlayStatus = "new" | "playing" | "done";

export interface GameStatus {
  id: GameId;
  name: string;
  tagline: string;
  href: string;
  accent: string;
  streak: number;
  status: PlayStatus;
  resultLabel: string | null;
}

const META: Record<GameId, { name: string; tagline: string; href: string; accent: string }> = {
  countle: { name: "Countle", tagline: "Guess the mystery county from its six stats", href: "/countle", accent: "#16a34a" },
  connections: { name: "County Connections", tagline: "Find the four hidden groups of sixteen", href: "/connections", accent: "#a96fc0" },
  warmer: { name: "Warmer", tagline: "Hot or cold — find today's county on the map", href: "/warmer", accent: "#dc2626" },
};

export function suiteStatus(storage: StorageLike, dateKey: string): GameStatus[] {
  const countle = loadStateFrom(storage);
  const connections = loadConnectionsState(storage);
  const warmer = loadWarmerState(storage);

  const cToday = countle.today && countle.today.dateKey === dateKey ? countle.today : null;
  const countleCard: GameStatus = {
    id: "countle", ...META.countle, streak: countle.streak,
    status: cToday ? (cToday.finished ? "done" : cToday.guesses.length > 0 ? "playing" : "new") : "new",
    resultLabel: cToday && cToday.finished ? (cToday.solved ? `solved in ${cToday.guesses.length}` : "out of guesses") : null,
  };

  const xToday = connections.today && connections.today.dateKey === dateKey ? connections.today : null;
  const connectionsCard: GameStatus = {
    id: "connections", ...META.connections, streak: connections.streak,
    status: xToday ? (xToday.finished ? "done" : xToday.submissions.length > 0 ? "playing" : "new") : "new",
    resultLabel: xToday && xToday.finished ? (xToday.won ? "solved" : "missed") : null,
  };

  const wToday = warmer.today && warmer.today.dateKey === dateKey ? warmer.today : null;
  const warmerDone = wToday ? wToday.solved || wToday.gaveUp : false;
  const warmerCard: GameStatus = {
    id: "warmer", ...META.warmer, streak: warmer.streak,
    status: wToday ? (warmerDone ? "done" : wToday.guesses.length > 0 ? "playing" : "new") : "new",
    resultLabel: wToday && warmerDone ? (wToday.solved ? `found in ${wToday.guesses.length}` : "gave up") : null,
  };

  return [countleCard, connectionsCard, warmerCard];
}
