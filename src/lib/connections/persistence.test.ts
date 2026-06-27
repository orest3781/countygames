import { describe, it, expect } from "vitest";
import { STORAGE_KEY, loadConnectionsState, saveConnectionsState, type StorageLike } from "./persistence";
import { initialState } from "./state";

function memStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); } };
}

describe("connections persistence", () => {
  it("uses the connections-v1 key", () => {
    expect(STORAGE_KEY).toBe("connections-v1");
  });
  it("round-trips state", () => {
    const s = memStorage();
    const state = { ...initialState(), gamesPlayed: 2, wins: 1, streak: 1 };
    saveConnectionsState(s, state);
    expect(s.map.get(STORAGE_KEY)).toBeTypeOf("string");
    expect(loadConnectionsState(s)).toEqual(state);
  });
  it("returns initial state when empty or malformed", () => {
    const s = memStorage();
    expect(loadConnectionsState(s)).toEqual(initialState());
    s.map.set(STORAGE_KEY, "{not json");
    expect(loadConnectionsState(s)).toEqual(initialState());
  });
});
