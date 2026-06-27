import { describe, it, expect } from "vitest";
import { bareCountyName, cardLabel } from "./labels";

describe("bareCountyName", () => {
  it("strips common county-type suffixes", () => {
    expect(bareCountyName("Travis County")).toBe("Travis");
    expect(bareCountyName("Orleans Parish")).toBe("Orleans");
    expect(bareCountyName("Prince of Wales-Hyder Census Area")).toBe("Prince of Wales-Hyder");
    expect(bareCountyName("Anchorage Municipality")).toBe("Anchorage");
    expect(bareCountyName("Juneau City and Borough")).toBe("Juneau");
    expect(bareCountyName("Carson City")).toBe("Carson"); // trailing " City" (case-insensitive)
  });
  it("leaves a name without a suffix unchanged", () => {
    expect(bareCountyName("Baltimore")).toBe("Baltimore");
  });
});

describe("cardLabel", () => {
  it("formats '<bare>, <ST>'", () => {
    expect(cardLabel("Travis County", "TX")).toBe("Travis, TX");
    expect(cardLabel("Cook County", "IL")).toBe("Cook, IL");
  });
});
