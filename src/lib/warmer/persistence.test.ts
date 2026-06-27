import { describe, it, expect } from "vitest";
import { STORAGE_KEY, loadWarmerState, saveWarmerState, type StorageLike } from "./persistence";
import { initialState } from "./state";

function mem(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); } };
}

describe("warmer persistence", () => {
  it("uses the warmer-v1 key", () => {
    expect(STORAGE_KEY).toBe("warmer-v1");
  });
  it("round-trips and defaults to initial when empty/malformed", () => {
    const s = mem();
    expect(loadWarmerState(s)).toEqual(initialState());
    const state = { ...initialState(), gamesPlayed: 2, solves: 1 };
    saveWarmerState(s, state);
    expect(loadWarmerState(s)).toEqual(state);
    s.map.set(STORAGE_KEY, "{bad");
    expect(loadWarmerState(s)).toEqual(initialState());
  });
});
