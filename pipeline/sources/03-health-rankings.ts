/**
 * 03-health-rankings.ts — County Health Rankings data.
 * Annual CSV with 30+ health/socioeconomic metrics per county.
 */
import { downloadAndCache, parseCSV, batchUpsert, STATE_FIPS, supabase, fetchAllCountyFips } from "../config.js";

const HEALTH_URL =
  "https://www.countyhealthrankings.org/sites/default/files/media/document/analytic_data2024.csv";

async function main() {
  console.log("=== 03-health-rankings: Loading health data ===");

  const text = await downloadAndCache(HEALTH_URL, "health_rankings_2024.csv");

  // The CHR CSV has two header rows: row 1 is column names, row 2 is descriptions
  const lines = text.split("\n");
  // Remove the second line (description row)
  const cleanedText = [lines[0], ...lines.slice(2)].join("\n");

  const records = parseCSV(cleanedText);
  console.log(`  Parsed ${records.length} records`);

  // Use the "5-digit FIPS Code" column
  const sampleKeys = Object.keys(records[0] || {});

  // Find relevant columns by searching for keywords
  const findCol = (patterns: string[]) => {
    for (const p of patterns) {
      const col = sampleKeys.find((k) => k.toLowerCase().includes(p.toLowerCase()));
      if (col) return col;
    }
    return null;
  };

  const fipsCol = findCol(["5-digit FIPS"]) || findCol(["FIPS"]);
  const lifeExpCol = findCol(["Life Expectancy raw value"]);
  const smokingCol = findCol(["Adult Smoking raw value"]);
  const obesityCol = findCol(["Adult Obesity raw value"]);
  const uninsuredCol = findCol(["Uninsured raw value"]);
  const crimeCol = findCol(["Violent Crime raw value", "Violent Crime Rate"]);
  const physiciansCol = findCol(["Primary Care Physicians raw value"]);
  const collegeCol = findCol(["Some College raw value"]);
  // Health outcomes/factors — try rank columns
  const healthOutcomesRankCol = findCol(["Health Outcomes Rank"]);
  const healthFactorsRankCol = findCol(["Health Factors Rank"]);

  console.log(`  FIPS column: "${fipsCol}"`);
  console.log("  Mapped columns:", {
    lifeExpCol,
    smokingCol,
    obesityCol,
    uninsuredCol,
    crimeCol,
    physiciansCol,
    collegeCol,
    healthOutcomesRankCol,
    healthFactorsRankCol,
  });

  if (!fipsCol) {
    console.log("  All columns:", sampleKeys);
    throw new Error("Could not find FIPS column");
  }

  const rows = records
    .map((r) => {
      let fips = (r[fipsCol] || "").replace(/"/g, "").trim();
      if (!fips || fips.length < 4) return null;
      fips = fips.padStart(5, "0");

      // Skip state summary rows (end in 000)
      if (fips.endsWith("000")) return null;

      const stateFips = fips.substring(0, 2);
      if (!STATE_FIPS[stateFips]) return null;

      const getNum = (col: string | null) => {
        if (!col) return null;
        const raw = (r[col] || "").replace(/,/g, "").trim();
        if (!raw || raw === "" || raw === ".") return null;
        const val = parseFloat(raw);
        return isNaN(val) ? null : val;
      };

      const getInt = (col: string | null) => {
        if (!col) return null;
        const raw = (r[col] || "").replace(/,/g, "").trim();
        if (!raw || raw === "" || raw === ".") return null;
        const val = parseInt(raw);
        return isNaN(val) ? null : val;
      };

      return {
        fips,
        health_outcomes_rank: getInt(healthOutcomesRankCol),
        health_factors_rank: getInt(healthFactorsRankCol),
        life_expectancy: getNum(lifeExpCol),
        pct_smokers: getNum(smokingCol),
        pct_obese: getNum(obesityCol),
        pct_uninsured: getNum(uninsuredCol),
        violent_crime_rate: getNum(crimeCol),
        primary_care_physicians_rate: getNum(physiciansCol),
        pct_some_college: getNum(collegeCol),
      };
    })
    .filter(Boolean);

  console.log(`  Filtered to ${rows.length} US county health records`);

  // Filter to only FIPS that exist in counties table (CT reorganized)
  const existingFips = await fetchAllCountyFips();

  const validRows = (rows as Record<string, unknown>[]).filter(
    (r) => existingFips.has(r.fips as string)
  );
  console.log(`  After FK filter: ${validRows.length} (dropped ${rows.length - validRows.length})`);

  // Show a sample record
  if (validRows.length > 0) {
    console.log("  Sample:", JSON.stringify(validRows[0], null, 2));
  }

  const count = await batchUpsert("raw_health", validRows);
  console.log(`=== Done: ${count} health records loaded ===`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
