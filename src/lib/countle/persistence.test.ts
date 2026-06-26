import { describe, it, expect } from "vitest";
import { STORAGE_KEY, loadStateFrom, saveStateTo, type StorageLike } from "./persistence";
import { initialState } from "./state";
import { recordGuess, startDay } from "./state";

function memStorage(initial?: Record<string, string>): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; } };
}

describe("persistence", () => {
  it("STORAGE_KEY is countle-v1", () => {
    expect(STORAGE_KEY).toBe("countle-v1");
  });
  it("loads initial state when storage is empty", () => {
    expect(loadStateFrom(memStorage()).gamesPlayed).toBe(0);
  });
  it("round-trips a saved state under the right key", () => {
    const s = recordGuess(startDay(initialState(), "2026-06-25"), "06037", { isCorrect: true, dateKey: "2026-06-25", answerFips: "06037" });
    const store = memStorage();
    saveStateTo(store, s);
    expect(store.data[STORAGE_KEY]).toContain('"streak":1');
    expect(loadStateFrom(store).streak).toBe(1);
  });
  it("falls back to initial on corrupt stored data", () => {
    expect(loadStateFrom(memStorage({ [STORAGE_KEY]: "{garbage" })).gamesPlayed).toBe(0);
  });
});
