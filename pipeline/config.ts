import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// Supabase client
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
if (!url || !key) throw new Error("Missing SUPABASE env vars in .env.local");

export const supabase = createClient(url, key);

// Data cache directory
const DATA_DIR = join(process.cwd(), "data");
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

/** Download a URL and cache it locally. Returns the file contents as a string. */
export async function downloadAndCache(
  url: string,
  filename: string
): Promise<string> {
  const filepath = join(DATA_DIR, filename);
  if (existsSync(filepath)) {
    console.log(`  [cache hit] ${filename}`);
    return readFileSync(filepath, "utf-8");
  }
  console.log(`  [downloading] ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const text = await res.text();
  writeFileSync(filepath, text, "utf-8");
  console.log(`  [saved] ${filename} (${(text.length / 1024).toFixed(0)} KB)`);
  return text;
}

/** Download a URL as a Buffer (for zip files etc). */
export async function downloadBuffer(
  url: string,
  filename: string
): Promise<Buffer> {
  const filepath = join(DATA_DIR, filename);
  if (existsSync(filepath)) {
    console.log(`  [cache hit] ${filename}`);
    return readFileSync(filepath) as Buffer;
  }
  console.log(`  [downloading] ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(filepath, buf);
  console.log(`  [saved] ${filename} (${(buf.length / 1024).toFixed(0)} KB)`);
  return buf;
}

/** Parse CSV/TSV text into records. */
export function parseCSV(
  text: string,
  options: {
    delimiter?: string;
    columns?: boolean | string[];
    skip_empty_lines?: boolean;
    trim?: boolean;
    from_line?: number;
  } = {}
): Record<string, string>[] {
  return parse(text, {
    delimiter: options.delimiter ?? ",",
    columns: options.columns ?? true,
    skip_empty_lines: options.skip_empty_lines ?? true,
    trim: options.trim ?? true,
    from_line: options.from_line,
    relax_column_count: true,
  });
}

/** Batch upsert rows into a Supabase table. */
export async function batchUpsert(
  table: string,
  rows: Record<string, unknown>[],
  batchSize = 500
): Promise<number> {
  let total = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).upsert(batch);
    if (error) {
      console.error(`  [error] batch ${i}-${i + batch.length}:`, error.message);
      throw error;
    }
    total += batch.length;
    console.log(`  [upserted] ${total}/${rows.length} into ${table}`);
  }
  return total;
}

/** Fetch all FIPS from counties table (paginated to handle 1000-row server limit). */
export async function fetchAllCountyFips(): Promise<Set<string>> {
  const fips = new Set<string>();
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data } = await supabase
      .from("counties")
      .select("fips")
      .range(offset, offset + limit - 1);
    if (!data || data.length === 0) break;
    for (const r of data) fips.add(r.fips.trim());
    if (data.length < limit) break;
    offset += limit;
  }
  return fips;
}

/** US state FIPS → abbreviation + name lookup */
export const STATE_FIPS: Record<
  string,
  { abbr: string; name: string }
