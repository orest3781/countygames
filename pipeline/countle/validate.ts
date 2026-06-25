import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";

const stat = z.number().int().min(1).max(100);

const CountyEntrySchema = z.object({
  fips: z.string().length(5),
  name: z.string().min(1),
  state_abbr: z.string().length(2),
  state_name: z.string().min(1),
  region: z.string().min(1),
  county_seat: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  stats: z.object({ wealth: stat, health: stat, people: stat, land: stat, danger: stat, education: stat }),
  display: z.object({
    wealth: z.string(), health: z.string(), people: z.string(),
    land: z.string(), danger: z.string(), education: z.string(),
  }),
  rarity: z.enum(["common", "uncommon", "rare", "epic", "legendary"]),
  hasArt: z.boolean(),
  isAnswerPool: z.boolean(),
  notable_person: z.string().nullable(),
  notable_person_desc: z.string().nullable(),
  flavor: z.string().nullable(),
});
// NOTE: answer pool is art-OPTIONAL (owner decision 2026-06-24) — no hasArt refinement.

const PayloadSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  count: z.number(),
  answerPoolCount: z.number(),
  counties: z.record(z.string(), CountyEntrySchema),
});

export function validatePayload(
  payload: unknown
): { ok: true; count: number; answerPoolCount: number } | { ok: false; errors: string[] } {
  const parsed = PayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  return { ok: true, count: parsed.data.count, answerPoolCount: parsed.data.answerPoolCount };
}

// Runnable entrypoint: `tsx pipeline/countle/validate.ts`
if (process.argv[1] && process.argv[1].includes("validate")) {
  const file = join(process.cwd(), "public", "data", "counties.json");
  const payload = JSON.parse(readFileSync(file, "utf-8"));
  const res = validatePayload(payload);
  if (!res.ok) {
    console.error("VALIDATION FAILED:");
    for (const e of res.errors) console.error("  " + e);
    process.exit(1);
  }
  const entries = Object.values(payload.counties as Record<string, { isAnswerPool: boolean; hasArt: boolean }>);
  const pool = entries.filter((e) => e.isAnswerPool);
  const poolWithArt = pool.filter((e) => e.hasArt).length;
  console.log(`VALID: ${res.count} counties, ${res.answerPoolCount} answer-pool.`);
  console.log(`  answer-pool sanity: ${pool.length} (expect ~280-340); ${poolWithArt} with art, ${pool.length - poolWithArt} use the fallback card`);
  if (pool.length < 250) console.warn("  ⚠ answer pool smaller than expected — check the famous-county lists.");
}
