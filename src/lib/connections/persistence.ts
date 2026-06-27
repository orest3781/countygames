import { parseState, serializeState } from "./state";
import type { ConnectionsState } from "./types";

export const STORAGE_KEY = "connections-v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadConnectionsState(storage: StorageLike): ConnectionsState {
  return parseState(storage.getItem(STORAGE_KEY));
}

export function saveConnectionsState(storage: StorageLike, state: ConnectionsState): void {
  storage.setItem(STORAGE_KEY, serializeState(state));
}