> = {
  "01": { abbr: "AL", name: "Alabama" },
  "02": { abbr: "AK", name: "Alaska" },
  "04": { abbr: "AZ", name: "Arizona" },
  "05": { abbr: "AR", name: "Arkansas" },
  "06": { abbr: "CA", name: "California" },
  "08": { abbr: "CO", name: "Colorado" },
  "09": { abbr: "CT", name: "Connecticut" },
  "10": { abbr: "DE", name: "Delaware" },
  "11": { abbr: "DC", name: "District of Columbia" },
  "12": { abbr: "FL", name: "Florida" },
  "13": { abbr: "GA", name: "Georgia" },
  "15": { abbr: "HI", name: "Hawaii" },
  "16": { abbr: "ID", name: "Idaho" },
  "17": { abbr: "IL", name: "Illinois" },
  "18": { abbr: "IN", name: "Indiana" },
  "19": { abbr: "IA", name: "Iowa" },
  "20": { abbr: "KS", name: "Kansas" },
  "21": { abbr: "KY", name: "Kentucky" },
  "22": { abbr: "LA", name: "Louisiana" },
  "23": { abbr: "ME", name: "Maine" },
  "24": { abbr: "MD", name: "Maryland" },
  "25": { abbr: "MA", name: "Massachusetts" },
  "26": { abbr: "MI", name: "Michigan" },
  "27": { abbr: "MN", name: "Minnesota" },
  "28": { abbr: "MS", name: "Mississippi" },
  "29": { abbr: "MO", name: "Missouri" },
  "30": { abbr: "MT", name: "Montana" },
  "31": { abbr: "NE", name: "Nebraska" },
  "32": { abbr: "NV", name: "Nevada" },
  "33": { abbr: "NH", name: "New Hampshire" },
  "34": { abbr: "NJ", name: "New Jersey" },
  "35": { abbr: "NM", name: "New Mexico" },
  "36": { abbr: "NY", name: "New York" },
  "37": { abbr: "NC", name: "North Carolina" },
  "38": { abbr: "ND", name: "North Dakota" },
  "39": { abbr: "OH", name: "Ohio" },
  "40": { abbr: "OK", name: "Oklahoma" },
  "41": { abbr: "OR", name: "Oregon" },
  "42": { abbr: "PA", name: "Pennsylvania" },
  "44": { abbr: "RI", name: "Rhode Island" },
  "45": { abbr: "SC", name: "South Carolina" },
  "46": { abbr: "SD", name: "South Dakota" },
  "47": { abbr: "TN", name: "Tennessee" },
  "48": { abbr: "TX", name: "Texas" },
  "49": { abbr: "UT", name: "Utah" },
  "50": { abbr: "VT", name: "Vermont" },
  "51": { abbr: "VA", name: "Virginia" },
  "53": { abbr: "WA", name: "Washington" },
  "54": { abbr: "WV", name: "West Virginia" },
  "55": { abbr: "WI", name: "Wisconsin" },
  "56": { abbr: "WY", name: "Wyoming" },
};

// ─── Region Map (8 US regions) ───

export interface RegionInfo {
  name: string;
  palette: string;
  elements: string;
}

