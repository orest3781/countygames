# County Wars Pipeline v2 — Design Spec

## Goal

Replace the 23-script, 20-job pipeline with 5 clear stages that turn raw county data into finished card content (art, text, metadata). One model, one workflow, no branching paths.

## What Gets Replaced

**Deleted (content generation):**
- `pipeline/enrich/generate-art-prompts.ts`
- `pipeline/enrich/generate-flavor-text.ts`
- `pipeline/enrich/download-wiki-descriptions.ts`
- `pipeline/enrich/satellite-images.ts`
- `pipeline/enrich/notable-people.ts`
- `pipeline/images/generate-art.py`
- `pipeline/images/polish-art.py`
- `pipeline/images/fix-art.py`
- `pipeline/images/auto-pipeline.py`
- `pipeline/images/download-satellite.ts`
- `pipeline/images/download-tiles.ts`
- `pipeline/dashboard/server.ts`
- `pipeline/export-csv.ts`

**Kept (data sources — separate concern):**
- `pipeline/sources/00-gazetteer.ts`
- `pipeline/sources/01-census-acs.ts`
- `pipeline/sources/02-bea-gdp.ts`
- `pipeline/sources/03-health-rankings.ts`
- `pipeline/sources/04-fema-disasters.ts`
- `pipeline/derive/compute-stats.ts`
- `pipeline/curate/select-500.ts`
- `pipeline/simulate/battle-sim.ts`
- `pipeline/simulate/game-sim.ts`
- `pipeline/config.ts`

---

## Architecture: 5 Stages

Each stage is one script. Each is resume-safe (skips counties already done). Each checks its dependencies before starting. Each stage unloads its models before the next stage runs (VRAM management).

### Stage 1: Reference (`pipeline/stage-1-reference.ts`)

Downloads two reference datasets for every county:

**Satellite tiles:**
- Source: ESRI World Imagery (free, no API key)
- One tile per county centroid (256x256 px at zoom 11, ~78km coverage). Not full county coverage — used as reference for the vision LLM, not displayed directly.
- JPEG format
- Output: `data/satellite/{fips}.jpg`
- Validates JPEG magic bytes, retries on failure
- Rate limit: 100ms between requests
- ~15 min for 3,144 tiles

**Wikipedia descriptions:**
- Source: Wikipedia REST API `/page/summary/`
- Builds title from county name + state (e.g., `Autauga_County,_Alabama`)
- Falls back to alternate title formats for parishes, boroughs, etc.
- Output: `data/wiki.json` (single file, `{ fips: extract }`)
- Rate limit: 200ms between requests
- ~10 min for 3,144 descriptions

**Combined output:** `data/.status.json` updated with `{ stage1: { complete: true, satellites: N, wiki: N } }`

### Stage 2: Describe (`pipeline/stage-2-describe.ts`)

A vision LLM looks at each county's satellite tile and writes a scene description for the card art.

**Model:** Qwen3-VL:8b via Ollama (localhost:11434). Already installed.

**VRAM management:** Before starting, call `POST /api/generate` with `keep_alive: 0` to unload any other models. After completing, unload the vision model before Stage 3 needs GPU for ComfyUI.

**Input per county:**
- Satellite tile (base64 image)
- Wikipedia extract (text)
- County metadata: name, state, population, area, rarity
- Region assignment (see Region Map below)

**Prompt structure:**
```
You are looking at a satellite photo of a county in [region].
[Wikipedia extract]
Write a 40-60 word landscape scene description for a [rarity] painting.
Region palette: [palette keywords]
Rarity mood: [mood keywords]
Include: specific terrain, time of day, lighting, atmosphere.
Never include: county name, state name, text, signs, people.
Write ONLY the scene description.
```

**Output:** `data/descriptions.json` — `{ fips: "scene description..." }`

**Cleanup rules:**
- Strip quotes, take longest line if multi-line
- Cap at 300 chars
- Remove county/state name if leaked
- Skip if under 20 chars (mark as failed for retry)

**Resume:** Skips FIPS already in `data/descriptions.json`.

**Missing wiki extract handling:** ~20 counties will have no Wikipedia extract (parishes, planning regions, etc.). When the extract is missing, omit the `[Wikipedia extract]` line from the prompt entirely — the vision model will rely solely on the satellite image. These counties are logged but not treated as failures.

**Dependency check:** Requires `data/satellite/` with >0 files and `data/wiki.json`.

### Stage 3: Render (`pipeline/stage-3-render.py`)

Generates card art via ComfyUI using the scene descriptions from Stage 2.

