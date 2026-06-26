import { parseState, serializeState } from "./state";
import type { CountleState } from "./types";

export const STORAGE_KEY = "countle-v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadStateFrom(storage: StorageLike): CountleState {
  return parseState(storage.getItem(STORAGE_KEY));
}

export function saveStateTo(storage: StorageLike, state: CountleState): void {
  storage.setItem(STORAGE_KEY, serializeState(state));
}