export const REGION_MAP: Record<string, RegionInfo> = {
  // Northeast
  ME: { name: "Northeast", palette: "slate blue, autumn amber, harbor grey", elements: "coastline, fall foliage, brick towns, harbors" },
  NH: { name: "Northeast", palette: "slate blue, autumn amber, harbor grey", elements: "coastline, fall foliage, brick towns, harbors" },
  VT: { name: "Northeast", palette: "slate blue, autumn amber, harbor grey", elements: "coastline, fall foliage, brick towns, harbors" },
  MA: { name: "Northeast", palette: "slate blue, autumn amber, harbor grey", elements: "coastline, fall foliage, brick towns, harbors" },
  RI: { name: "Northeast", palette: "slate blue, autumn amber, harbor grey", elements: "coastline, fall foliage, brick towns, harbors" },
  CT: { name: "Northeast", palette: "slate blue, autumn amber, harbor grey", elements: "coastline, fall foliage, brick towns, harbors" },
  NY: { name: "Northeast", palette: "slate blue, autumn amber, harbor grey", elements: "coastline, fall foliage, brick towns, harbors" },
  NJ: { name: "Northeast", palette: "slate blue, autumn amber, harbor grey", elements: "coastline, fall foliage, brick towns, harbors" },
  PA: { name: "Northeast", palette: "slate blue, autumn amber, harbor grey", elements: "coastline, fall foliage, brick towns, harbors" },
  // Southeast
  DE: { name: "Southeast", palette: "warm gold, moss green, coral", elements: "Spanish moss, marshland, plantation fields, beaches" },
  MD: { name: "Southeast", palette: "warm gold, moss green, coral", elements: "Spanish moss, marshland, plantation fields, beaches" },
  NC: { name: "Southeast", palette: "warm gold, moss green, coral", elements: "Spanish moss, marshland, plantation fields, beaches" },
  SC: { name: "Southeast", palette: "warm gold, moss green, coral", elements: "Spanish moss, marshland, plantation fields, beaches" },
  GA: { name: "Southeast", palette: "warm gold, moss green, coral", elements: "Spanish moss, marshland, plantation fields, beaches" },
  FL: { name: "Southeast", palette: "warm gold, moss green, coral", elements: "Spanish moss, marshland, plantation fields, beaches" },
  DC: { name: "Southeast", palette: "warm gold, moss green, coral", elements: "Spanish moss, marshland, plantation fields, beaches" },
  // Midwest
  OH: { name: "Midwest", palette: "wheat gold, prairie green, storm grey", elements: "vast horizons, farmland, grain elevators, big sky" },
  IN: { name: "Midwest", palette: "wheat gold, prairie green, storm grey", elements: "vast horizons, farmland, grain elevators, big sky" },
  IL: { name: "Midwest", palette: "wheat gold, prairie green, storm grey", elements: "vast horizons, farmland, grain elevators, big sky" },
  MI: { name: "Midwest", palette: "wheat gold, prairie green, storm grey", elements: "vast horizons, farmland, grain elevators, big sky" },
  WI: { name: "Midwest", palette: "wheat gold, prairie green, storm grey", elements: "vast horizons, farmland, grain elevators, big sky" },
  MN: { name: "Midwest", palette: "wheat gold, prairie green, storm grey", elements: "vast horizons, farmland, grain elevators, big sky" },
  IA: { name: "Midwest", palette: "wheat gold, prairie green, storm grey", elements: "vast horizons, farmland, grain elevators, big sky" },
  MO: { name: "Midwest", palette: "wheat gold, prairie green, storm grey", elements: "vast horizons, farmland, grain elevators, big sky" },
  ND: { name: "Midwest", palette: "wheat gold, prairie green, storm grey", elements: "vast horizons, farmland, grain elevators, big sky" },
  SD: { name: "Midwest", palette: "wheat gold, prairie green, storm grey", elements: "vast horizons, farmland, grain elevators, big sky" },
  NE: { name: "Midwest", palette: "wheat gold, prairie green, storm grey", elements: "vast horizons, farmland, grain elevators, big sky" },
  KS: { name: "Midwest", palette: "wheat gold, prairie green, storm grey", elements: "vast horizons, farmland, grain elevators, big sky" },
  // South
  KY: { name: "South", palette: "deep amber, rust red, bayou green", elements: "delta, red earth, rolling hills, bayou" },
  TN: { name: "South", palette: "deep amber, rust red, bayou green", elements: "delta, red earth, rolling hills, bayou" },
  AL: { name: "South", palette: "deep amber, rust red, bayou green", elements: "delta, red earth, rolling hills, bayou" },
  MS: { name: "South", palette: "deep amber, rust red, bayou green", elements: "delta, red earth, rolling hills, bayou" },
  AR: { name: "South", palette: "deep amber, rust red, bayou green", elements: "delta, red earth, rolling hills, bayou" },
  LA: { name: "South", palette: "deep amber, rust red, bayou green", elements: "delta, red earth, rolling hills, bayou" },
  // Mountain
  MT: { name: "Mountain", palette: "alpine white, granite blue, aspen gold", elements: "peaks, canyons, alpine meadows, alpine lakes" },
  ID: { name: "Mountain", palette: "alpine white, granite blue, aspen gold", elements: "peaks, canyons, alpine meadows, alpine lakes" },
  WY: { name: "Mountain", palette: "alpine white, granite blue, aspen gold", elements: "peaks, canyons, alpine meadows, alpine lakes" },
  CO: { name: "Mountain", palette: "alpine white, granite blue, aspen gold", elements: "peaks, canyons, alpine meadows, alpine lakes" },
  UT: { name: "Mountain", palette: "alpine white, granite blue, aspen gold", elements: "peaks, canyons, alpine meadows, alpine lakes" },
  // Pacific
  WA: { name: "Pacific", palette: "emerald, Pacific blue, fog grey", elements: "old growth forest, volcanic coast, tropical reefs" },
  OR: { name: "Pacific", palette: "emerald, Pacific blue, fog grey", elements: "old growth forest, volcanic coast, tropical reefs" },
  CA: { name: "Pacific", palette: "emerald, Pacific blue, fog grey", elements: "old growth forest, volcanic coast, tropical reefs" },
  AK: { name: "Pacific", palette: "emerald, Pacific blue, fog grey", elements: "old growth forest, volcanic coast, tropical reefs" },
  HI: { name: "Pacific", palette: "emerald, Pacific blue, fog grey", elements: "old growth forest, volcanic coast, tropical reefs" },
  // Southwest
  AZ: { name: "Southwest", palette: "terracotta, turquoise, sunset orange", elements: "red rock, desert flora, adobe, open range, big sky" },
  NM: { name: "Southwest", palette: "terracotta, turquoise, sunset orange", elements: "red rock, desert flora, adobe, open range, big sky" },
  NV: { name: "Southwest", palette: "terracotta, turquoise, sunset orange", elements: "red rock, desert flora, adobe, open range, big sky" },
  TX: { name: "Southwest", palette: "terracotta, turquoise, sunset orange", elements: "red rock, desert flora, adobe, open range, big sky" },
  OK: { name: "Southwest", palette: "terracotta, turquoise, sunset orange", elements: "red rock, desert flora, adobe, open range, big sky" },
  // Appalachia
  WV: { name: "Appalachia", palette: "misty blue-green, forest deep green, morning fog", elements: "forested ridges, mountain hollows, rolling valleys" },
  VA: { name: "Appalachia", palette: "misty blue-green, forest deep green, morning fog", elements: "forested ridges, mountain hollows, rolling valleys" },
};

