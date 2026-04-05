# Pipeline v2 Design Spec -- Critical Review

**Reviewer:** Claude Opus 4.6 (automated research-backed critique)
**Date:** 2026-04-04
**Spec under review:** `2026-04-05-pipeline-v2-design.md`
**Verdict:** Solid foundation with several significant technical gaps and outdated model choices.

---

## Executive Summary

The spec has 5 real problems, 3 outdated choices, and roughly a dozen missing details that will bite you during implementation. The 5-stage architecture is sound in principle. The model selections are 6-12 months behind what is now available locally via Ollama. The art generation pipeline has a resolution error, a missing sampler/scheduler specification, and the "6 steps for Common" tier will produce visibly bad output. The dashboard is underspecified. The region map has defensible but debatable state placements. The spec says nothing about disk space, VRAM management, error recovery beyond "retry," or what happens when Ollama and ComfyUI need the same GPU.

---

## 1. Art Generation Quality

### JuggernautXL v9 is outdated -- v13 Ragnarok exists

The spec locks to JuggernautXL v9 (Ragnarok). However, JuggernautXL **v13** is now the final SDXL release in the Juggernaut series, with significantly improved photorealism, digital painting, anatomy, and prompt adherence [Civitai, 2025]. The v13 was fine-tuned on a curated photographic dataset with Booru tag-based recaptioning. If the goal is landscape paintings with oil texture, v13's digital painting improvements are directly relevant.

**Recommendation:** Use JuggernautXL v13 Ragnarok, not v9. The spec should also note the exact safetensors filename expected, since CivitAI names differ from HuggingFace names.

### ClassipeintXL at 0.3 is probably too low

ClassipeintXL v2.1 is a good choice for oil painting cohesion -- it is widely regarded as the most consistent oil painting LoRA for SDXL [Civitai reviews]. However, the creator's own recommendation is to **start at 1.0 and adjust down to 0.7-0.8** for subtler effects. At 0.3, you will get only a faint painterly wash that may not be visible at card size. The existing `generate-art.py` uses 0.6 for Hyper-SDXL LoRA, which is a different concern (speed vs. style), but the point stands: 0.3 is the "barely there" range.

**Recommendation:** Test at 0.5-0.7. If the oil texture is too heavy for Common rarity, consider varying LoRA strength by rarity tier (0.4 for Common, 0.6 for Rare, 0.8 for Legendary) rather than using a single low value.

### 1024x768 is NOT an SDXL-native resolution

This is a factual error in the spec. SDXL was trained at 1024x1024. The supported landscape resolutions that maintain the ~1 megapixel budget are:

| Aspect Ratio | Resolution | Pixels |
|---|---|---|
| 4:3 | **1152x896** | 1,032,192 |
| 3:2 | **1216x832** | 1,011,712 |
| 16:9 | **1344x768** | 1,032,192 |

1024x768 = 786,432 pixels, which is **24% below the 1MP training budget**. This means you are leaving quality on the table. The model will generate at this resolution but with less detail than it is capable of.

**Recommendation:** Use **1152x896** (4:3 landscape) or **1216x832** (3:2 landscape). Either maintains the SDXL pixel budget. For card art, 4:3 (1152x896) is likely the best match for typical card proportions.

### 6 steps for Common rarity will produce garbage

The spec uses 6 steps for Common cards. The existing `generate-art.py` uses Hyper-SDXL-4steps LoRA, which is a **distilled model** specifically designed for 4-8 step generation. The spec uses ClassipeintXL (a style LoRA, not a distillation LoRA). Without a distillation LoRA or Lightning checkpoint, standard SDXL needs **minimum 15-20 steps** to produce coherent output. At 6 steps with a non-distilled model, you will get blurry, unfinished images.

The tiered step counts assume Lightning/Turbo-style acceleration that the spec does not actually configure.

| Rarity | Spec Steps | Minimum Without Distillation | With Hyper-SDXL LoRA |
|---|---|---|---|
| Common | 6 | 20 | 4-6 |
| Uncommon | 10 | 20 | 6-8 |
| Rare | 15 | 25 | 8-10 |
| Epic | 20 | 30 | 10-12 |
| Legendary | 20 | 30+ | 12-15 |

