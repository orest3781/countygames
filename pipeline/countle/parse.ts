import { parse } from "csv-parse/sync";
import AdmZip from "adm-zip";

/** State FIPS (2-digit) → { abbr, name } for the 50 states + DC (territories excluded). */
const STATE_FIPS: Record<string, { abbr: string; name: string }> = {
  "01": { abbr: "AL", name: "Alabama" }, "02": { abbr: "AK", name: "Alaska" },
  "04": { abbr: "AZ", name: "Arizona" }, "05": { abbr: "AR", name: "Arkansas" },
  "06": { abbr: "CA", name: "California" }, "08": { abbr: "CO", name: "Colorado" },
  "09": { abbr: "CT", name: "Connecticut" }, "10": { abbr: "DE", name: "Delaware" },
  "11": { abbr: "DC", name: "District of Columbia" }, "12": { abbr: "FL", name: "Florida" },
  "13": { abbr: "GA", name: "Georgia" }, "15": { abbr: "HI", name: "Hawaii" },
  "16": { abbr: "ID", name: "Idaho" }, "17": { abbr: "IL", name: "Illinois" },
  "18": { abbr: "IN", name: "Indiana" }, "19": { abbr: "IA", name: "Iowa" },
  "20": { abbr: "KS", name: "Kansas" }, "21": { abbr: "KY", name: "Kentucky" },
  "22": { abbr: "LA", name: "Louisiana" }, "23": { abbr: "ME", name: "Maine" },
  "24": { abbr: "MD", name: "Maryland" }, "25": { abbr: "MA", name: "Massachusetts" },
  "26": { abbr: "MI", name: "Michigan" }, "27": { abbr: "MN", name: "Minnesota" },
  "28": { abbr: "MS", name: "Mississippi" }, "29": { abbr: "MO", name: "Missouri" },
  "30": { abbr: "MT", name: "Montana" }, "31": { abbr: "NE", name: "Nebraska" },
  "32": { abbr: "NV", name: "Nevada" }, "33": { abbr: "NH", name: "New Hampshire" },
  "34": { abbr: "NJ", name: "New Jersey" }, "35": { abbr: "NM", name: "New Mexico" },
  "36": { abbr: "NY", name: "New York" }, "37": { abbr: "NC", name: "North Carolina" },
  "38": { abbr: "ND", name: "North Dakota" }, "39": { abbr: "OH", name: "Ohio" },
  "40": { abbr: "OK", name: "Oklahoma" }, "41": { abbr: "OR", name: "Oregon" },
  "42": { abbr: "PA", name: "Pennsylvania" }, "44": { abbr: "RI", name: "Rhode Island" },
  "45": { abbr: "SC", name: "South Carolina" }, "46": { abbr: "SD", name: "South Dakota" },
  "47": { abbr: "TN", name: "Tennessee" }, "48": { abbr: "TX", name: "Texas" },
  "49": { abbr: "UT", name: "Utah" }, "50": { abbr: "VT", name: "Vermont" },
  "51": { abbr: "VA", name: "Virginia" }, "53": { abbr: "WA", name: "Washington" },
  "54": { abbr: "WV", name: "West Virginia" }, "55": { abbr: "WI", name: "Wisconsin" },
  "56": { abbr: "WY", name: "Wyoming" },
};

function rows(text: string, delimiter = ","): Record<string, string>[] {
  return parse(text, { delimiter, columns: true, skip_empty_lines: true, trim: true, relax_column_count: true });
}

export interface GazRow {
  fips: string; name: string; state_abbr: string; state_name: string;
  land_area_sq_mi: number | null; lat: number | null; lng: number | null;
}

export function parseGazetteer(text: string): GazRow[] {
  return rows(text, "\t")
    .map((r): GazRow | null => {
      const fips = (r["GEOID"] || "").trim().padStart(5, "0");
      const st = STATE_FIPS[fips.substring(0, 2)];
      if (!st) return null;
      return {
        fips,
        name: (r["NAME"] || "").trim(),
        state_abbr: st.abbr,
        state_name: st.name,
        land_area_sq_mi: parseFloat(r["ALAND_SQMI"] || "") || null,
        lat: parseFloat(r["INTPTLAT"] || "") || null,
        lng: parseFloat(r["INTPTLONG"] || "") || null,
      };
    })
    .filter((x): x is GazRow => x !== null);
}

export interface CensusRow {
  fips: string; population: number | null; median_household_income: number | null;
  pct_bachelors_or_higher: number | null; unemployment_rate: number | null;
}