export const RARITY_MOODS: Record<string, string> = {
  common: "soft daylight, clean, simple, peaceful, quiet",
  uncommon: "warm afternoon, moderate detail, inviting, pleasant",
  rare: "golden hour, rich texture, atmospheric, beautiful",
  epic: "dramatic sunset, lush, cinematic, awe-inspiring",
  legendary: "god rays, hyper-detailed, luminous, transcendent, mythic",
};

// ─── Status tracking ───

export interface StageStatus {
  complete: boolean;
  timestamp: string;
  [key: string]: unknown;
}

export interface PipelineStatus {
  stage1?: StageStatus;
  stage2?: StageStatus;
  stage3?: StageStatus;
  stage4?: StageStatus;
  stage5?: StageStatus;
}

const STATUS_FILE = join(process.cwd(), "data", ".status.json");

export function loadStatus(): PipelineStatus {
  try { return JSON.parse(readFileSync(STATUS_FILE, "utf-8")); } catch { return {}; }
}

export function saveStatus(status: PipelineStatus): void {
  writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
}

// ─── Ollama helpers ───

export const OLLAMA_URL = "http://127.0.0.1:11434";

export async function unloadOllamaModels(): Promise<void> {
  try {
    await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "qwen3-vl:8b", keep_alive: 0 }),
    });
  } catch { /* ignore if model not loaded */ }
  try {
    await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "qwen3:14b", keep_alive: 0 }),
    });
  } catch { /* ignore if model not loaded */ }
}

// ─── Shared JSON read/write ───

export function loadJson<T = Record<string, unknown>>(filename: string): T {
  const filepath = join(process.cwd(), filename);
  try { return JSON.parse(readFileSync(filepath, "utf-8")); } catch { return {} as T; }
}

export function saveJson(filename: string, data: unknown): void {
  const filepath = join(process.cwd(), filename);
  writeFileSync(filepath, JSON.stringify(data, null, 2));
}