**Pre-flight checks:**
- Verify ComfyUI is running at `http://127.0.0.1:8188`
- Verify checkpoint file exists: `juggernautXL_ragnarokBy.safetensors`
- Verify LoRA files exist: `ClassipeintXL2.1.safetensors`, `Hyper-SDXL-8steps-CFG-lora.safetensors`
- Verify `data/descriptions.json` exists and has entries
- Estimate disk space needed: ~15GB for 3,144 images at 1152x896

**Checkpoint:** JuggernautXL Ragnarok v13 (`juggernautXL_ragnarokBy.safetensors`) — already installed. Single checkpoint, no swapping.

**LoRAs (stacked):**
- ClassipeintXL v2.1 at weight 0.5 — oil painting texture for visual cohesion
- Hyper-SDXL-8steps-CFG at weight 0.6 — distillation acceleration with CFG support. **Must use the CFG variant** (`Hyper-SDXL-8steps-CFG-lora.safetensors`), not the non-CFG variant. The non-CFG variant requires `guidance_scale=0` and DDIM scheduler, which conflicts with ClassipeintXL and the tiered CFG values below. **Need to download** from [HuggingFace ByteDance/Hyper-SD](https://huggingface.co/ByteDance/Hyper-SD/blob/main/Hyper-SDXL-8steps-CFG-lora.safetensors).

**Sampler:** `dpmpp_2m_sde` with `karras` scheduler. Compatible with Hyper-SDXL-CFG variant.

**Resolution:** 1152x896 (4:3 landscape, SDXL-native ~1MP pixel budget).

**Prompt construction:**
```
{region_palette}, {rarity_mood}, {scene_description},
landscape painting, no text, no people, no signs, masterpiece quality
```

**Negative prompt (all rarities):**
```
text, words, letters, watermark, signature, people, faces,
blurry, low quality, oversaturated, cartoon, anime
```

**Tiered rendering by rarity:**

| Rarity | Steps | CFG | Polish Passes | Denoise |
|--------|-------|-----|---------------|---------|
| Common | 8 | 5.0 | 0 | — |
| Uncommon | 8 | 5.0 | 0 | — |
| Rare | 12 | 6.0 | 1 | 0.35 |
| Epic | 16 | 7.0 | 1 | 0.30 |
| Legendary | 16 | 8.0 | 2 | 0.30, 0.20 |

Step counts are calibrated for Hyper-SDXL-8steps-CFG LoRA. The CFG variant supports CFG values 5-8 (unlike the non-CFG variant which requires 0). Without distillation, SDXL needs 20+ steps. With Hyper-SDXL-CFG, 8 steps produces quality comparable to 25+ standard steps.

"Polish pass" = img2img on the card's own output using the same checkpoint + LoRAs at low denoise. Adds texture and sharpens detail without changing composition.

**Output:** `data/card-art/{fips}.png`

**Resume:** Skips FIPS where `data/card-art/{fips}.png` already exists AND file size is >10KB (to catch corrupt/truncated files from interrupted runs). Validates PNG magic bytes (`\x89PNG`) before skipping.

**Dependency check:** Requires `data/descriptions.json` and ComfyUI running at `http://127.0.0.1:8188`.

**Speed estimates (RTX 3080+):**
Rarity counts are approximate — actual distribution is computed at runtime from Supabase `cards.rarity` column. Estimates below assume typical distribution:

- Common (~1,568): ~5 sec each = 2.2 hr
- Uncommon (~816): ~5 sec each = 1.1 hr
- Rare (~444): ~12 sec each = 1.5 hr
- Epic (~220): ~14 sec each = 0.9 hr
- Legendary (~96): ~22 sec each = 0.6 hr
- **Total: ~6.3 hours**

### Stage 4: Enrich (`pipeline/stage-4-enrich.ts`)

An LLM generates flavor text. Notable people are extracted from Wikipedia descriptions (Stage 1) rather than LLM generation, to avoid hallucination.

**Model:** Qwen3:14b via Ollama (localhost:11434). Fits in 10GB VRAM at Q4_K_M.

**VRAM management:** Before starting, ensure ComfyUI is not holding GPU memory. Unload Qwen3 after completion.

**Flavor text prompt:**
```
Write ONE evocative sentence (under 120 chars) for a collectible card
representing {county_name}, {state_name}.
Population: {pop}. Area: {area}. Known for: {disasters}.
The sentence should capture the county's personality — poetic, not factual.
Write ONLY the sentence, no quotes.
```

**Notable person extraction:**
Instead of asking an LLM to recall people (hallucination risk), parse the Wikipedia extract from `data/wiki.json`. Many county Wikipedia articles mention notable people, county seats, and key facts. Extract:
- If the Wikipedia text mentions a person by name in context of the county, use them
- `person_desc` is the sentence containing the person's name, trimmed to 80 chars
- If no person found in text, set `person_name: null`, `person_desc: null`
- If no Wikipedia extract exists for this county, both fields are null
- No LLM needed for this step — pure text parsing with regex patterns

**Output:** `data/enrichment.json` — `{ fips: { flavor: "...", person_name: "..." | null, person_desc: "..." | null } }`

**Resume:** Skips FIPS already in `data/enrichment.json`.

**Dependency check:** Requires `data/wiki.json` (for notable person extraction) and Ollama running with `qwen3:14b` available.

**Saves after every county** (no batch accumulation — crash-safe).

### Stage 5: Export (`pipeline/stage-5-export.ts`)

Writes all generated content to Supabase and exports a CSV.

**Supabase updates (cards table):**
- `art_prompt` ← scene description from Stage 2
- `flavor_text` ← from Stage 4
- `notable_person` ← from Stage 4
- `notable_person_desc` ← from Stage 4

**CSV export:** `data/export.csv` with all card columns (23+ fields).

**Dependency check:** Requires `data/descriptions.json`, `data/enrichment.json`, and `data/wiki.json`.

### Run All (`pipeline/run-all.ts`)

Runs stages 1-5 in sequence. Stops on first failure. Logs total time at the end. Spawns Stage 3 (Python) as a child process via `child_process.spawn("python", ["pipeline/stage-3-render.py"])`.

Between stages, manages VRAM:
- After Stage 2: unloads Ollama vision model (`POST /api/generate` with `keep_alive: 0`)
- Before Stage 3: verifies ComfyUI is running
- After Stage 3: no cleanup needed (ComfyUI manages its own memory)
- Before Stage 4: loads Qwen3:14b into Ollama
- After Stage 4: unloads Ollama text model

```
npx tsx pipeline/run-all.ts
```

Each stage can also be run independently:
```
npx tsx pipeline/stage-1-reference.ts
npx tsx pipeline/stage-2-describe.ts
python pipeline/stage-3-render.py
npx tsx pipeline/stage-4-enrich.ts
npx tsx pipeline/stage-5-export.ts
```

---

## Region Map

8 US regions, each with a distinct palette and signature landscape elements.

| Region | States | Palette Keywords | Signature Elements |
|--------|--------|------------------|--------------------|
| **Northeast** | ME, NH, VT, MA, RI, CT, NY, NJ, PA | slate blue, autumn amber, harbor grey | coastline, fall foliage, brick towns, harbors |
| **Southeast** | DE, MD, NC, SC, GA, FL, DC | warm gold, moss green, coral | Spanish moss, marshland, plantation fields, beaches |
| **Midwest** | OH, IN, IL, MI, WI, MN, IA, MO, ND, SD, NE, KS | wheat gold, prairie green, storm grey | vast horizons, farmland, grain elevators, big sky |
| **South** | KY, TN, AL, MS, AR, LA | deep amber, rust red, bayou green | delta, red earth, rolling hills, bayou |
| **Mountain** | MT, ID, WY, CO, UT | alpine white, granite blue, aspen gold | peaks, canyons, alpine meadows, alpine lakes |
| **Pacific** | WA, OR, CA, AK, HI | emerald, Pacific blue, fog grey | old growth forest, volcanic coast, tropical reefs |
| **Southwest** | AZ, NM, NV, TX, OK | terracotta, turquoise, sunset orange | red rock, desert flora, adobe, open range, big sky |
| **Appalachia** | WV, VA | misty blue-green, forest deep green, morning fog | forested ridges, mountain hollows, rolling valleys |

**Region assignment** is determined by `state_abbr` → region lookup table in `pipeline/config.ts`.

**Changes from v1:**
- West Virginia and Virginia moved from Southeast to new **Appalachia** region (misty mountains, not marshland)
- Texas, Oklahoma, Nevada moved from South/Mountain to **Southwest** (desert/range, not bayou/alpine)
- 8 regions instead of 7 to avoid palette mismatches

---

## Rarity Mood Modifiers

Applied to the prompt to differentiate visual intensity.

| Rarity | Mood Keywords |
|--------|---------------|
| Common | soft daylight, clean, simple, peaceful, quiet |
| Uncommon | warm afternoon, moderate detail, inviting, pleasant |
| Rare | golden hour, rich texture, atmospheric, beautiful |
| Epic | dramatic sunset, lush, cinematic, awe-inspiring |
| Legendary | god rays, hyper-detailed, luminous, transcendent, mythic |

---

## Dashboard (`pipeline/dashboard/server.ts`) — NEW

Complete rewrite replacing the v1 dashboard (listed under "What Gets Replaced" above). Read-only monitoring UI served at `http://localhost:3333`.

### What it shows

**Pipeline progress bar:** 5 stages as horizontal steps. Each shows not started / in progress (%) / complete with green checkmarks cascading left-to-right.

**Stats row:** 6 metric cards:
- Satellite Tiles: N / 3,144
- Wiki Descriptions: N / 3,144
- Scene Descriptions: N / 3,144
- Card Art: N / 3,144
- Flavor Text: N / 3,144
- Notable People: N / 3,144

**Art preview grid:** Thumbnail grid of most recently generated card art. Click to enlarge. Auto-refreshes.

**Live log tail:** Last 20 lines of stdout from any running stage. Auto-scrolls.

**Copy command buttons:** Next to each stage name, copies the terminal command to clipboard.

### What it does NOT have

- No start/stop buttons
- No model selection
- No workflow branching
- No job queue

### How it works

Reads `data/.status.json` and scans `data/` folder file counts. Static HTML served by a Node HTTP server. Polls every 3 seconds.

---

## Data Directory Layout

After a complete pipeline run:

```
data/
  satellite/          — 3,144 .jpg tiles (Stage 1)
  wiki.json           — { fips: "wikipedia extract..." } (Stage 1)
  descriptions.json   — { fips: "scene description..." } (Stage 2)
  card-art/           — 3,144 .png card images (Stage 3)
  enrichment.json     — { fips: { flavor, person_name, person_desc } } (Stage 4)
  export.csv          — Full card export (Stage 5)
  .status.json        — Per-stage completion tracking
```

No versioned folders. No `.tmp` files. Want to redo art? Delete `data/card-art/` and re-run Stage 3.

**Estimated disk space:** ~15GB for card-art, ~58MB for satellite tiles, ~1MB for JSON files. Total: ~16GB.

---

## Status Tracking (`data/.status.json`)

Each stage writes its completion state:

```json
{
  "stage1": { "complete": true, "satellites": 3144, "wiki": 3124, "timestamp": "2026-04-05T..." },
  "stage2": { "complete": true, "descriptions": 3144, "failed": 0, "timestamp": "2026-04-05T..." },
  "stage3": { "complete": false, "rendered": 1200, "total": 3144, "timestamp": "2026-04-05T..." },
  "stage4": { "complete": true, "enriched": 3144, "timestamp": "2026-04-05T..." },
  "stage5": { "complete": true, "exported": 3144, "timestamp": "2026-04-05T..." }
}
```

The dashboard reads this file. Each stage updates it on completion and periodically during long runs.

---

## Dependencies

**External services:**
- Supabase (existing project, unchanged)
- Ollama at localhost:11434 (Qwen3-VL:8b for Stage 2, Qwen3:14b for Stage 4)
- ComfyUI at localhost:8188 (JuggernautXL Ragnarok v13 + ClassipeintXL + Hyper-SDXL for Stage 3)

**npm packages:** No new dependencies. Uses existing Supabase JS, dotenv, fs, path.

**Python packages:** Standard ComfyUI dependencies (websocket-client, requests, Pillow).

**Models to have ready:**
- `ollama pull qwen3-vl:8b` (already installed)
- `ollama pull qwen3:14b` (need to pull)
- JuggernautXL Ragnarok v13 checkpoint (`juggernautXL_ragnarokBy.safetensors`) — already installed
- Hyper-SDXL-8steps-CFG LoRA (`Hyper-SDXL-8steps-CFG-lora.safetensors`) — **need to download** from [HuggingFace](https://huggingface.co/ByteDance/Hyper-SD/blob/main/Hyper-SDXL-8steps-CFG-lora.safetensors)
- ClassipeintXL v2.1 LoRA — **need to download** from CivitAI

**Pre-flight check:** `run-all.ts` verifies all models and services are available before starting any stage. Prints a clear checklist:
```
[OK] Ollama running at localhost:11434
[OK] Model qwen3-vl:8b available
[OK] Model qwen3:14b available
[OK] ComfyUI running at localhost:8188
[OK] Checkpoint juggernautXL_ragnarokBy.safetensors found
[OK] LoRA Hyper-SDXL-8steps-CFG-lora.safetensors found
[OK] LoRA ClassipeintXL2.1.safetensors found
[OK] Supabase connection verified
[OK] Disk space: 42GB available (need ~16GB)
```
