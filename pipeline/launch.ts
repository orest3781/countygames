/**
 * launch.ts — Start all services and run the pipeline.
 *
 * 1. Starts Ollama (if not running)
 * 2. Pulls missing Ollama models
 * 3. Starts ComfyUI (if not running)
 * 4. Waits for all services to be ready
 * 5. Starts the dashboard (background)
 * 6. Runs the pipeline (or just checks if --check flag is passed)
 *
 * Usage:
 *   npx tsx pipeline/launch.ts          # full pipeline run
 *   npx tsx pipeline/launch.ts --check  # just verify everything, don't run
 *   npx tsx pipeline/launch.ts --stage 2  # run only stage 2
 */

import { spawn, spawnSync, execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

const OLLAMA_URL = "http://127.0.0.1:11434";
const COMFYUI_URL = "http://127.0.0.1:8188";
const COMFYUI_DIR = "A:/ComfyUI_Fresh";
const CHECKPOINT_DIR = join(COMFYUI_DIR, "models", "checkpoints");
const LORA_DIR = join(COMFYUI_DIR, "models", "loras");

const REQUIRED_OLLAMA_MODELS = ["qwen3-vl:8b", "qwen3:14b"];
const REQUIRED_CHECKPOINT = "juggernautXL_ragnarokBy.safetensors";
const REQUIRED_LORAS = ["ClassipeintXL2.1.safetensors", "Hyper-SDXL-8steps-CFG-lora.safetensors"];

// ─── Helpers ───

async function isReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitFor(label: string, url: string, timeoutSec = 60): Promise<boolean> {
  const t0 = Date.now();
  process.stdout.write(`  Waiting for ${label}...`);
  while ((Date.now() - t0) / 1000 < timeoutSec) {
    if (await isReachable(url)) {
      console.log(` ready (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      return true;
    }
    await new Promise(r => setTimeout(r, 2000));
    process.stdout.write(".");
  }
  console.log(` TIMEOUT after ${timeoutSec}s`);
  return false;
}

function isProcessRunning(name: string): boolean {
  try {
    const result = execSync(`tasklist /FI "IMAGENAME eq ${name}" /NH`, { encoding: "utf-8" });
    return result.includes(name);
  } catch {
    return false;
  }
}

// ─── Service launchers ───

async function ensureOllama(): Promise<boolean> {
  console.log("\n── Ollama ──");

  if (await isReachable(`${OLLAMA_URL}/api/tags`)) {
    console.log("  Already running");
    return true;
  }

  console.log("  Starting Ollama...");
  spawn("ollama", ["serve"], {
    detached: true,
    stdio: "ignore",
    shell: true,
  }).unref();

  return await waitFor("Ollama", `${OLLAMA_URL}/api/tags`, 30);
}

async function ensureOllamaModels(): Promise<boolean> {
  console.log("\n── Ollama Models ──");
  let ok = true;

  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    const tags = await res.json();
    const installed = (tags.models || []).map((m: any) => m.name);

    for (const model of REQUIRED_OLLAMA_MODELS) {
      const base = model.split(":")[0];
      if (installed.some((m: string) => m.includes(base))) {
        console.log(`  [OK] ${model}`);
      } else {
        console.log(`  [PULLING] ${model}...`);
        const result = spawnSync("ollama", ["pull", model], {
          stdio: "inherit",
          shell: true,
        });
        if (result.status !== 0) {
          console.log(`  [FAIL] Could not pull ${model}`);
          ok = false;
        } else {
          console.log(`  [OK] ${model} pulled`);
        }
      }
    }
  } catch {
    console.log("  [FAIL] Cannot reach Ollama");
    ok = false;
  }

  return ok;
}

async function ensureComfyUI(): Promise<boolean> {
  console.log("\n── ComfyUI ──");

  if (await isReachable(`${COMFYUI_URL}/system_stats`)) {
    console.log("  Already running");
    return true;
  }

  const mainPy = join(COMFYUI_DIR, "main.py");
  const venvPython = join(COMFYUI_DIR, "venv", "Scripts", "python.exe");

  if (!existsSync(mainPy)) {
    console.log(`  [FAIL] ComfyUI not found at ${COMFYUI_DIR}`);
    console.log(`  Start it manually: cd ${COMFYUI_DIR} && python main.py --listen`);
    return false;
  }

  const pythonCmd = existsSync(venvPython) ? venvPython : "python";
  console.log(`  Starting ComfyUI with ${pythonCmd}...`);

  spawn(pythonCmd, ["main.py", "--listen"], {
    cwd: COMFYUI_DIR,
    detached: true,
    stdio: "ignore",
    shell: true,
    env: { ...process.env, TMPDIR: "A:/tmp" },
  }).unref();

  return await waitFor("ComfyUI", `${COMFYUI_URL}/system_stats`, 120);
}

function checkModelFiles(): boolean {
  console.log("\n── Model Files ──");
  let ok = true;

  // Checkpoint
  const ckpt = join(CHECKPOINT_DIR, REQUIRED_CHECKPOINT);
  if (existsSync(ckpt)) {
    console.log(`  [OK] ${REQUIRED_CHECKPOINT}`);
  } else {
    console.log(`  [FAIL] Missing: ${ckpt}`);
    console.log(`         Download from: https://civitai.com/models/133005`);
    ok = false;
  }

  // LoRAs
  for (const lora of REQUIRED_LORAS) {
    const p = join(LORA_DIR, lora);
    if (existsSync(p)) {
      console.log(`  [OK] ${lora}`);
    } else {
      console.log(`  [FAIL] Missing: ${p}`);
      if (lora.includes("Hyper")) {
        console.log(`         Download from: https://huggingface.co/ByteDance/Hyper-SD`);
      } else {
        console.log(`         Download from: https://civitai.com/models/127139`);
      }
      ok = false;
    }
  }

  return ok;
}

async function checkSupabase(): Promise<boolean> {
  console.log("\n── Supabase ──");
  try {
    const { supabase } = await import("./config.js");
    const { data, error } = await supabase.from("counties").select("fips").limit(1);
    if (error) throw error;
    if (data && data.length > 0) {
      console.log("  [OK] Connected");

      // Count cards
      const { count } = await supabase.from("cards").select("fips", { count: "exact", head: true });
      console.log(`  [OK] ${count || 0} cards in database`);
      return true;
    }
    console.log("  [FAIL] No data returned");
    return false;
  } catch (e: any) {
    console.log(`  [FAIL] ${e.message}`);
    return false;
  }
}

function checkDiskSpace(): boolean {
  console.log("\n── Disk Space ──");
  try {
    // Check S: drive (project) and A: drive (ComfyUI)
    for (const drive of ["S:", "A:"]) {
      const raw = execSync(`wmic logicaldisk where DeviceID="${drive}" get FreeSpace /value`, { encoding: "utf-8" });
      const match = raw.match(/FreeSpace=(\d+)/);
      if (match) {
        const freeGB = parseInt(match[1]) / (1024 ** 3);
        const status = freeGB > 16 ? "[OK]" : freeGB > 5 ? "[WARN]" : "[FAIL]";
        console.log(`  ${status} ${drive} ${freeGB.toFixed(1)} GB free`);
        if (freeGB < 5) return false;
      }
    }
  } catch {
    console.log("  [SKIP] Could not check disk space");
  }
  return true;
}

// ─── Main ───

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const stageArg = args.indexOf("--stage");
  const singleStage = stageArg >= 0 ? parseInt(args[stageArg + 1]) : null;

  console.log("╔══════════════════════════════════════════╗");
  console.log("║     County Wars Pipeline v2 Launcher     ║");
  console.log("╚══════════════════════════════════════════╝");

  let allOk = true;

  // 1. Model files (no service needed)
  if (!checkModelFiles()) allOk = false;

  // 2. Disk space
  if (!checkDiskSpace()) allOk = false;

  // 3. Ollama
  if (!(await ensureOllama())) allOk = false;
  else if (!(await ensureOllamaModels())) allOk = false;

  // 4. ComfyUI (only needed for stage 3)
  if (!singleStage || singleStage === 3) {
    if (!(await ensureComfyUI())) allOk = false;
  } else {
    console.log("\n── ComfyUI ──");
    console.log("  [SKIP] Not needed for stage " + singleStage);
  }

  // 5. Supabase
  if (!(await checkSupabase())) allOk = false;

  // Summary
  console.log("\n" + "═".repeat(44));
  if (allOk) {
    console.log("  All checks passed!");
  } else {
    console.log("  Some checks failed — fix issues above.");
    if (!checkOnly) {
      console.log("  Run with --check to verify without starting pipeline.");
    }
    process.exit(1);
  }
  console.log("═".repeat(44));

  if (checkOnly) {
    console.log("\n--check mode: exiting without running pipeline.");
    return;
  }

  // 6. Start dashboard in background
  console.log("\n  Starting dashboard at http://localhost:3333 ...");
  const dashboard = spawn("npx", ["tsx", "pipeline/dashboard/server.ts"], {
    detached: true,
    stdio: "ignore",
    shell: true,
    cwd: process.cwd(),
  });
  dashboard.unref();

  // 7. Run pipeline
  if (singleStage) {
    console.log(`\n  Running Stage ${singleStage} only...\n`);
    const cmds: Record<number, string> = {
      1: "npx tsx pipeline/stage-1-reference.ts",
      2: "npx tsx pipeline/stage-2-describe.ts",
      3: "python pipeline/stage-3-render.py",
      4: "npx tsx pipeline/stage-4-enrich.ts",
      5: "npx tsx pipeline/stage-5-export.ts",
    };
    const cmd = cmds[singleStage];
    if (!cmd) {
      console.error(`Invalid stage: ${singleStage}. Use 1-5.`);
      process.exit(1);
    }
    const result = spawnSync(cmd.split(" ")[0], cmd.split(" ").slice(1), {
      stdio: "inherit",
      shell: true,
      cwd: process.cwd(),
    });
    process.exit(result.status || 0);
  } else {
    console.log("\n  Running full pipeline...\n");
    const result = spawnSync("npx", ["tsx", "pipeline/run-all.ts"], {
      stdio: "inherit",
      shell: true,
      cwd: process.cwd(),
    });
    process.exit(result.status || 0);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
