/**
 * Stage 4: Enrich — Three-pass enrichment pipeline.
 *
 * Pass 1: Structured data (no LLM)
 *   1a. County seat extraction from wiki.json
 *   1b. Ability assignment from stat profile (rules-based)
 *   1c. County type from USDA ERS typology
 *
 * Pass 2: Flavor text + notable person (LLM via Qwen3:14b)
 *
 * Pass 3: Quality check — 4-gram dedup, word-boundary truncation
 *
 * Resume-safe: skips FIPS already in enrichment.json.
 * Usage: npx tsx pipeline/stage-4-enrich.ts
 */

import {
  supabase,
  loadStatus,
  saveStatus,
  loadJson,
  saveJson,
  createBatchedSaver,
  OLLAMA_URL,
  unloadOllamaModels,
  downloadAndCache,
  parseCSV,
  STATE_FIPS,
} from "./config.js";
import { existsSync } from "fs";
import { join } from "path";

// ─── Constants ───

const TEXT_MODEL = "qwen3:14b";
const WIKI_FILE = "data/wiki.json";
const ENRICHMENT_FILE = "data/enrichment.json";
const USDA_CSV_URL =
  "https://www.ers.usda.gov/webdocs/DataFiles/48652/2015CountyTypologyCodes.csv";
const USDA_CSV_FILE = "usda-county-typology-2015.csv";

// ─── Types ───

interface EnrichmentEntry {
  flavor: string;
  person_name: string | null;
  person_desc: string | null;
  ability_name: string;
  ability_desc: string;
  county_type: string;
  county_seat: string | null;
}

interface CountyRow {
  fips: string;
  name: string;
  state_name: string;
  state_abbr: string;
  stat_power: number;
  stat_resilience: number;
  stat_population: number;
  stat_terrain: number;
  stat_chaos: number;
  stat_culture: number;
  total_score: number;
}

interface StructuredData {
  county_seat: string | null;
  ability_name: string;
  ability_desc: string;
  county_type: string;
}

// ─── Abilities ───

const ABILITIES: Record<string, { name: string; desc: string }> = {
  power_specialist: {
    name: "Economic Engine",
    desc: "When you pick PWR: +10 to your PWR",
  },
  resilience_specialist: {
    name: "Fortress County",
    desc: "When you pick RES: +10 to your RES",
  },
  population_specialist: {
    name: "Urban Sprawl",
    desc: "When you pick POP: +10 to your POP",
  },
  terrain_specialist: {
    name: "Big Country",
    desc: "When you pick TER: +10 to your TER",
  },
  chaos_specialist: {
    name: "Storm Chaser",
    desc: "When you pick CHA: +10 to your CHA",
  },
  culture_specialist: {
    name: "Brain Belt",
    desc: "When you pick CUL: +10 to your CUL",
  },
  all_rounder: {
    name: "All-Rounder",
    desc: "In split picks: +5 to both compared stats",
  },
  megacity: {
    name: "Megacity",
    desc: "When both pick POP: win ties automatically",
  },
  ghost_county: {
    name: "Ghost County",
    desc: "If opponent picks POP: auto-draw instead of losing",
  },
  vast_wilderness: {
    name: "Vast Wilderness",
    desc: "When you pick TER: opponent stat capped at 50",
  },
  glass_cannon: {
    name: "Glass Cannon",
    desc: "Your best stat gets +15, but your worst stat gets -10",
  },
  underdog: {
    name: "Underdog Spirit",
    desc: "If your total_score is lower: +8 to chosen stat",
  },
};

const STAT_KEYS = [
  "power",
  "resilience",
  "population",
  "terrain",
  "chaos",
  "culture",
] as const;
type StatKey = (typeof STAT_KEYS)[number];

// ─── USDA Economic Type → County Type mapping ───

const USDA_TYPE_MAP: Record<number, string> = {
  1: "Farmland",
  2: "Mining",
  3: "Industrial",
  4: "Government",
  5: "Recreation",
  6: "Nonspecialized",
};

// ─── Banned words for flavor text ───

const BANNED_WORDS = [
  "whisper",
  "cradle",
  "echo",
  "tapestry",
  "rolling hills",
  "soul",
  "heart",
  "embrace",
  "nestled",
];