**Recommendation:** Either (a) add Hyper-SDXL-4steps LoRA alongside ClassipeintXL (you can stack LoRAs), or (b) raise all step counts to 20+ and accept the ~3x time increase, or (c) use JuggernautXL-Lightning as the checkpoint instead of standard v9/v13. Option (a) is the most practical: the existing code already uses Hyper-SDXL LoRA at 0.6 for exactly this reason.

### No sampler or scheduler specified

The spec omits the sampler and scheduler entirely. This is a critical parameter for SDXL output quality. The existing code uses `dpmpp_sde` with `karras` scheduler, which is a good choice. Community consensus for SDXL landscape work in 2025-2026 is:

- **Best quality:** DPM++ 2M SDE + Karras (slower but best detail)
- **Good balance:** DPM++ SDE + Karras (what your existing code uses)
- **Fast:** Euler + Normal (for distilled/Lightning models)

**Recommendation:** Specify `dpmpp_2m_sde` with `karras` scheduler explicitly in the spec. If using Hyper-SDXL LoRA for speed, switch to `euler` with `normal` scheduler for the low-step tiers.

### No mention of Flux.1

The elephant in the room: Flux.1 dev produces superior landscape images compared to any SDXL model, particularly for photorealistic natural lighting and terrain [multiple 2026 comparisons]. However, Flux has 12B parameters (vs. SDXL's 3.5B), takes ~4x longer per image, has a weaker LoRA ecosystem, and has much higher VRAM requirements. For 3,144 images, the time difference is substantial (potentially 26+ hours vs. 6.5 hours).

**Recommendation:** SDXL is the right call for this volume. But the spec should acknowledge this tradeoff explicitly and note that a future pass could re-render Legendary-tier cards (96 cards) with Flux.1 for premium quality.

### CFG values are too low for non-distilled models

The CFG values (2.0-3.0) are appropriate for Lightning/Turbo distilled models but too low for standard SDXL. Without distillation, standard SDXL typically needs CFG 5-8 for well-guided output. At CFG 2.0 with 6 steps and no distillation LoRA, Common cards will be nearly random noise.

**Recommendation:** If keeping standard models, use CFG 5-7. If adding Hyper-SDXL LoRA, CFG 1.5-2.5 is correct.

### Speed estimates assume distilled-model speeds

The time estimates (4 sec for Common at 6 steps) are only achievable with Lightning/Turbo acceleration. Standard SDXL at 20 steps on an RTX 3080 takes 12-15 seconds per image. At corrected step counts without distillation, total time would be **15-20 hours**, not 6.5.

---

## 2. Vision LLM Choice

### Qwen3-VL:8b is a reasonable but not optimal choice

Qwen3-VL:8b is genuinely strong -- it scores 896-905 on OCRBench, beating InternVL 2.5-78B despite having 9x fewer parameters [Qwen technical report, 2025]. Its spatial perception is particularly good, which matters for satellite imagery interpretation.

However, several alternatives are now available on Ollama that deserve consideration:

| Model | Size | Strengths | Weaknesses | Ollama Available |
|---|---|---|---|---|
| **Qwen3-VL:8b** (spec choice) | 8B | Strong spatial, good OCR, fast | Smaller context for complex scenes | Yes |
| **Llama 4 Scout** | 17B (MoE) | Top multimodal benchmark scores (96/100 on vision), 10M context | Higher VRAM, MoE overhead | Yes |
| **Gemma 3:27b** | 27B | 128K context, excellent image reasoning, adaptive resolution | Requires ~16GB+ VRAM | Yes |
| **Qwen3-VL:32b** | 32B | Same architecture as 8b but more capable | Requires ~20GB VRAM, much slower | Yes |

For satellite imagery specifically, research shows general-purpose VLMs still struggle with geospatially complex tasks [GEOBench-VLM, ICCV 2025]. No model has a clear domain advantage here.

**Recommendation:** Qwen3-VL:8b is a defensible choice for speed/quality balance. But the spec should note that if VRAM allows, Gemma 3:27b or Llama 4 Scout would produce better scene descriptions. More importantly, the spec should include a **model validation step** that generates 10 sample descriptions and lets a human review them before committing to the full 3,144-county run.

### The 40-60 word target may be too short

The prompt asks for 40-60 words, which Stage 3 then needs to translate into compelling card art. SDXL responds well to descriptive prompts (unlike SD1.5's tag-based style). A 40-word description truncated to 300 chars gives the image model very little to work with for differentiating 3,144 unique counties.

**Recommendation:** Increase to 60-90 words. The extra detail costs almost nothing (vision model inference time is dominated by image encoding, not text generation) and gives SDXL more to differentiate visually similar counties.

---

## 3. Text LLM Choice

### Qwen2.5:32b is a generation behind

Qwen 3:32b is now available on Ollama and provides significant improvements over Qwen 2.5:32b:

- Trained on 36 trillion tokens (vs. 18T for 2.5)
- Matches Qwen2.5-72B base performance
- Superior creative writing and human preference alignment
- Flexible thinking/non-thinking modes

For the specific task of writing evocative one-sentence flavor text, creative writing quality is the primary concern. Qwen3:32b's improvements in creative writing benchmarks make it the clear successor.

**Other contenders:**

| Model | Creative Writing | Speed (Ollama) | VRAM | Notes |
|---|---|---|---|---|
| **Qwen3:32b** | Excellent | ~8 tok/s | ~20GB | Best creative writing in class |
| **Gemma 3:27b** | Very good | ~10 tok/s | ~16GB | Strong instruction following |
| **Llama 3.3:70b** | Good | ~3 tok/s | ~40GB | Too large for most setups |
| **Qwen2.5:32b** (spec choice) | Good | ~8 tok/s | ~20GB | Outdated |

**Recommendation:** Switch to Qwen3:32b. It is the same size, same VRAM, same speed, but better at the exact task you need.

### The notable person prompt is an LLM hallucination factory

Asking an LLM "who is the most famous person from X county" is a recipe for confident fabrication. LLMs routinely assign famous people to the wrong counties, invent plausible-sounding people, or misattribute biographical details. There is no ground-truth validation in the pipeline.

**Recommendation:** Either (a) source notable people from a structured dataset (Wikipedia "Notable people" sections, which the pipeline already has access to via wiki extracts), or (b) add a verification step that cross-checks the LLM's answer against the Wikipedia extract, or (c) flag this field as "AI-generated, unverified" in the card data.

### Two separate Ollama calls per county is slow

Stage 4 makes two sequential Ollama calls per county (flavor text + notable person). At ~2 seconds per call, that is ~3.5 hours for 3,144 counties with no parallelism.

**Recommendation:** Combine both tasks into a single prompt with structured output (JSON format). This halves the number of Ollama calls. The existing `generate-flavor-text.ts` already does this as two calls, so it is a known inefficiency being carried forward.

---

## 4. Region Map

### The 7 regions are defensibly organized but have specific issues

**Problem 1: Oklahoma and Texas in "South" instead of "Southwest" or a separate region.**
Oklahoma and Texas are enormous and geographically diverse. West Texas (Big Bend, Trans-Pecos) is pure desert Southwest. East Texas (Piney Woods) is Southern. Oklahoma's western panhandle is Plains/Southwest while eastern Oklahoma is forested hills. Lumping all of TX and OK into "South" with "deep amber, rust red, bayou green" will produce bayou-themed art for El Paso County, which is absurd.

**Problem 2: Delaware and Maryland in "Southeast" instead of "Northeast."**
Delaware and Maryland are culturally and geographically Mid-Atlantic. The Census Bureau places them in the South, but their landscape (Chesapeake Bay, coastal plain) is distinct from the "Spanish moss, marshland, plantation fields" palette assigned to Southeast. DC is also in Southeast, which is defensible for administrative reasons but odd visually.

**Problem 3: West Virginia in "Southeast" instead of a separate Appalachian region or "South."**
West Virginia's landscape is Appalachian mountains, not coastal Southeast. Its palette should match mountain terrain, not "warm gold, moss green, coral."

**Problem 4: The Southwest region has only 2 states (AZ, NM) = ~47 counties.**
This is a tiny region. Meanwhile "South" has 8 states and likely 600+ counties. The imbalance means one palette serves a vast diversity (bayous to oil fields to hill country) while another serves a narrow, consistent desert landscape.

**Problem 5: Nevada in "Mountain" instead of "Southwest."**
Southern Nevada (Las Vegas, Mojave Desert) is far more visually aligned with Arizona/New Mexico than with Montana/Wyoming/Colorado alpine territory.

**Recommendation:** Consider 8 regions:
1. Northeast (same)
2. Mid-Atlantic (DE, MD, DC, VA, WV) -- separate from deep South
3. Southeast (NC, SC, GA, FL)
4. South Central (KY, TN, AL, MS, AR, LA)
5. Great Plains (OK, TX, KS, NE, SD, ND) -- or split TX
6. Mountain (MT, ID, WY, CO, UT)
7. Southwest (AZ, NM, NV)
8. Pacific (WA, OR, CA, AK, HI)

Alternatively, keep 7 but fix the most egregious problems: move NV to Southwest, move DE/MD/DC to Northeast.

### The per-state art style from v1 was more nuanced

The existing `generate-art.py` has 51 per-state art styles (Hudson River School for NY, Grant Wood regionalism for IA, etc.). The v2 spec replaces this with 7 regional palettes. This is a significant loss of visual diversity. New York and New Jersey will get the same "slate blue, autumn amber, harbor grey" despite having very different visual identities.

**Recommendation:** Consider a hybrid: keep the 7 regional palettes as a base layer but add a per-state style modifier. The data already exists in the v1 code.

---

## 5. Pipeline Architecture

### The 5-stage breakdown is sound but Stage 3 is doing too much

Stage 3 handles: prompt construction, ComfyUI workflow building, image generation, polish passes, output validation, and resume logic. For Legendary cards, it runs 3 separate ComfyUI workflows (initial + 2 polish). This is the most complex and failure-prone stage.

**Recommendation:** Consider splitting Stage 3 into 3a (render) and 3b (polish). This lets you re-run polish independently if you tweak denoise settings, and makes resume logic simpler (you can have unpolished images that still need polish vs. completely missing images).

### The resume system has a race condition

Stage 3 checks for resume by looking for `data/card-art/{fips}.png`. But it writes the file only after all polish passes complete. If the process crashes after initial render but before polish, you lose the initial render and must regenerate from scratch. The existing code uses `.tmp` files and atomic rename, but the v2 spec says "No `.tmp` files."

**Recommendation:** Either use `.tmp` files (they work, the v1 code uses them for good reason) or write intermediate results to a separate directory. The "no `.tmp` files" design goal is nice for cleanliness but costs you crash safety.

### Stage 2 and Stage 4 could run in parallel

Stage 2 (vision descriptions) and Stage 4 (flavor text + notable people) have no dependency on each other. Stage 2 needs satellite tiles + wiki. Stage 4 needs county metadata. Both are Ollama calls, so they compete for GPU -- but Qwen3-VL:8b (Stage 2) and Qwen2.5:32b (Stage 4) cannot run simultaneously on a single GPU anyway. However, if Stage 2 finishes before Stage 3, you could start Stage 4 while Stage 3 is rendering on the GPU (since Stage 4 uses Ollama on CPU or a different GPU).

**Recommendation:** The spec should acknowledge this potential parallelism even if v2 does not implement it. At minimum, note that Stage 4 does not depend on Stage 3 and can run as soon as Stage 1 completes.

### The run-all.ts spawning Python is fragile

`child_process.spawn("python", ...)` assumes `python` is on PATH and points to the correct environment with ComfyUI dependencies installed. On Windows (which this project runs on), this is especially fragile. Python version conflicts, virtual environments, and conda environments all create failure modes.

**Recommendation:** Specify the exact Python invocation (e.g., `python3`, path to venv, or `conda run -n comfyui python`). Better yet, have the spec require a `.env` variable like `PYTHON_PATH` for the Stage 3 Python interpreter.

---

## 6. Missing Pieces

### VRAM management between Ollama and ComfyUI

This is the spec's biggest operational blind spot. Stage 2 uses Ollama (which loads Qwen3-VL:8b into VRAM). Stage 3 uses ComfyUI (which loads JuggernautXL + LoRA into VRAM). On an RTX 3080 (10GB), these cannot coexist. The spec says nothing about:
- Unloading Ollama models before Stage 3
- GPU memory cleanup between stages
- What happens if ComfyUI fails to allocate VRAM because Ollama is still resident

**Recommendation:** Add explicit VRAM management. Between Stage 2 and Stage 3, call `ollama stop` or `curl -X DELETE http://localhost:11434/api/unload` to free VRAM. Between Stage 3 and Stage 4, you may need to restart Ollama. Document the minimum VRAM requirement (likely 12GB for the full pipeline, 24GB for comfortable operation).

### Disk space requirements

The spec never mentions disk space. Let us calculate:
- 3,144 satellite tiles at ~50KB each = ~157 MB
- 3,144 PNG card images at ~1.5MB each (1152x896 RGBA) = **~4.7 GB**
- wiki.json, descriptions.json, enrichment.json = ~10 MB total
- JuggernautXL checkpoint = ~6.5 GB
- ClassipeintXL LoRA = ~200 MB
- Ollama models (8b + 32b) = ~25 GB
- ComfyUI installation = ~2 GB

**Total: ~38 GB minimum, ~50 GB with headroom.**

**Recommendation:** Document disk requirements. Add a pre-flight check in `run-all.ts` that verifies available disk space.

### No model availability pre-flight check

The spec says "Models to have ready" at the bottom but Stage 2/4 only discover missing models when they try to use them -- potentially hours into the pipeline. The existing code does check Ollama's model list, but the spec should formalize this.

**Recommendation:** Stage 0 (or pre-flight in run-all.ts): verify Ollama has both models loaded, ComfyUI has the checkpoint and LoRA, and both services are responsive. Fail fast with a clear error listing what is missing.

### No error budget or retry strategy

The spec says "retries on failure" for satellite downloads but specifies no retry count, backoff strategy, or error budget for any stage. What if 50 counties fail vision description? Does the pipeline continue? Does it abort?

**Recommendation:** Define per-stage error thresholds. For example: Stage 1 allows up to 100 missing tiles (some counties may not have imagery). Stage 2 allows up to 50 failed descriptions (retry queue). Stage 3 aborts on 3 consecutive failures (ComfyUI is probably dead). Stage 4 allows up to 20 failures.

### No validation of generated content

There is no quality gate between stages. Stage 2 could produce 3,144 descriptions that all say "rolling hills at sunset" and Stage 3 would dutifully render 3,144 identical images. Similarly, Stage 4 could hallucinate notable people for every county with no check.

**Recommendation:** Add basic validation:
- Stage 2: Check description uniqueness (flag if >10% are near-duplicates via simple string similarity).
- Stage 3: Check image file size (tiny PNGs indicate generation failure), check for predominantly single-color images.
- Stage 4: Check flavor text length distribution, flag any notable person names that appear for multiple counties.

### No seed strategy

The spec never mentions seeds for image generation. Without deterministic seeds, you cannot reproduce results. The existing code uses random seeds but does not record them.

**Recommendation:** Use `hash(fips)` as the base seed for each county. Record all seeds in the status file. This makes the pipeline reproducible and allows re-rendering a single county with the same result.

### No consideration of ESRI rate limiting or terms of service

The spec says 100ms between ESRI tile requests (~10 req/sec). ESRI World Imagery is a free basemap, but it has usage policies. At 3,144 requests, you are bulk-downloading their tiles. The spec should document whether this is within ESRI's acceptable use policy and what happens if you get rate-limited or IP-banned.

### Satellite tile resolution at zoom 11 may be insufficient

At zoom level 11, each tile is 256x256 pixels representing a large geographic area (~76km x 76km at the equator). For many US counties, especially in the eastern US where counties are small, a single tile at zoom 11 will show the county as a tiny portion of a much larger area. The vision model will be describing terrain that may not even be in the county.

**Recommendation:** Consider zoom level 13-14 for smaller counties (eastern US) and 10-11 for large western counties. Alternatively, download multiple tiles and stitch them. At minimum, document the geographic resolution tradeoff.

### Wikipedia title construction will fail for many counties

The spec builds Wikipedia titles as `{County}_County,_{State}` but Louisiana has parishes, Alaska has boroughs/census areas, and Connecticut recently reorganized its counties into "councils of government" (which may not have Wikipedia articles). The spec mentions "fallback to alternate title formats" but does not list them.

**Recommendation:** Document the exact fallback chain: `{Name}_Parish,_{State}`, `{Name}_Borough,_{State}`, `{Name}_Census_Area,_{State}`, `{Name},_{State}` (for independent cities like St. Louis, Baltimore, etc.).

---

## 7. Card Art Prompt Engineering

### The prompt structure is good but missing key SDXL techniques

The prompt construction (region palette + rarity mood + scene description + suffix) is reasonable. However, it is missing several SDXL-specific best practices:

**Missing: Quality boosters at the start of the prompt.** SDXL weights tokens by position. The first tokens matter most. Putting `{region_palette}` first means color keywords get priority over composition. For landscape art, you want composition and quality terms first.

**Recommended prompt order:**
```
masterpiece quality, landscape painting, {rarity_mood},
{scene_description}, {region_palette},
no text, no people, no signs
```

**Missing: Style prefix.** The ClassipeintXL creator recommends starting with "oil painting of..." to keep the LoRA on target. The spec does not include this.

**Missing: Aspect ratio token.** Some SDXL models respond to explicit aspect ratio hints in the prompt.

### The negative prompt is too generic

The spec's negative prompt is:
```
text, words, letters, watermark, signature, people, faces,
blurry, low quality, oversaturated, cartoon, anime
```

SDXL does not need the long negative prompt lists that SD1.5 required. However, the current negative is missing landscape-specific exclusions:
- `buildings, houses, roads, cars` -- you probably do not want modern infrastructure in card art
- `frame, border` -- SDXL sometimes generates decorative borders
- `cropped, out of frame` -- common SDXL artifacts

And it should NOT include:
- `oversaturated` -- this will fight against the vivid palettes in Legendary rarity ("god rays, luminous, transcendent"). Remove it or only apply it to Common/Uncommon.

**Recommendation:** Use rarity-tiered negative prompts:
- Common/Uncommon: `text, watermark, people, faces, buildings, roads, frame, border, low quality`
- Rare/Epic/Legendary: `text, watermark, people, faces, frame, border` (allow more artistic freedom)

### Per-state art style data is being thrown away

The existing v1 pipeline has 51 hand-crafted per-state art styles and 12 subjects per state. The v2 spec replaces all of this with 7 regional palettes. That is 612 hand-written subject descriptions being deleted. While the satellite-vision approach should produce more geographically accurate descriptions, the loss of art style specificity (Hudson River School for NY, Grant Wood for Iowa, etc.) is a significant regression in visual diversity.

**Recommendation:** Preserve the `STATE_ART_STYLES` dictionary from v1 and inject the per-state style into the prompt alongside (not replacing) the regional palette. For example:
```
oil painting of {scene_description}, {state_art_style}, {region_palette}, {rarity_mood}
```

---

## 8. Dashboard Design

### A read-only dashboard is the right call for v2

Given that this is a batch pipeline run by a single developer, start/stop buttons and job queues add complexity with no value. The read-only design is correct.

### But the spec is underspecified

**Missing: How does it know which stage is "in progress"?** The `.status.json` tracks completion but not liveness. If Stage 3 crashes at image 500, the dashboard will show "in progress (500/3144)" forever. There is no heartbeat or timeout mechanism.

**Missing: Error display.** The dashboard shows progress counts but not error counts. If 200 descriptions failed in Stage 2, the user sees "3144/3144 complete" (because the stage completed) but does not know about failures.

**Missing: Estimated time remaining.** The spec shows a progress bar but not ETA. For a 6-20 hour pipeline, ETA is the single most useful metric.

**Missing: Sample output preview for text stages.** The art preview grid only shows card art. What about previewing scene descriptions and flavor text? A bad description at Stage 2 will produce bad art at Stage 3 -- catching it early matters.

### Polling every 3 seconds is fine for file-based status

No issues with the polling approach for a single-user tool.

**Recommendation:** Add to the dashboard:
- Last heartbeat timestamp per stage (detect hung processes)
- Error/failure count per stage
- Rolling ETA based on throughput rate
- Sample text preview (random 5 descriptions + 5 flavor texts)

---

## 9. Comparison to Real Card Games

### Professional card games do not use procedural art pipelines

This comparison exposes the fundamental tension in the project. Real digital card games approach art completely differently:

**Magic: The Gathering / Magic Arena:** Commissions individual artists for every card. Each piece is hand-painted (digitally or physically) by a named artist. Wizards of the Coast pays $800-$2,000+ per card illustration. The art is the product. [WotC artist guidelines]

**Hearthstone:** Blizzard commissions concept art from professional digital painters, often using 3D pre-visualization for lighting and composition. Each card gets individual art direction. [Blizzard art team interviews]

**Marvel Snap:** Second Dinner licenses existing Marvel comic art and commissions variant illustrations. Card variants are a primary monetization lever -- they sell premium art for $5-20 per variant. [Marvel Snap art book, 2022]

**Pokemon TCG:** The Pokemon Company commissions from a roster of ~100+ illustrators with distinct styles. The variety of art styles is a selling point. [Pokemon TCG illustration credits]

### What this means for County Wars

None of these games use procedural generation, because for them, art quality IS the product. But County Wars has 3,144 cards (more than any single Magic set) and is presumably not paying $3M+ for commissioned art. The procedural approach is the only viable one.

However, the lessons that DO apply:

1. **Visual cohesion matters more than individual quality.** Players accept modest art if every card looks like it belongs in the same game. The regional palette system and ClassipeintXL LoRA are the right idea for this. But the v2 spec weakens cohesion compared to v1 by removing per-state styles.

2. **Rarity should be visually obvious.** In Hearthstone and Marvel Snap, you can tell card rarity at a glance from the art quality/complexity. The tiered rendering (more steps + polish for higher rarity) is good design. But the difference between 6 steps (Common) and 20 steps (Legendary) will be the difference between "broken" and "decent," not "decent" and "amazing."

3. **Card art is seen at thumbnail size.** Marvel Snap cards are ~200x280 pixels on a phone screen. Magic Arena cards are ~250x350 pixels. At these sizes, fine detail is invisible. What matters is: clear composition, strong color, readable silhouettes. This argues for stronger regional palettes, higher LoRA strength (more painterly = more readable at small sizes), and against subtle details that only show up at full resolution.

4. **Variant art drives engagement.** Every successful card game sells alternate art. The pipeline should generate a second seed per county (at minimum for Legendary tier) as variant art. This is trivial to implement (run the same prompt with `seed + 1`) and doubles your content for high-rarity cards.

---

## Summary of Recommendations (Priority Order)

### Must Fix (will cause visible failures):
1. **Fix resolution** to 1152x896 or 1216x832 (not 1024x768)
2. **Fix step counts** -- either add Hyper-SDXL LoRA for acceleration or raise minimums to 20+
3. **Fix CFG values** -- either use distilled model CFGs (current values) with distillation LoRA, or use standard CFGs (5-7) without it
4. **Specify sampler/scheduler** -- `dpmpp_2m_sde` + `karras`
5. **Add VRAM management** between stages (Ollama unload before ComfyUI)

### Should Fix (quality improvement):
6. **Upgrade to JuggernautXL v13** (or explicitly justify v9)
7. **Upgrade to Qwen3:32b** for flavor text (drop-in replacement)
8. **Raise ClassipeintXL LoRA weight** to 0.5-0.7
9. **Add pre-flight checks** for models, disk space, GPU memory
10. **Preserve per-state art styles** from v1 code

### Should Add (missing from spec):
11. **Seed strategy** (deterministic, recorded)
12. **Error budgets** per stage
13. **Content validation** between stages (duplicate detection, hallucination flags)
14. **Disk space requirements** documented
15. **Dashboard enhancements** (ETA, error counts, heartbeat, text preview)

### Nice to Have:
16. Region map adjustments (move NV to Southwest, consider DE/MD to Northeast)
17. Rarity-tiered negative prompts
18. Notable person verification against Wikipedia data
19. Variant art generation for Legendary tier
20. Acknowledgment of Flux.1 as future upgrade path

---

## Sources

- [Juggernaut XL - Civitai](https://civitai.com/models/133005/juggernaut-xl)
- [Juggernaut XL v13 Ragnarok Guide - RunDiffusion](https://learn.rundiffusion.com/juggernaut-xiii-ragnarok/)
- [RunDiffusion/Juggernaut-XL-v9 - Hugging Face](https://huggingface.co/RunDiffusion/Juggernaut-XL-v9)
- [ClassipeintXL v2.1 - Civitai](https://civitai.com/models/127139/classipeintxl-oil-paint-oil-painting-style)
- [SDXL Resolutions Guide - Shakker AI](https://wiki.shakker.ai/en/sdxl-resolutions)
- [SDXL Best Practices - Neurocanvas](https://neurocanvas.net/blog/sdxl-best-practices-guide/)
- [Best Resolution for SD 1.5 and SDXL](https://atlassc.net/2024/09/06/best-resolution-for-stable-diffusion-1-5-and-sdxl)
- [Qwen3-VL:8b - Ollama](https://ollama.com/library/qwen3-vl:8b)
- [Qwen3-VL GitHub](https://github.com/QwenLM/Qwen3-VL)
- [QwenVL vs LLaVA Comparison - Roboflow](https://roboflow.com/compare/qwenvl-vs-llava)
- [Qwen3:32b - Ollama](https://ollama.com/library/qwen3:32b)
- [Qwen3 Technical Report](https://qwenlm.github.io/blog/qwen3/)
- [Top 10 VLMs in 2026 - DataCamp](https://www.datacamp.com/blog/top-vision-language-models)
- [Top 20 Ollama Models 2026 - NeoWhisper](https://www.neowhisper.net/blog/ollama-model-ranking-top-20-2026-03-27)
- [Llama 4 Scout - Ollama](https://ollama.com/library/llama4:scout)
- [Llama 4 Multimodal - Meta AI](https://ai.meta.com/blog/llama-4-multimodal-intelligence/)
- [Gemma 3:27b - Ollama](https://ollama.com/library/gemma3:27b)
- [Gemma 3 - Google DeepMind](https://deepmind.google/models/gemma/gemma-3/)
- [Vision Models on Ollama](https://ollama.com/search?c=vision)
- [Flux vs SDXL 2026 Comparison](https://pxz.ai/blog/flux-vs-sdxl)
- [SDXL vs Flux1.dev - Stable Diffusion Art](https://stable-diffusion-art.com/sdxl-vs-flux/)
- [Sampler and Scheduler Reference - Civitai](https://civitai.com/articles/16231/sampler-and-scheduler-reference-for-hi-dream-flux-sdxl-illustrious-and-pony)
- [SDXL Lightning - Felix Sanz](https://www.felixsanz.dev/articles/sdxl-lightning-quick-look-and-comparison)
- [JuggernautXL Lightning - Hugging Face](https://huggingface.co/RunDiffusion/Juggernaut-XL-Lightning)
- [Negative Prompts Guide - Stable Diffusion Art](https://stable-diffusion-art.com/how-to-use-negative-prompts/)
- [SDXL Negative Prompts Guide - FreeAIPromptMaker](https://freeaipromptmaker.com/blog/2025-11-29-stable-diffusion-negative-prompts-guide)
- [GEOBench-VLM: Benchmarking VLMs for Geospatial Tasks - ICCV 2025](https://openaccess.thecvf.com/content/ICCV2025/papers/Danish_GEOBench-VLM_Benchmarking_Vision-Language_Models_for_Geospatial_Tasks_ICCV_2025_paper.pdf)
- [US Counties - Wikipedia](https://en.wikipedia.org/wiki/County_(United_States))
- [ESRI World Imagery - Esri](https://www.esri.com/arcgis-blog/products/3d-gis/3d-gis/world-imagery-basemap-updated-with-very-high-resolution-imagery-and-additional-scale-levels)
- [Denoising Strength Guide - Stable Diffusion Art](https://stable-diffusion-art.com/denoising-strength/)
- [ComfyUI Img2Img Examples](https://comfyanonymous.github.io/ComfyUI_examples/img2img/)
- [Marvel Snap Art Review - Seasoned Gaming](https://seasonedgaming.com/2022/10/19/review-marvel-snap-the-art-of-the-cards/)
- [Gemma 4 vs Qwen 3.5 vs Llama 4 Compared - ai.rs](https://ai.rs/ai-developer/gemma-4-vs-qwen-3-5-vs-llama-4-compared)