export function parseCensus(jsonText: string): CensusRow[] {
  const data: string[][] = JSON.parse(jsonText);
  const headers = data[0];
  const col = (name: string) => headers.indexOf(name);
  return data
    .slice(1)
    .map((row): CensusRow | null => {
      const stateFips = row[col("state")];
      const fips = stateFips + row[col("county")];
      if (!STATE_FIPS[stateFips]) return null;
      const pop = parseInt(row[col("B01003_001E")]) || null;
      const income = parseInt(row[col("B19013_001E")]) || null;
      const bachelors = parseInt(row[col("B15003_022E")]) || 0;
      const pop25 = parseInt(row[col("B15003_001E")]) || 1;
      const labor = parseInt(row[col("B23025_003E")]) || 1;
      const unemp = parseInt(row[col("B23025_005E")]) || 0;
      return {
        fips,
        population: pop,
        median_household_income: income,
        pct_bachelors_or_higher: pop25 > 0 ? Math.round((bachelors / pop25) * 10000) / 100 : null,
        unemployment_rate: labor > 0 ? Math.round((unemp / labor) * 10000) / 100 : null,
      };
    })
    .filter((x): x is CensusRow => x !== null);
}

export function parseGdp(zipBuf: Buffer): Map<string, number> {
  const zip = new AdmZip(zipBuf);
  const entry = zip.getEntries().find((e) => e.entryName.includes("ALL_AREAS") && e.entryName.endsWith(".csv"));
  if (!entry) throw new Error("Could not find ALL_AREAS CSV in BEA zip");
  const recs = rows(entry.getData().toString("utf-8"));
  const yearCols = Object.keys(recs[0]).filter((k) => /^\d{4}$/.test(k));
  const latestYear = yearCols[yearCols.length - 1];
  const out = new Map<string, number>();
  for (const r of recs) {
    if ((r["LineCode"] || "").trim() !== "3") continue;
    let fips = (r["GeoFIPS"] || "").replace(/"/g, "").trim();
    if (fips.length < 5) continue;
    fips = fips.padStart(5, "0");
    if (fips.endsWith("000")) continue;
    if (!STATE_FIPS[fips.substring(0, 2)]) continue;
    const gdp = parseInt((r[latestYear] || "").replace(/,/g, "").replace(/\(.*\)/, "").trim());
    if (!isNaN(gdp) && gdp > 0) out.set(fips, gdp);
  }
  return out;
}

export interface HealthRow {
  fips: string; life_expectancy: number | null; primary_care_physicians_rate: number | null;
  pct_uninsured: number | null; violent_crime_rate: number | null;
}

export function parseHealth(csvText: string): HealthRow[] {
  // CHR CSV has TWO header rows: keep line 0 (names), drop line 1 (descriptions).
  const lines = csvText.split("\n");
  const recs = rows([lines[0], ...lines.slice(2)].join("\n"));
  const keys = Object.keys(recs[0] || {});
  const find = (needle: string) => keys.find((k) => k.toLowerCase().includes(needle.toLowerCase())) ?? null;
  const fipsCol = find("5-digit FIPS") || find("FIPS");
  const lifeCol = find("Life Expectancy raw value");
  const physCol = find("Primary Care Physicians raw value");
  const uninsCol = find("Uninsured raw value");
  const crimeCol = find("Violent Crime raw value") || find("Violent Crime Rate");
  if (!fipsCol) throw new Error("CHR: could not find FIPS column");
  const num = (r: Record<string, string>, c: string | null) => {
    if (!c) return null;
    const raw = (r[c] || "").replace(/,/g, "").trim();
    if (!raw || raw === ".") return null;
    const v = parseFloat(raw);
    return isNaN(v) ? null : v;
  };
  return recs
    .map((r): HealthRow | null => {
      let fips = (r[fipsCol] || "").replace(/"/g, "").trim();
      if (!fips || fips.length < 4) return null;
      fips = fips.padStart(5, "0");
      if (fips.endsWith("000")) return null;
      if (!STATE_FIPS[fips.substring(0, 2)]) return null;
      return {
        fips,
        life_expectancy: num(r, lifeCol),
        primary_care_physicians_rate: num(r, physCol),
        pct_uninsured: num(r, uninsCol),
        violent_crime_rate: num(r, crimeCol),
      };
    })
    .filter((x): x is HealthRow => x !== null);
}

export function parseFema(records: { fipsStateCode: string; fipsCountyCode: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of records) {
    const stateFips = (r.fipsStateCode || "").padStart(2, "0");
    const countyFips = (r.fipsCountyCode || "").padStart(3, "0");
    if (countyFips === "000") continue;
    if (!STATE_FIPS[stateFips]) continue;
    const fips = stateFips + countyFips;
    counts.set(fips, (counts.get(fips) ?? 0) + 1);
  }
  return counts;
}
