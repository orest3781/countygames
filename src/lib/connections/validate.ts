import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";

const GroupSchema = z.object({
  label: z.string().min(1),
  color: z.enum(["yellow", "green", "blue", "purple"]),
  fips: z.array(z.string().length(5)).length(4),
}).refine((g) => new Set(g.fips).size === 4, { message: "group fips must be 4 distinct" });

const PuzzleSchema = z.object({
  id: z.number(),
  groups: z.array(GroupSchema).length(4),
}).superRefine((p, ctx) => {
  const all = p.groups.flatMap((g) => g.fips);
  if (new Set(all).size !== 16) ctx.addIssue({ code: "custom", message: "puzzle must have 16 distinct fips" });
  if (new Set(p.groups.map((g) => g.color)).size !== 4) ctx.addIssue({ code: "custom", message: "puzzle must have 4 distinct colors" });
});

export const ConnectionsPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  count: z.number(),
  puzzles: z.array(PuzzleSchema),
}).refine((p) => p.count === p.puzzles.length, { message: "count must equal puzzles.length" });

export function validateConnections(payload: unknown): { ok: true; count: number } | { ok: false; errors: string[] } {
  const parsed = ConnectionsPayloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join(".")}: ${i.message}`) };
  return { ok: true, count: parsed.data.count };
}

// Runnable: `tsx src/lib/connections/validate.ts`
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("connections/validate.ts")) {
  const file = join(process.cwd(), "public", "data", "connections.json");
  const res = validateConnections(JSON.parse(readFileSync(file, "utf-8")));
  if (!res.ok) { console.error("CONNECTIONS INVALID:"); res.errors.forEach((e) => console.error("  " + e)); process.exit(1); }
  console.log(`VALID: ${res.count} connections puzzles.`);
}
