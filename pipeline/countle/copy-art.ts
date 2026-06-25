import { readFileSync, existsSync, mkdirSync, copyFileSync, statSync } from "fs";
import { join } from "path";

const data = JSON.parse(readFileSync(join(process.cwd(), "public", "data", "counties.json"), "utf-8"));
const srcDir = join(process.cwd(), "data", "card-art");
const dstDir = join(process.cwd(), "public", "art");
if (!existsSync(dstDir)) mkdirSync(dstDir, { recursive: true });

let copied = 0, bytes = 0;
const missing: string[] = [];
for (const [fips, c] of Object.entries(data.counties as Record<string, { isAnswerPool: boolean }>)) {
  if (!c.isAnswerPool) continue;
  const src = join(srcDir, `${fips}.png`);
  if (!existsSync(src)) { missing.push(fips); continue; }
  copyFileSync(src, join(dstDir, `${fips}.png`));
  bytes += statSync(src).size;
  copied++;
}
console.log(`Copied ${copied} answer-pool art files (${(bytes / 1024 / 1024).toFixed(0)} MB) → public/art/`);
if (missing.length) console.warn(`⚠ ${missing.length} answer-pool counties missing art: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "…" : ""}`);
