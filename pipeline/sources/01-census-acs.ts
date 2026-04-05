/**
 * 01-census-acs.ts — Demographics + economics from ACS 5-Year.
 * Single API call returns all counties. No key required.
 *
 * Variables:
 *   B01003_001E = Total population
 *   B19013_001E = Median household income
 *   B19301_001E = Per capita income
 *   B15003_022E = Bachelor's degree holders (25+)
 *   B15003_017E = High school diploma holders (25+)
 *   B01003_001E = (reused for pop base for education %)
 *   B23025_003E = Civilian labor force
 *   B23025_005E = Unemployed
 *   B25001_001E = Total housing units
 *   B25003_002E = Owner-occupied housing units
 *   B25003_001E = Occupied housing units (for owner-occ %)
 *   B15003_001E = Total pop 25+ (education denominator)
 *   B01002_001E = Median age
 */
import { downloadAndCache, batchUpsert, STATE_FIPS } from "../config.js";

const CENSUS_URL =
  "https://api.census.gov/data/2022/acs/acs5?get=NAME,B01003_001E,B19013_001E,B19301_001E,B15003_022E,B15003_001E,B15003_017E,B23025_003E,B23025_005E,B25001_001E,B25003_002E,B25003_001E,B01002_001E&for=county:*&in=state:*";

async function main() {
  console.log("=== 01-census-acs: Loading ACS 5-Year data ===");

  const text = await downloadAndCache(CENSUS_URL, "census_acs.json");
  const data: string[][] = JSON.parse(text);

  // First row is headers
  const headers = data[0];
  const rows = data.slice(1);
  console.log(`  Parsed ${rows.length} county records`);

  const records = rows
    .map((row) => {
      const stateFips = row[headers.indexOf("state")];
      const countyFips = row[headers.indexOf("county")];
      const fips = stateFips + countyFips;

      // Skip territories
      if (!STATE_FIPS[stateFips]) return null;

      const pop = parseInt(row[headers.indexOf("B01003_001E")]) || null;
      const medianIncome = parseInt(row[headers.indexOf("B19013_001E")]) || null;
      const perCapitaIncome = parseInt(row[headers.indexOf("B19301_001E")]) || null;
      const bachelors = parseInt(row[headers.indexOf("B15003_022E")]) || 0;
      const pop25plus = parseInt(row[headers.indexOf("B15003_001E")]) || 1;
      const highSchool = parseInt(row[headers.indexOf("B15003_017E")]) || 0;
      const laborForce = parseInt(row[headers.indexOf("B23025_003E")]) || 1;
      const unemployed = parseInt(row[headers.indexOf("B23025_005E")]) || 0;
      const housingUnits = parseInt(row[headers.indexOf("B25001_001E")]) || null;
      const ownerOccupied = parseInt(row[headers.indexOf("B25003_002E")]) || 0;
      const occupiedUnits = parseInt(row[headers.indexOf("B25003_001E")]) || 1;
      const medianAge = parseFloat(row[headers.indexOf("B01002_001E")]) || null;

      const pctBachelors = pop25plus > 0 ? (bachelors / pop25plus) * 100 : null;
      const pctHighSchool = pop25plus > 0 ? (highSchool / pop25plus) * 100 : null;
      const unemploymentRate = laborForce > 0 ? (unemployed / laborForce) * 100 : null;
      const pctOwnerOccupied = occupiedUnits > 0 ? (ownerOccupied / occupiedUnits) * 100 : null;

      return {
        fips,
        population: pop,
        median_household_income: medianIncome,
        per_capita_income: perCapitaIncome,
        pct_bachelors_or_higher: pctBachelors ? Math.round(pctBachelors * 100) / 100 : null,
        pct_high_school_or_higher: pctHighSchool ? Math.round(pctHighSchool * 100) / 100 : null,
        median_age: medianAge,
        unemployment_rate: unemploymentRate ? Math.round(unemploymentRate * 100) / 100 : null,
        total_housing_units: housingUnits,
        pct_owner_occupied: pctOwnerOccupied ? Math.round(pctOwnerOccupied * 100) / 100 : null,
      };
    })
    .filter(Boolean);

  console.log(`  Filtered to ${records.length} US county records`);

  const count = await batchUpsert("raw_census", records as Record<string, unknown>[]);
  console.log(`=== Done: ${count} census records loaded ===`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
