import { describe, it, expect } from "vitest";
import { suiteStatus } from "./status";
import type { StorageLike } from "../countle/persistence";

function mem(entries: Record<string, unknown> = {}): StorageLike {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(entries)) map.set(k, JSON.stringify(v));
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); } };
}
const DATE = "2026-06-27";

describe("suiteStatus", () => {
  it("empty storage → all three games 'new', streak 0, no result", () => {
    const s = suiteStatus(mem(), DATE);
    expect(s.map((g) => g.id)).toEqual(["countle", "connections", "warmer"]);
    expect(s.every((g) => g.status === "new" && g.streak === 0 && g.resultLabel === null)).toBe(true);
    expect(s[0].href).toBe("/countle");
    expect(s[0].accent).toBe("#16a34a");
  });

  it("Countle finished+solved today → done with 'solved in N' + streak", () => {
    const storage = mem({
      "countle-v1": { schemaVersion: 1, streak: 4, today: { dateKey: DATE, guesses: ["1", "2", "3"], solved: true, finished: true } },
    });
    const c = suiteStatus(storage, DATE)[0];
    expect(c.status).toBe("done");
    expect(c.resultLabel).toBe("solved in 3");
    expect(c.streak).toBe(4);
  });

  it("Connections in progress today → playing; lost → 'missed'", () => {
    const playing = suiteStatus(mem({
      "connections-v1": { schemaVersion: 1, streak: 0, today: { dateKey: DATE, submissions: [["a","b","c","d"]], solvedColors: [], mistakes: 1, finished: false, won: false } },
    }), DATE)[1];
    expect(playing.status).toBe("playing");
    expect(playing.resultLabel).toBeNull();

    const lost = suiteStatus(mem({
      "connections-v1": { schemaVersion: 1, streak: 0, today: { dateKey: DATE, submissions: [], solvedColors: [], mistakes: 4, finished: true, won: false } },
    }), DATE)[1];
    expect(lost.status).toBe("done");
    expect(lost.resultLabel).toBe("missed");
  });

  it("Warmer gave up → done 'gave up'; solved → 'found in N'", () => {
    const gaveUp = suiteStatus(mem({
      "warmer-v1": { schemaVersion: 1, streak: 0, today: { dateKey: DATE, guesses: ["1","2"], solved: false, gaveUp: true } },
    }), DATE)[2];
    expect(gaveUp.status).toBe("done");
    expect(gaveUp.resultLabel).toBe("gave up");

    const solved = suiteStatus(mem({
      "warmer-v1": { schemaVersion: 1, streak: 2, today: { dateKey: DATE, guesses: ["1","2","3","4","5"], solved: true, gaveUp: false } },
    }), DATE)[2];
    expect(solved.resultLabel).toBe("found in 5");
    expect(solved.streak).toBe(2);
  });

  it("a stale day (today from a different date) is treated as 'new'", () => {
    const c = suiteStatus(mem({
      "countle-v1": { schemaVersion: 1, streak: 9, today: { dateKey: "2026-06-26", guesses: ["1"], solved: true, finished: true } },
    }), DATE)[0];
    expect(c.status).toBe("new");
    expect(c.resultLabel).toBeNull();
    expect(c.streak).toBe(9); // streak still surfaces
  });
});
