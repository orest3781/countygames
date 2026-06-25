import { describe, it, expect } from "vitest";
import { buildShareText } from "./share";

describe("buildShareText", () => {
  const rows = ["🟨⬛⬛🟩🟨⬛", "🟩🟩🟩🟩🟩🟩"];
  it("solved: header shows guesses/6 and streak, then rows, then footer", () => {
    const out = buildShareText({ puzzleNumber: 247, solved: true, guessCount: 2, streak: 12, rows });
    expect(out).toBe(["Countle #247  2/6  🔥12", "🟨⬛⬛🟩🟨⬛", "🟩🟩🟩🟩🟩🟩", "countle.app"].join("\n"));
  });
  it("failed: score is X/6", () => {
    const out = buildShareText({ puzzleNumber: 247, solved: false, guessCount: 6, streak: 0, rows });
    expect(out.split("\n")[0]).toBe("Countle #247  X/6  🔥0");
  });
});