// ─── Pass 1: Structured Data ───

function extractCountySeat(wikiText: string | null): string | null {
  if (!wikiText) return null;

  // Common patterns in Wikipedia county articles:
  // "Its county seat is {city}" / "The county seat is {city}"
  // "Its county seat and largest city is {city}"
  const patterns = [
    /(?:its|the) county seat (?:and [\w\s]+)?is ([A-Z][\w\s.'-]+?)(?:[,.]| which| \(| and )/i,
    /county seat is ([A-Z][\w\s.'-]+?)(?:[,.]| which| \()/i,
    /county seat,\s*([A-Z][\w\s.'-]+?)(?:[,.]| is)/i,
  ];

  for (const pattern of patterns) {
    const match = wikiText.match(pattern);
    if (match?.[1]) {
      return match[1].trim().replace(/\s+/g, " ");
    }
  }
  return null;
}

function getStatValues(
  county: CountyRow
): Record<StatKey, number> {
  return {
    power: county.stat_power,
    resilience: county.stat_resilience,
    population: county.stat_population,
    terrain: county.stat_terrain,
    chaos: county.stat_chaos,
    culture: county.stat_culture,
  };
}

function assignAbility(county: CountyRow): { name: string; desc: string } {
  const stats = getStatValues(county);
  const entries = STAT_KEYS.map((k) => ({ key: k, val: stats[k] }));
  entries.sort((a, b) => b.val - a.val);

  const highest = entries[0];
  const secondHighest = entries[1];
  const lowest = entries[entries.length - 1];
  const gap = highest.val - secondHighest.val;

  // Extreme population checks (raw value, not gap)
  if (highest.key === "population" && highest.val >= 90) {
    return ABILITIES.megacity;
  }
  if (lowest.key === "population" && lowest.val <= 10) {
    return ABILITIES.ghost_county;
  }

  // Extreme terrain
  if (highest.key === "terrain" && highest.val >= 90 && gap >= 15) {
    return ABILITIES.vast_wilderness;
  }

  // Well-rounded: no stat leads by more than 10
  if (gap <= 10) {
    return ABILITIES.all_rounder;
  }

  // Glass cannon: best stat very high, worst stat very low
  if (highest.val >= 80 && lowest.val <= 15 && gap >= 15) {
    return ABILITIES.glass_cannon;
  }

  // Underdog: total score is low (bottom quartile estimate)
  if (county.total_score <= 200) {
    return ABILITIES.underdog;
  }

  // Specialist: one stat dominates by 15+ points
  if (gap >= 15) {
    const key = `${highest.key}_specialist` as keyof typeof ABILITIES;
    if (ABILITIES[key]) return ABILITIES[key];
  }

  // Fallback: specialist with lower threshold for the dominant stat
  const key = `${highest.key}_specialist` as keyof typeof ABILITIES;
  if (ABILITIES[key]) return ABILITIES[key];

  return ABILITIES.all_rounder;
}

function deriveTypeFromHighestStat(county: CountyRow): string {
  const stats = getStatValues(county);
  const entries = STAT_KEYS.map((k) => ({ key: k, val: stats[k] }));
  entries.sort((a, b) => b.val - a.val);

  switch (entries[0].key) {
    case "power":
      return "Industrial";
    case "resilience":
      return "Government";
    case "population":
      return "Urban";
    case "terrain":
      return "Wilderness";
    case "chaos":
      return "Frontier";
    case "culture":
      return "Cultural";
    default:
      return "General";
  }
}

async function loadUsdaTypology(): Promise<Record<string, number>> {
  const fipsToType: Record<string, number> = {};

  try {
    const csvText = await downloadAndCache(USDA_CSV_URL, USDA_CSV_FILE);
    const rows = parseCSV(csvText);

    for (const row of rows) {
      // The CSV has FIPStxt (or FIPS) and EconomicTypology2015 columns
      const fips = (row.FIPStxt || row.FIPS || "").padStart(5, "0");
      const econType = parseInt(
        row.EconomicTypology2015 || row.Economic_Type_2015 || "0",
        10
      );
      if (fips.length === 5 && econType >= 1 && econType <= 6) {
        fipsToType[fips] = econType;
      }
    }

    console.log(`  USDA typology loaded: ${Object.keys(fipsToType).length} counties`);
  } catch (err: any) {
    console.warn(`  [warn] USDA typology download failed: ${err.message}`);
    console.warn("  Falling back to stat-based type derivation for all counties.");
  }

  return fipsToType;
}

function resolveCountyType(
  fips: string,
  county: CountyRow,
  usdaTypes: Record<string, number>
): string {
  const typeCode = usdaTypes[fips];
  if (!typeCode) return deriveTypeFromHighestStat(county);

  const typeName = USDA_TYPE_MAP[typeCode];
  if (typeName === "Nonspecialized") return deriveTypeFromHighestStat(county);
  return typeName;
}

// ─── Pass 2: LLM — Flavor Text + Notable Person ───

async function queryLLM(prompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TEXT_MODEL,
      prompt,
      stream: false,
      think: false,
      options: { temperature: 0.9, num_predict: 250 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const json = await res.json();
  let text = (json.response || "").trim();
  // Strip thinking tags if model uses them
  text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (!text && json.response?.includes("<think>")) {
    const inner = json.response
      .replace(/<think>|<\/think>/g, "")
      .trim();
    const lines = inner
      .split("\n")
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 10);
    text = lines.length > 0 ? lines[lines.length - 1] : "";
  }
  return text.replace(/^["']|["']$/g, "").trim();
}

function standoutStatDescription(county: CountyRow): string {
  const stats = getStatValues(county);
  const entries = STAT_KEYS.map((k) => ({ key: k, val: stats[k] }));
  entries.sort((a, b) => b.val - a.val);

  const labels: Record<StatKey, string> = {
    power: "economic output",
    resilience: "infrastructure resilience",
    population: "population density",
    terrain: "vast terrain",
    chaos: "natural disaster exposure",
    culture: "cultural institutions",
  };

  return `Strongest trait: ${labels[entries[0].key]} (${entries[0].val}/100)`;
}

function buildFlavorPrompt(
  county: CountyRow,
  wikiText: string | null,
  countyType: string,
  countySeat: string | null,
  standout: string
): string {
  const wikiSnippet = wikiText ? wikiText.substring(0, 150) : "";
  const seatLine = countySeat ? `Seat: ${countySeat}.` : "";

  return `Write one sentence (under 100 chars) for a collectible card.
Place: ${county.name}, ${county.state_name}. ${wikiSnippet}
Type: ${countyType}. ${seatLine}
Character: ${standout}

Rules: Poetic and specific. No numbers or statistics.
Never use these words: ${BANNED_WORDS.join(", ")}.

Examples of good flavor text:
"Salt flats stretch forever, and the wind never lies."
"Steel mills went dark, but the river kept its appointment."
"Gators outnumber the mailboxes three to one."
"The fog rolls in thick enough to lose a courthouse."

Write ONLY the sentence, no quotes, no explanation:`;
}

function buildPersonPrompt(
  county: CountyRow,
  wikiText: string
): string {
  return `Read this text about ${county.name}, ${county.state_name}:
"${wikiText.substring(0, 500)}"

Name ONE notable or famous person mentioned or associated with this county. If no person is mentioned, say NONE.

Format your answer as exactly two lines:
NAME: <full name or NONE>
DESC: <one-sentence description of who they are, or NONE>

Answer:`;
}

// ─── Pass 3: Quality Check ───

function extractFourGrams(text: string): Set<string> {
  const words = text.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/);
  const grams = new Set<string>();
  for (let i = 0; i <= words.length - 4; i++) {
    grams.add(words.slice(i, i + 4).join(" "));
  }
  return grams;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const g of a) {
    if (b.has(g)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function truncateAtWordBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const truncated = text.substring(0, maxLen);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.6) {
    return truncated.substring(0, lastSpace) + "...";
  }
  return truncated + "...";
}

function containsBannedWords(text: string): boolean {
  const lower = text.toLowerCase();
  return BANNED_WORDS.some((w) => lower.includes(w));
}

function cleanFlavor(raw: string): string | null {
  let text = raw.replace(/^["']|["']$/g, "").trim();
  text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  // Take the first line if multi-line
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length > 1) {
    text = lines[0].trim();
  }
  // Remove surrounding quotes again after line split
  text = text.replace(/^["']|["']$/g, "").trim();
  if (text.length > 100) text = truncateAtWordBoundary(text, 100);
  if (text.length < 10) return null;
  return text;
}

function parsePersonResponse(raw: string): {
  name: string | null;
  desc: string | null;
} {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const nameMatch = text.match(/NAME:\s*(.+)/i);
  const descMatch = text.match(/DESC:\s*(.+)/i);

  const name = nameMatch?.[1]?.trim() || null;
  const desc = descMatch?.[1]?.trim() || null;

  if (!name || name.toUpperCase() === "NONE") {
    return { name: null, desc: null };
  }
  if (desc?.toUpperCase() === "NONE") {
    return { name, desc: null };
  }

  return {
    name: name.substring(0, 80),
    desc: desc ? desc.substring(0, 120) : null,
  };
}

// ─── Main ───

async function main() {
  console.log("=== Stage 4: Enrich (v2 — Three-Pass) ===\n");
  console.log(`Text Model: ${TEXT_MODEL}`);
  console.log(`Output: ${ENRICHMENT_FILE}\n`);

  // ── Dependency checks ──

  const wikiPath = join(process.cwd(), WIKI_FILE);
  if (!existsSync(wikiPath)) {
    console.error("ERROR: data/wiki.json not found. Run Stage 1 first.");
    process.exit(1);
  }

  // Check Ollama is running and model is available
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    const tags = await res.json();
    const models = (tags.models || []).map((m: any) => m.name);
    if (
      !models.some(
        (m: string) => m === TEXT_MODEL || m.startsWith(TEXT_MODEL + ":")
      )
    ) {
      console.error(
        `ERROR: Model ${TEXT_MODEL} not found. Run: ollama pull ${TEXT_MODEL}`
      );
      process.exit(1);
    }
    console.log("Ollama connected.\n");
  } catch {
    console.error("ERROR: Ollama not running at " + OLLAMA_URL);
    process.exit(1);
  }

  // Unload other models to free VRAM
  await unloadOllamaModels();

  // ── Load data ──

  const wiki = loadJson<Record<string, string>>(WIKI_FILE);
  const enrichment = loadJson<Record<string, EnrichmentEntry>>(ENRICHMENT_FILE);
  console.log(`Wiki descriptions: ${Object.keys(wiki).length}`);
  console.log(`Existing enrichment: ${Object.keys(enrichment).length}`);

  // ── Fetch counties from Supabase ──

  const counties: CountyRow[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("cards")
      .select(
        "fips, stat_power, stat_resilience, stat_population, stat_terrain, stat_chaos, stat_culture, total_score, counties!inner(name, state_name, state_abbr)"
      )
      .order("fips")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const co = (row as any).counties;
      const fips = row.fips.trim();
      if (enrichment[fips]) continue; // resume-safe
      counties.push({
        fips,
        name: co.name,
        state_name: co.state_name,
        state_abbr: (co.state_abbr || "").trim(),
        stat_power: row.stat_power ?? 0,
        stat_resilience: row.stat_resilience ?? 0,
        stat_population: row.stat_population ?? 0,
        stat_terrain: row.stat_terrain ?? 0,
        stat_chaos: row.stat_chaos ?? 0,
        stat_culture: row.stat_culture ?? 0,
        total_score: row.total_score ?? 0,
      });
    }
    if (data.length < 1000) break;
    offset += 1000;
  }

  console.log(`Counties to process: ${counties.length}\n`);
  if (counties.length === 0) {
    const status = loadStatus();
    status.stage4 = {
      complete: true,
      enriched: Object.keys(enrichment).length,
      timestamp: new Date().toISOString(),
    };
    saveStatus(status);
    console.log("All done — nothing to process!");
    return;
  }

  // ╔══════════════════════════════════════╗
  // ║  PASS 1: Structured Data (no LLM)   ║
  // ╚══════════════════════════════════════╝

  console.log("── Pass 1: Structured Data ──\n");

  // 1a. County seats from wiki.json
  const countySeats: Record<string, string | null> = {};
  let seatCount = 0;
  for (const county of counties) {
    const seat = extractCountySeat(wiki[county.fips] || null);
    countySeats[county.fips] = seat;
    if (seat) seatCount++;
  }
  console.log(`  County seats extracted: ${seatCount}/${counties.length}`);

  // 1b. USDA County Typology
  const usdaTypes = await loadUsdaTypology();
  const countyTypes: Record<string, string> = {};
  let usdaMatched = 0;
  for (const county of counties) {
    const ctype = resolveCountyType(county.fips, county, usdaTypes);
    countyTypes[county.fips] = ctype;
    if (usdaTypes[county.fips]) usdaMatched++;
  }
  console.log(`  County types assigned: ${counties.length} (${usdaMatched} from USDA, ${counties.length - usdaMatched} from stats)`);

  // 1c. Abilities
  const countyAbilities: Record<string, { name: string; desc: string }> = {};
  const abilityDistribution: Record<string, number> = {};
  for (const county of counties) {
    const ability = assignAbility(county);
    countyAbilities[county.fips] = ability;
    abilityDistribution[ability.name] =
      (abilityDistribution[ability.name] || 0) + 1;
  }
  console.log("  Ability distribution:");
  for (const [name, count] of Object.entries(abilityDistribution).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`    ${name}: ${count}`);
  }

  // ╔══════════════════════════════════════╗
  // ║  PASS 2: LLM — Flavor + Person      ║
  // ╚══════════════════════════════════════╝

  console.log("\n── Pass 2: LLM Enrichment ──\n");

  let generated = 0;
  let failed = 0;
  let personsFound = 0;
  const errors: string[] = [];
  const t0 = Date.now();
  const enrichSaver = createBatchedSaver(ENRICHMENT_FILE, 10);

  // Quality tracking for Pass 3 dedup (rolling window of recent 4-grams)
  const recentGrams: Array<Set<string>> = [];
  const MAX_RECENT = 50;
  let regenerations = 0;

  for (let i = 0; i < counties.length; i++) {
    const county = counties[i];
    const wikiText = wiki[county.fips] || null;
    const countySeat = countySeats[county.fips];
    const countyType = countyTypes[county.fips];
    const ability = countyAbilities[county.fips];
    const standout = standoutStatDescription(county);

    try {
      // ── Generate flavor text ──
      const flavorPrompt = buildFlavorPrompt(
        county,
        wikiText,
        countyType,
        countySeat,
        standout
      );
      let rawFlavor = await queryLLM(flavorPrompt);
      let flavor = cleanFlavor(rawFlavor);

      // Pass 3 inline: quality check + regeneration
      if (flavor) {
        const grams = extractFourGrams(flavor);

        // Check for banned words
        if (containsBannedWords(flavor)) {
          const retryPrompt =
            flavorPrompt +
            `\nIMPORTANT: Do NOT use any of these words: ${BANNED_WORDS.join(", ")}. Your previous attempt used a banned word.`;
          rawFlavor = await queryLLM(retryPrompt);
          flavor = cleanFlavor(rawFlavor);
          regenerations++;
        }

        // Check 4-gram similarity with recent texts
        if (flavor) {
          const freshGrams = extractFourGrams(flavor);
          let tooSimilar = false;
          for (const prev of recentGrams) {
            if (jaccardSimilarity(freshGrams, prev) > 0.3) {
              tooSimilar = true;
              break;
            }
          }

          if (tooSimilar) {
            // Regenerate with extra guidance
            const dedupPrompt =
              flavorPrompt +
              "\nBe more creative and unique. Avoid common phrases. Surprise me.";
            rawFlavor = await queryLLM(dedupPrompt);
            flavor = cleanFlavor(rawFlavor);
            regenerations++;
          }

          // Track 4-grams for dedup window
          if (flavor) {
            const finalGrams = extractFourGrams(flavor);
            recentGrams.push(finalGrams);
            if (recentGrams.length > MAX_RECENT) recentGrams.shift();
          }
        }
      }

      if (!flavor) {
        failed++;
        errors.push(`${county.fips} ${county.name}: flavor text too short or empty`);
        continue;
      }

      // ── Extract notable person via LLM ──
      let personName: string | null = null;
      let personDesc: string | null = null;

      if (wikiText && wikiText.length > 50) {
        const personPrompt = buildPersonPrompt(county, wikiText);
        const rawPerson = await queryLLM(personPrompt);
        const parsed = parsePersonResponse(rawPerson);
        personName = parsed.name;
        personDesc = parsed.desc;
        if (personName) personsFound++;
      }

      // ── Assemble entry ──
      enrichment[county.fips] = {
        flavor,
        person_name: personName,
        person_desc: personDesc,
        ability_name: ability.name,
        ability_desc: ability.desc,
        county_type: countyType,
        county_seat: countySeat,
      };
      generated++;

      // Save periodically
      enrichSaver.save(enrichment);

      // Progress logging
      if ((i + 1) % 50 === 0 || i < 5) {
        const elapsed = (Date.now() - t0) / 1000;
        const rate = generated / elapsed;
        const eta =
          (counties.length - (i + 1)) / Math.max(rate, 0.01) / 60;
        console.log(
          `  [${i + 1}/${counties.length}] ${county.name}: "${flavor.substring(0, 50)}..." | ${rate.toFixed(2)}/s ETA ${eta.toFixed(0)}m`
        );
      }
    } catch (err: any) {
      failed++;
      const msg = `${county.fips} ${county.name}: ${err.message}`;
      errors.push(msg);
      if (failed <= 10) console.log(`  [error] ${msg}`);
    }
  }

  // Force-save final state
  enrichSaver.save(enrichment, true);

  // Unload model
  await unloadOllamaModels();

  // ╔══════════════════════════════════════╗
  // ║  Quality Stats                       ║
  // ╚══════════════════════════════════════╝

  console.log("\n── Quality Stats ──\n");

  // Compute flavor length stats
  const flavorLengths = Object.values(enrichment).map((e) => e.flavor.length);
  flavorLengths.sort((a, b) => a - b);
  const avgLen =
    flavorLengths.reduce((s, l) => s + l, 0) / Math.max(flavorLengths.length, 1);
  const medianLen =
    flavorLengths.length > 0
      ? flavorLengths[Math.floor(flavorLengths.length / 2)]
      : 0;
  const over100 = flavorLengths.filter((l) => l > 100).length;

  console.log(`  Flavor text lengths: avg=${avgLen.toFixed(0)} median=${medianLen} max=${flavorLengths[flavorLengths.length - 1] || 0}`);
  console.log(`  Over 100 chars: ${over100}`);
  console.log(`  Regenerations (dedup/banned): ${regenerations}`);

  // Person stats
  const totalPersons = Object.values(enrichment).filter(
    (e) => e.person_name
  ).length;
  console.log(`  Notable people found: ${totalPersons}/${Object.keys(enrichment).length}`);

  // Type distribution
  const typeDistribution: Record<string, number> = {};
  for (const e of Object.values(enrichment)) {
    typeDistribution[e.county_type] =
      (typeDistribution[e.county_type] || 0) + 1;
  }
  console.log("  County type distribution:");
  for (const [t, c] of Object.entries(typeDistribution).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`    ${t}: ${c}`);
  }

  // ── Update pipeline status ──

  const failRate = counties.length > 0 ? failed / counties.length : 0;
  const status = loadStatus();
  status.stage4 = {
    complete: failRate < 0.05,
    enriched: Object.keys(enrichment).length,
    failed,
    regenerations,
    persons_found: totalPersons,
    errors: errors.slice(-20),
    timestamp: new Date().toISOString(),
  };
  saveStatus(status);

  if (failRate >= 0.05) {
    console.error(
      `\nWARNING: ${(failRate * 100).toFixed(1)}% failure rate. Stage marked incomplete.`
    );
  }

  const elapsed = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(
    `\n=== Stage 4 Complete in ${elapsed} min ===`
  );
  console.log(
    `Generated: ${generated} | Failed: ${failed} | Persons: ${personsFound} | Total: ${Object.keys(enrichment).length}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
