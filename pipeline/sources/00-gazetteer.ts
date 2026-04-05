/**
 * 00-gazetteer.ts — Foundation script. MUST RUN FIRST.
 * Downloads Census Gazetteer (zip) and creates all ~3,143 county rows.
 */
import { downloadBuffer, parseCSV, batchUpsert, STATE_FIPS } from "../config.js";
import AdmZip from "adm-zip";

const GAZETTEER_URL =
  "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_counties_national.zip";

async function main() {
  console.log("=== 00-gazetteer: Loading county foundation ===");

  const zipBuf = await downloadBuffer(GAZETTEER_URL, "gazetteer_counties.zip");
  const zip = new AdmZip(zipBuf);
  const entries = zip.getEntries();
  const txtEntry = entries.find((e) => e.entryName.endsWith(".txt"));
  if (!txtEntry) throw new Error("No .txt file found in gazetteer zip");

  console.log(`  Extracting ${txtEntry.entryName}`);
  const text = txtEntry.getData().toString("utf-8");

  // Gazetteer is tab-delimited
  const records = parseCSV(text, { delimiter: "\t" });
  console.log(`  Parsed ${records.length} records`);

  // Log column names for debugging
  if (records.length > 0) {
    console.log(`  Columns: ${Object.keys(records[0]).join(", ")}`);
  }

  const rows = records
    .map((r) => {
      // GEOID is the 5-digit FIPS code
      const fips = (r["GEOID"] || "").trim().padStart(5, "0");
      const stateFips = fips.substring(0, 2);
      const stateInfo = STATE_FIPS[stateFips];

      // Skip territories (PR, VI, GU, AS, MP)
      if (!stateInfo) return null;

      // NAME is like "Autauga County"
      const name = (r["NAME"] || "").trim();
      const landArea = parseFloat(r["ALAND_SQMI"] || "0");
      const lat = parseFloat(r["INTPTLAT"] || "0");
      const lng = parseFloat(r["INTPTLONG"] || "0");

      return {
        fips,
        name,
        state_fips: stateFips,
        state_name: stateInfo.name,
        state_abbr: stateInfo.abbr,
        land_area_sq_mi: landArea || null,
        latitude: lat || null,
        longitude: lng || null,
        is_curated: false,
      };
    })
    .filter(Boolean);

  console.log(`  Filtered to ${rows.length} US counties (excl. territories)`);

  const count = await batchUpsert("counties", rows as Record<string, unknown>[]);
  console.log(`=== Done: ${count} counties loaded ===`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
