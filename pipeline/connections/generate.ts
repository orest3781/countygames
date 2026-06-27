import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { buildDataset } from "../../src/lib/countle/data";
import type { CountiesPayload, CountyEntry } from "../../src/lib/countle/types";
import { validateConnections } from "../../src/lib/connections/validate";
import { STATE_CAPITAL_FIPS } from "../countle/lib";
import { buildCandidateGroups } from "./families";
import { assemblePuzzles } from "./assemble";

const TARGET = 300;
const ATTEMPTS = 200_000;
const SEED = 20260626;

function main() {
  const payload = JSON.parse(readFileSync(join(process.cwd(), "public", "data", "counties.json"), "utf-8")) as CountiesPayload;
  const ds = buildDataset(payload);
  const famous: CountyEntry[] = ds.all.filter((c) => c.isAnswerPool);
  const byFips = new Map(famous.map((c) => [c.fips, c]));
  const capitalFips = new Set(STATE_CAPITAL_FIPS);

  const groups = buildCandidateGroups(famous, capitalFips);
  console.log(`candidate groups: ${groups.length} (${[...new Set(groups.map((g) => g.family))].join(", ")})`);

  const puzzles = assemblePuzzles(groups, byFips, { seed: SEED, target: TARGET, attempts: ATTEMPTS });
  console.log(`assembled ${puzzles.length} unique puzzles`);

  const out = { schemaVersion: 1 as const, generatedAt: new Date().toISOString(), count: puzzles.length, puzzles };
  const res = validateConnections(out);
  if (!res.ok) { console.error("GENERATED POOL INVALID:"); res.errors.forEach((e) => console.error("  " + e)); process.exit(1); }

  const dir = join(process.cwd(), "public", "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "connections.json"), JSON.stringify(out));
  console.log(`=== wrote public/data/connections.json — ${puzzles.length} puzzles ===`);
}

main();
