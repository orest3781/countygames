import { describe, it, expect } from "vitest";
import { tierEmoji, buildShareText } from "./share";

describe("tierEmoji", () => {
  it("maps each tier to its square", () => {
    expect(tierEmoji("found")).toBe("🟩");
    expect(tierEmoji("hot")).toBe("🟥");
    expect(tierEmoji("warm")).toBe("🟧");
    expect(tierEmoji("tepid")).toBe("🟨");
    expect(tierEmoji("cold")).toBe("🟦");
  });
});

describe("buildShareText", () => {
  it("solved: names the state + guess count + ends on the found square", () => {
    const t = buildShareText({ puzzleNumber: 12, stateName: "Texas", guessCount: 4, solved: true, tiers: ["cold", "tepid", "warm", "found"] });
    expect(t).toContain("Warmer #12");
    expect(t).toContain("found it in Texas in 4");
    expect(t).toContain("🟦🟨🟧🟩");
    expect(t).toContain("county.games");
  });
  it("gave up: names the state, no 'found it'", () => {
    const t = buildShareText({ puzzleNumber: 12, stateName: "Texas", guessCount: 9, solved: false, tiers: ["cold", "cold"] });
    expect(t).toContain("gave up (Texas)");
    expect(t).not.toContain("found it");
  });
});
