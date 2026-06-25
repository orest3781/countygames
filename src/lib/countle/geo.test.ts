import { describe, it, expect } from "vitest";
import { haversineMiles, bearingDeg, compass8 } from "./geo";

const NYC = { lat: 40.7128, lng: -74.006 };
const LA = { lat: 34.0522, lng: -118.2437 };

describe("haversineMiles", () => {
  it("is 0 for identical points", () => {
    expect(haversineMiles(NYC, NYC)).toBe(0);
  });
  it("NYC→LA ≈ 2445 mi (±25)", () => {
    expect(haversineMiles(NYC, LA)).toBeGreaterThan(2420);
    expect(haversineMiles(NYC, LA)).toBeLessThan(2470);
  });
});

describe("bearingDeg + compass8", () => {
  it("due north", () => {
    const b = bearingDeg({ lat: 0, lng: 0 }, { lat: 10, lng: 0 });
    expect(Math.round(b)).toBe(0);
    expect(compass8(b)).toEqual({ arrow: "↑", label: "north" });
  });
  it("due east", () => {
    const b = bearingDeg({ lat: 0, lng: 0 }, { lat: 0, lng: 10 });
    expect(Math.round(b)).toBe(90);
    expect(compass8(b).label).toBe("east");
  });
  it("NYC→LA points west-ish", () => {
    expect(compass8(bearingDeg(NYC, LA)).label).toBe("west");
  });
  it("wraps 360 back to north", () => {
    expect(compass8(360)).toEqual({ arrow: "↑", label: "north" });
  });
});
