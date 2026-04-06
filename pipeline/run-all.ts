/**
 * run-all.ts — Run all 5 pipeline stages in sequence.
 *
 * Manages VRAM between stages. Stops on first failure.
 * Usage: npx tsx pipeline/run-all.ts
 */

import { OLLAMA_URL, unloadOllamaModels } from "./config.js";
import { spawnSync, execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

const COMFYUI_URL = "http://127.0.0.1:8188";
const CHECKPOINT_DIR = "A:/ComfyUI_Fresh/models/checkpoints";


async function preflight(): Promise<boolean> {
  console.log("=== Pre-flight Checks ===\n");
  let ok = true;

  // Ollama
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    const tags = await res.json();
    const models = (tags.models || []).map((m: any) => m.name);

    if (models.some((m: string) => m.includes("gemma4"))) {
      console.log("[OK] Model gemma4:e4b available");
    } else {
      console.log("[FAIL] Model gemma4:e4b not found. Run: ollama pull gemma4:e4b");
      ok = false;
    }

    if (models.some((m: string) => m.includes("qwen3") && !m.includes("vl"))) {
      console.log("[OK] Model qwen3:14b available");
    } else {
      console.log("[FAIL] Model qwen3:14b not found. Run: ollama pull qwen3:14b");
      ok = false;
    }
    console.log("[OK] Ollama running at " + OLLAMA_URL);
  } catch {
    console.log("[FAIL] Ollama not running at " + OLLAMA_URL);
    ok = false;
  }

  // ComfyUI
  try {
    await fetch(`${COMFYUI_URL}/system_stats`);
    console.log("[OK] ComfyUI running at " + COMFYUI_URL);
  } catch {
    console.log("[FAIL] ComfyUI not running at " + COMFYUI_URL);
    ok = false;
  }

  // Checkpoint
  const ckpt = join(CHECKPOINT_DIR, "juggernautXL_ragnarokBy.safetensors");
  if (existsSync(ckpt)) {
    console.log("[OK] Checkpoint juggernautXL_ragnarokBy.safetensors found");
  } else {
    console.log("[FAIL] Checkpoint not found: " + ckpt);
    ok = false;
  }

  // Supabase
  try {
    const { supabase } = await import("./config.js");
    const { data } = await supabase.from("counties").select("fips").limit(1);
    if (data && data.length > 0) {
      console.log("[OK] Supabase connection verified");
    } else {
      console.log("[FAIL] Supabase returned no data");
      ok = false;
    }
  } catch (e: any) {
    console.log("[FAIL] Supabase: " + e.message);
    ok = false;
  }

  // Disk space
  try {
    const raw = execSync(
      'powershell -NoProfile -Command "(Get-PSDrive S).Free"',
      { encoding: "utf-8", timeout: 5000 }
    );
    const bytes = parseInt(raw.trim());
    if (!isNaN(bytes)) {
      const freeGB = bytes / (1024 ** 3);
      if (freeGB < 16) {
        console.log(`[FAIL] Disk space: ${freeGB.toFixed(1)} GB free (need ~16GB)`);
        ok = false;
      } else {
        console.log(`[OK] Disk space: ${freeGB.toFixed(1)} GB free`);
      }
    } else {
      console.log("[SKIP] Could not parse disk space");
    }
  } catch {
    console.log("[SKIP] Could not check disk space");
  }

  console.log();
  return ok;
}

function runStage(label: string, command: string): boolean {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${"=".repeat(60)}\n`);

  const t0 = Date.now();
  const result = spawnSync(command.split(" ")[0], command.split(" ").slice(1), {
    stdio: "inherit",
    shell: true,
    cwd: process.cwd(),
  });

  const elapsed = ((Date.now() - t0) / 60000).toFixed(1);

  if (result.status !== 0) {
    console.error(`\n[FAILED] ${label} (exit code ${result.status}) after ${elapsed} min`);
    return false;
  }

  console.log(`\n[DONE] ${label} in ${elapsed} min`);
  return true;
}

async function main() {
  console.log("=== County Wars Pipeline v2 ===\n");
  const t0 = Date.now();

  if (!(await preflight())) {
    console.error("\nPre-flight checks failed. Fix issues above before running.");
    process.exit(1);
  }

  // Stage 1: Reference
  if (!runStage("Stage 1: Reference (Satellite + Wiki)", "npx tsx pipeline/stage-1-reference.ts")) {
    process.exit(1);
  }

  // Stage 2: Describe
  if (!runStage("Stage 2: Describe (Vision LLM)", "npx tsx pipeline/stage-2-describe.ts")) {
    process.exit(1);
  }

  // Unload vision model before ComfyUI
  await unloadOllamaModels();

  // Stage 3: Render
  if (!runStage("Stage 3: Render (ComfyUI)", "python pipeline/stage-3-render.py")) {
    process.exit(1);
  }

  // Stage 4: Enrich
  if (!runStage("Stage 4: Enrich (Flavor Text)", "npx tsx pipeline/stage-4-enrich.ts")) {
    process.exit(1);
  }

  // Stage 5: Export
  if (!runStage("Stage 5: Export (Supabase + CSV)", "npx tsx pipeline/stage-5-export.ts")) {
    process.exit(1);
  }

  const totalMin = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Pipeline Complete in ${totalMin} min`);
  console.log(`${"=".repeat(60)}`);
}

main().catch(err => { console.error(err); process.exit(1); });
