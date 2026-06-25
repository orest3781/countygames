import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { buildDataset, getDailyCounty, evaluateGuess, dateKeyUTC, puzzleNumber } from "./index";
import type { CountiesPayload } from "./types";

const payload = JSON.parse(
  readFileSync(join(process.cwd(), "public", "data", "counties.json"), "utf-8")
) as CountiesPayload;
const ds = buildDataset(payload);

describe("real dataset", () => {
  it("has 3,144 counties and a 271-county answer pool", () => {
    expect(ds.all.length).toBe(3144);
    expect(ds.answerPoolFips.length).toBe(271);
    expect(ds.byFips.size).toBe(3144); // no duplicate fips keys
  });
  it("daily selection is deterministic and always an answer-pool county", () => {
    const a = getDailyCounty(ds, "2026-06-25");
    const b = getDailyCounty(ds, "2026-06-25");
    expect(a.fips).toBe(b.fips);
    expect(a.isAnswerPool).toBe(true);
  });
  it("a self-guess on the daily county is correct with an all-green row", () => {
    const day = getDailyCounty(ds, "2026-06-25");
    const r = evaluateGuess(day, day);
    expect(r.isCorrect).toBe(true);
    expect(r.shareRow).toBe("🟩🟩🟩🟩🟩🟩");
  });
  it("guessing LA (06037) against Cook (17031) yields a westbound-or-eastbound real distance", () => {
    const la = ds.byFips.get("06037")!;
    const cook = ds.byFips.get("17031")!;
    expect(la).toBeDefined();
    expect(cook).toBeDefined();
    const r = evaluateGuess(la, cook);
    expect(r.isCorrect).toBe(false);
    expect(r.distanceMiles).toBeGreaterThan(1500);
    expect(r.stats).toHaveLength(6);
  });
  it("puzzle number is 1 on the epoch date (2026-06-25)", () => {
    expect(puzzleNumber(dateKeyUTC(new Date("2026-06-25T12:00:00Z")))).toBe(1);
  });
});
