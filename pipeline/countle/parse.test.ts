import { describe, it, expect } from "vitest";
import { parseGazetteer, parseCensus, parseHealth, parseFema } from "./parse";

describe("parseGazetteer", () => {
  // Tab-delimited, real column headers (subset).
  const txt =
    "USPS\tGEOID\tNAME\tALAND_SQMI\tINTPTLAT\tINTPTLONG\n" +
    "AL\t01001\tAutauga County\t594.4\t32.532237\t-86.646440\n" +
    "PR\t72001\tAdjuntas Municipio\t67.6\t18.18\t-66.75\n"; // territory → dropped
  it("parses US counties and drops territories", () => {
    const rows = parseGazetteer(txt);
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      fips: "01001", name: "Autauga County", state_abbr: "AL", state_name: "Alabama",
    });
    expect(rows[0].lat).toBeCloseTo(32.532237);
    expect(rows[0].land_area_sq_mi).toBeCloseTo(594.4);
  });
});

describe("parseCensus", () => {
  // Census API returns an array-of-arrays; first row is headers.
  const json = JSON.stringify([
    ["NAME","B01003_001E","B19013_001E","B19301_001E","B15003_022E","B15003_001E","B15003_017E","B23025_003E","B23025_005E","B25001_001E","B25003_002E","B25003_001E","B01002_001E","state","county"],
    ["Autauga County, Alabama","58805","67565","35640","9000","40000","12000","26000","1300","22000","17000","21000","38.6","01","001"],
    ["Adjuntas, PR","18000","20000","10000","1000","12000","3000","6000","400","7000","5000","6500","40","72","001"], // dropped
  ]);
  it("parses US county rows and computes pct fields", () => {
    const rows = parseCensus(json);
    expect(rows.length).toBe(1);
    expect(rows[0].fips).toBe("01001");
    expect(rows[0].population).toBe(58805);
    expect(rows[0].median_household_income).toBe(67565);
    expect(rows[0].pct_bachelors_or_higher).toBeCloseTo(22.5); // 9000/40000*100
    expect(rows[0].unemployment_rate).toBeCloseTo(5.0); // 1300/26000*100
  });
});

describe("parseHealth", () => {
  // CHR CSV: row 1 = headers, row 2 = descriptions (skipped), row 3+ = data.
  const csv =
    "5-digit FIPS Code,Life Expectancy raw value,Primary Care Physicians raw value,Uninsured raw value,Violent Crime raw value\n" +
    "fipscode,desc,desc,desc,desc\n" +
    "01001,76.8,55.2,9.1,320.5\n" +
    "01000,79.0,60,8,300\n"; // state summary (ends 000) → dropped
  it("skips the description row and state summaries", () => {
    const rows = parseHealth(csv);
    expect(rows.length).toBe(1);
    expect(rows[0].fips).toBe("01001");
    expect(rows[0].life_expectancy).toBeCloseTo(76.8);
    expect(rows[0].pct_uninsured).toBeCloseTo(9.1);
  });
});

describe("parseFema", () => {
  it("aggregates county disaster counts and drops 000 county codes", () => {
    const counts = parseFema([
      { fipsStateCode: "01", fipsCountyCode: "001" },
      { fipsStateCode: "01", fipsCountyCode: "001" },
      { fipsStateCode: "01", fipsCountyCode: "000" }, // statewide → dropped
      { fipsStateCode: "72", fipsCountyCode: "001" }, // territory → dropped
    ]);
    expect(counts.get("01001")).toBe(2);
    expect(counts.has("72001")).toBe(false);
  });
});
