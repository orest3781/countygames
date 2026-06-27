import { parseState, serializeState } from "./state";
import type { WarmerState } from "./types";

export const STORAGE_KEY = "warmer-v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadWarmerState(storage: StorageLike): WarmerState {
  return parseState(storage.getItem(STORAGE_KEY));
}

export function saveWarmerState(storage: StorageLike, state: WarmerState): void {
  storage.setItem(STORAGE_KEY, serializeState(state));
}
