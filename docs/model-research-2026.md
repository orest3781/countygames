# Image Generation Model Research for County Wars Card Art Pipeline

**Date:** April 4, 2026  
**Scope:** Best models for batch-generating ~3,144 landscape paintings across 5 rarity tiers and 7 US geographic regions via ComfyUI  
**Hardware baseline:** RTX 3080 (10GB VRAM) or better

---

## Executive Summary

1. **Your current JuggernautXL + Hyper-SDXL-4steps-lora setup is already a strong choice** for the SDXL tier of this pipeline. JuggernautXL remains one of the top 3 SDXL checkpoints in 2026, with 828K+ downloads on CivitAI. The Hyper-SD LoRA approach is superior to SDXL Lightning or LCM for speed/quality balance.

2. **Flux.1 Dev (FP8 or Q5 GGUF) is the clear upgrade path for Epic/Legendary cards.** It produces noticeably better photorealistic landscapes than any SDXL checkpoint, with superior prompt adherence. On a 10GB card it requires GGUF quantization (Q5_K_S recommended), which retains ~90% quality. Flux.2 Dev (32B params, released Nov 2025) is even better but likely too heavy for 10GB VRAM.

3. **Do NOT use different models for different quality tiers.** Use ONE model (JuggernautXL) with varying step counts, CFG, and prompt richness. Your existing multi-pass pipeline architecture already handles quality differentiation better than model-switching would.

4. **SD3.5 is not recommended for this project.** The community ecosystem (LoRAs, fine-tunes) is thin compared to SDXL, landscape quality is not meaningfully better than JuggernautXL, and the licensing adds unnecessary complexity.

5. **Your 512x384 generation resolution is too low.** Move to 1024x768 (same 4:3 aspect ratio) for your base generation pass. SDXL was trained at 1024x1024 and produces significantly better results near that pixel count (~786K pixels vs your current ~197K pixels). This will roughly 4x your generation time per image but the quality difference is dramatic.

---

## 1. SDXL Checkpoints for Landscape Art

### The Tier List (for landscape/nature specifically)

| Rank | Model | Strengths | Weaknesses | Your Use Case |
|------|-------|-----------|------------|---------------|
| 1 | **JuggernautXL v9 (Ragnarok)** | Best all-rounder. Dramatic lighting, strong landscapes, painterly quality. 828K+ downloads. | Slightly biased toward dramatic/cinematic looks | **PRIMARY -- keep using this** |
| 2 | **RealVisXL V5** | Best photorealism. Exceptional lighting physics | Less artistic/painterly than Juggernaut | Good for photo-preset polish passes |
| 3 | **Landscape Realistic Pro** | Purpose-built for landscapes | Narrow -- only landscapes | Worth testing as an alternative |
| 4 | **DreamShaper XL** | Best stylized/illustrated look. Great for fantasy | Less realistic than Juggernaut | Your "illustrated" pipeline preset is solid |
| 5 | **SDXL Base 1.0** | Neutral baseline, great LoRA compatibility | Bland without fine-tuning | Only useful as LoRA base |

### Models NOT Recommended for This Project

- **Pony Diffusion V6/V7**: Anime/illustration-focused. The V7 release improves prompt handling but the aesthetic is wrong for realistic US county landscapes. Skip it.
- **Illustrious XL**: Anime-focused SDXL derivative. Beautiful for character art, wrong for landscapes.
- **EpicRealism / RealisticVision**: These are SD 1.5 models (512px native). You already have them in your polish-art.py presets. They work for img2img polish but should NOT be used for primary txt2img -- the resolution disadvantage vs SDXL is too large.

### Verdict

**Keep JuggernautXL Ragnarok as your primary checkpoint.** It is the consensus best SDXL model for diverse, high-quality generation and specifically excels at the dramatic landscape style your card game needs. No other SDXL checkpoint offers a meaningful upgrade for your use case.

---

## 2. Flux Models

### Available Variants (as of April 2026)

| Model | Params | License | Local Viable? | Quality | Speed |
|-------|--------|---------|---------------|---------|-------|
| **Flux.1 Schnell** | 12B | Apache 2.0 | Yes (FP8: ~12GB) | Good | Fast (4 steps) |
| **Flux.1 Dev** | 12B | Non-commercial | Yes (FP8: ~12GB, GGUF Q5: ~8GB) | Excellent | Moderate (20-30 steps) |
| **Flux.2 Dev** | 32B | Open-weight | Marginal (needs 16GB+ even quantized) | Best available | Slow |
| **Flux.2 Klein 4B** | 4B | Apache 2.0 | Yes (fits 8GB easily) | Good for size | Very fast (<1s) |
| **Flux.1 Pro / Flux.2 Pro** | -- | API only | No local | Best | API cost |

### Flux vs SDXL for Landscapes

Flux produces noticeably better photorealistic landscapes than SDXL [Stable Diffusion Art, 2025]. Mountains, skies, and natural lighting render more convincingly. Prompt adherence is dramatically better -- Flux actually follows complex multi-element prompts instead of cherry-picking keywords.

**However, for your specific pipeline:**

- Flux.1 Dev on a 10GB RTX 3080 requires GGUF Q5_K_S quantization (~8GB VRAM). Quality is ~90% of full precision -- still better than SDXL for photorealism, but the margin narrows.
- Flux is 4x slower than SDXL per image on equivalent hardware [Stable Diffusion Art, 2025]. For 3,144 images, this means ~16 hours vs ~4 hours for the base generation pass.
- Flux's LoRA ecosystem is growing but not yet as rich as SDXL's. Your state-specific style customization via LoRAs would be harder with Flux.
- Flux does NOT use negative prompts in the same way as SDXL. Your existing prompt engineering (with detailed negatives) works better with SDXL architecture.

### VRAM Reality on RTX 3080 (10GB)

| Format | VRAM Usage | Quality vs BF16 | Feasible? |
|--------|-----------|-----------------|-----------|
| BF16 (full) | ~24GB | 100% | No |
| FP8 | ~12GB | ~99% | No (10GB) |
| GGUF Q8 | ~10-11GB | ~98% | Tight, may OOM |
| GGUF Q5_K_S | ~7-8GB | ~90% | Yes |
| GGUF Q4_K_S | ~6-7GB | ~80% | Yes, quality loss |

### Flux Recommendation

**Use Flux.1 Schnell (FP8 or Q5 GGUF) as an OPTIONAL final polish pass for Epic/Legendary cards only.** Do not replace your entire pipeline with Flux. The speed penalty and VRAM constraints make it impractical for all 3,144 images, but running 186 Legendary + Epic cards through a Flux refinement pass is very feasible (~45 minutes).

If you upgrade to a 16GB+ GPU (RTX 4080, 4090, or 5080), Flux.1 Dev FP8 becomes the no-brainer primary model.

---

## 3. SD3.5 / SD3 Models

### Availability

SD3.5 has been fully supported in ComfyUI since October 2024. Three variants exist:

- **SD3.5 Large** (8B params): Best quality, ~12GB VRAM in FP16
- **SD3.5 Large Turbo**: Faster distilled version
- **SD3.5 Medium** (2.6B params): Fits smaller GPUs, reduced quality

### Quality for Landscapes

SD3.5 Large produces good landscapes but does NOT meaningfully outperform JuggernautXL for this specific task. Where SD3.5 excels is text rendering within images and complex semantic prompt following -- neither of which matters for your landscape card art.

### Licensing

SD3.5 uses the **Stability AI Community License**:
- **Free** for individuals and organizations with <$1M annual revenue
- **$20/month Professional** or Enterprise license above that threshold
- Must register at stability.ai/community-license for commercial use
- Updated Acceptable Use Policy (July 2025) added content restrictions

### Verdict

**Skip SD3.5 for this project.** The licensing registration adds friction, the community ecosystem (LoRAs, fine-tunes) is anemic compared to SDXL, and the quality delta for landscapes does not justify the switch. Your JuggernautXL setup already produces better stylized landscape art than stock SD3.5.

---

## 4. Quality Tiers: One Model vs Multiple Models

### Your Current Approach (from auto-pipeline.py)

Your pipeline already has the right architecture:
1. JuggernautXL txt2img base generation (all cards)
2. Multi-model img2img polish passes (DreamShaper, EpicRealism, etc.)
3. Varying denoise strengths per pass

### The Question: Different Models for Different Rarities?

**No. Use one primary model and differentiate via prompt engineering, steps, and polish passes.**

Here is why:

**Against multi-model-per-tier:**
- Model loading/switching is expensive (10-30 seconds per model swap). With 3,144 images across 5 tiers, you would be constantly swapping.
- Visual consistency within a card game matters. Players should feel like all cards came from the same "world." Different base models produce subtly different aesthetic DNA.
- Harder to debug and tune. One model with good prompts is easier to iterate than 3 models with mediocre prompts.

**For single-model with differentiated quality:**

| Rarity | Cards | Steps | CFG | Polish Passes | Prompt Richness |
|--------|-------|-------|-----|---------------|-----------------|
| Common | 1,257 | 6 | 2.0 | 0 (base only) | Standard state style |
| Uncommon | 943 | 8 | 2.0 | 1 pass (denoise 0.3) | + subtle detail keywords |
| Rare | 628 | 8 | 2.0 | 2 passes (0.35, 0.25) | + atmospheric keywords |
| Epic | 220 | 12 | 2.5 | 3 passes (0.40, 0.30, 0.20) | + masterpiece keywords |
| Legendary | 96 | 20 | 3.0 | 4 passes + manual review | + award-winning, museum quality |

This approach:
- Generates Common cards 3x faster (6 steps, no polish)
- Legendary cards get 4+ passes for maximum quality
- All cards share the same aesthetic DNA (JuggernautXL base)
- Total pipeline time is weighted toward the bulk (Common/Uncommon = 70% of cards, fast) with premium time on the tail (Legendary = 3% of cards, slow)

### Estimated Time Budget (RTX 3080, 1024x768)

| Tier | Cards | Time/Card | Total |
|------|-------|-----------|-------|
| Common | 1,257 | ~3s | ~1.0 hr |
| Uncommon | 943 | ~8s | ~2.1 hr |
| Rare | 628 | ~18s | ~3.1 hr |
| Epic | 220 | ~35s | ~2.1 hr |
| Legendary | 96 | ~90s | ~2.4 hr |
| **TOTAL** | **3,144** | -- | **~10.7 hr** |

---

## 5. Speed vs Quality Tradeoffs

### Resolution

**Your current 512x384 must be upgraded to 1024x768.**

SDXL was trained on 1024x1024 (1 megapixel). Your current 512x384 = 196,608 pixels, which is only 19% of the training resolution. This causes:
- Blurry, underdetailed output
- Compositional weirdness (SDXL "expects" more detail than fits in 196K pixels)
- The artifacts your fix-art.py is detecting (borders, uniformity) are partly caused by generating far below native resolution

Recommended SDXL landscape resolutions (all ~1 megapixel):
- **1024x768** (4:3) -- matches your current aspect ratio, best for card frames
- 1152x896 (9:7) -- slightly wider
- 1216x832 (3:2) -- classic landscape format
- 1344x768 (16:9) -- cinematic wide

**Use 1024x768.** It matches your card frame aspect ratio and stays within SDXL's sweet spot.

### Steps vs Quality Curve

With Hyper-SDXL-4steps-lora (your current setup):

| Steps | Quality | Speed (1024x768, RTX 3080) | Notes |
|-------|---------|---------------------------|-------|
| 4 | Usable draft | ~1.5s | Minimum viable |
| 6 | Good (commons) | ~2.0s | Sweet spot for bulk |
| 8 | Very good | ~2.8s | Current setting; good default |
| 12 | Excellent | ~4.0s | Diminishing returns start here |
| 20 | Near-maximum | ~6.5s | Only for Legendary |
| 30+ | Negligible improvement | ~10s+ | Waste of time |

Without Hyper-SD LoRA (standard SDXL sampling):

| Steps | Quality | Notes |
|-------|---------|-------|
| 15 | Minimum usable | |
| 20-25 | Good | Standard sweet spot |
| 30 | Excellent | |
| 40+ | Diminishing returns | |

**Keep using the Hyper-SDXL-4steps-lora.** It is the best distillation approach for SDXL as of early 2026, outperforming LCM-LoRA and competitive with Lightning while being compatible with ANY checkpoint (Lightning requires its own fine-tuned models).

### Turbo/Lightning for Common Cards?

**SDXL Lightning 4-step is "good enough" for Common cards but Hyper-SD is better.**

The comparison hierarchy for fast SDXL generation:
1. **Hyper-SDXL LoRA** (best) -- your current choice. Works with JuggernautXL. 4-8 steps.
2. **SDXL Lightning LoRA** -- comparable quality, slightly inferior detail. 2-4 steps.
3. **SDXL Turbo** -- separate model, 1-step capable but quality is noticeably worse. Not recommended.
4. **LCM-LoRA** -- needs 8+ steps to look decent, defeating the purpose.

Since you already have Hyper-SD in your pipeline, there is no reason to switch to Lightning or Turbo for common cards. Just reduce steps from 8 to 6 for commons.

---

## 6. LoRA Options for Landscape Art

### Must-Have (already using)

- **Hyper-SDXL-4steps-lora** -- speed LoRA, essential for batch work

### Highly Recommended Additions

| LoRA | Use Case | Strength | Source |
|------|----------|----------|--------|
| **ClassipeintXL v2.1** | Oil painting style for all cards | 0.3-0.5 | CivitAI 127139 |
| **Nature Landscapes SDXL** | Enhance landscape composition | 0.3-0.5 | CivitAI 524045 |

**ClassipeintXL** is the standout. It is described as "the most consistent and versatile LoRA for generating images with SDXL that capture the feel of genuine oil paintings." At strength 0.3-0.5, it adds painterly texture without overwhelming the base checkpoint's composition. This would give your cards a consistent "oil painting" feel that works well for a collectible card game aesthetic.

### Worth Testing (style-specific)

| LoRA | Style | When to Use |
|------|-------|-------------|
| Eldritch Impressionism | Dreamy, impressionist landscapes | Fog/mist-heavy regions (Pacific NW, Appalachia) |
| Unfazed Oil Painting LoRAs | Various oil styles | Alternative to ClassipeintXL |
| Classic Oil Painting CE v3 | Traditional oil painting | If ClassipeintXL is too subtle |

### NOT Recommended

- **Pixel art LoRAs** -- Your pipeline has a "pixel" preset but pixel art card games are a different market. Drop it unless you specifically want that variant.
- **Anime/illustration LoRAs** -- Wrong aesthetic for county landscape realism.
- **Upscaler LoRAs** -- Use a dedicated upscaler model instead (4x-UltraSharp or similar) as a post-processing step.

### LoRA Stacking Strategy

The Hyper-SD LoRA does not conflict with style LoRAs. You can stack:
1. Hyper-SDXL-4steps-lora at 0.6 (speed)
2. ClassipeintXL at 0.3-0.4 (oil painting style)

Both connect to the same model/clip outputs. Your build_workflow in generate-art.py would need a second LoraLoader node chained after the first.

---

## 7. Newer Models (Late 2025 / Early 2026)

### Flux.2 Family (November 2025 - January 2026)

The biggest release since your pipeline was built:

- **Flux.2 Dev** (32B params): Dramatically better than Flux.1. Multi-reference conditioning (up to 10 images), 4-megapixel output, and native image editing. **Too large for 10GB VRAM even with GGUF quantization.**
- **Flux.2 Klein 4B**: Apache 2.0 licensed, fast (<1s generation), fits on consumer hardware. Quality is impressive for its size. **Worth testing as a Common card generator** -- it could handle the bulk 1,257 common cards at extreme speed, though the quality ceiling is lower than JuggernautXL.
- **Flux.2 Klein 9B**: Intermediate option. May fit 10GB VRAM with quantization.

### HunyuanImage 3.0 (September 2025)

Tencent's 80B parameter model. Technically impressive but completely impractical for local generation on consumer hardware. Skip.

### HiDream-I1 (April 2025)

17B parameter model with strong benchmark scores. Needs 16GB+ VRAM. Not yet widely adopted in the ComfyUI community -- thin LoRA ecosystem. Skip for now.

### Community Standard in 2026

The community has split into two camps:
1. **SDXL ecosystem** (JuggernautXL, RealVisXL, etc.) -- still the dominant choice for local generation due to speed, VRAM efficiency, and massive LoRA/fine-tune library
2. **Flux ecosystem** (Flux.1 Dev/Schnell, Flux.2) -- the quality leader, rapidly growing LoRA support, but needs more VRAM and is slower

For batch work on a 10GB card, **SDXL remains the practical choice**. Flux becomes the default when 16GB+ VRAM is available.

---

## Final Recommendation: The Pipeline I Would Build

For 3,144 county landscape card paintings, 5 rarity tiers, 7 US geographic regions, on an RTX 3080:

### Primary Model
**JuggernautXL v9 (Ragnarok)** -- exactly what you already have.

### Speed LoRA
**Hyper-SDXL-4steps-lora** at 0.6 -- exactly what you already have.

### Style LoRA (NEW)
**ClassipeintXL v2.1** at 0.3-0.4 -- adds consistent oil painting texture across all cards.

### Resolution (CHANGE)
**1024x768** (up from 512x384). This is the single biggest quality improvement available to you.

### Generation Strategy

```
PASS 1 -- Base Generation (JuggernautXL, all 3,144 cards)
  Common:    6 steps, CFG 2.0  (~2.0s/img)
  Uncommon:  8 steps, CFG 2.0  (~2.8s/img)
  Rare:      8 steps, CFG 2.0  (~2.8s/img)
  Epic:     12 steps, CFG 2.5  (~4.0s/img)
  Legendary: 20 steps, CFG 3.0 (~6.5s/img)
  Estimated: ~3.5 hours total

PASS 2 -- Polish (Rare+ only, 944 cards)
  JuggernautXL img2img, denoise 0.35
  Estimated: ~45 minutes

PASS 3 -- Premium Polish (Epic+ only, 316 cards)
  DreamShaper img2img, denoise 0.30 (artistic refinement)
  Estimated: ~15 minutes

PASS 4 -- Legendary Final (96 cards only)
  JuggernautXL img2img, denoise 0.20 (cohesion)
  Estimated: ~5 minutes

PASS 5 -- Fix artifacts (automated via fix-art.py)
  Center crop + artifact scan + regeneration
  Estimated: ~30 minutes

TOTAL: ~5-6 hours for all 3,144 cards
```

### What NOT to Change
- Do not switch to Flux as primary (VRAM/speed constraints)
- Do not switch to SD3.5 (ecosystem too thin)
- Do not use different base models per rarity tier
- Do not use SDXL Turbo (Hyper-SD is strictly better)

### What to Change
1. **Resolution: 512x384 --> 1024x768** (biggest single improvement)
2. **Add ClassipeintXL LoRA** for consistent painting style
3. **Differentiate steps by rarity** (6 for common, 20 for legendary)
4. **Skip polish passes for Common/Uncommon** (save time, quality is fine at 1024px)
5. **Remove SD 1.5 models from polish presets** (DreamShaper 8, EpicRealism, RealisticVision are all SD 1.5 -- they downscale your 1024px SDXL output. Use SDXL-native models for polish.)

### Future Upgrade Path
When you get a 16GB+ GPU:
- Switch primary model to **Flux.1 Dev** (FP8)
- Use **Flux.2 Klein 4B** for Common cards (sub-second generation)
- Use **Flux.1 Dev** 30 steps for Legendary cards
- Keep JuggernautXL as a style-transfer polish layer

---

## Bibliography

- [AIArty, 2025] "40+ Best Stable Diffusion Models (Free & Updated)" -- https://www.aiarty.com/stable-diffusion-guide/best-stable-diffusion-models.htm
- [AI Photo Generator, 2026] "15 Best Stable Diffusion Models in 2026" -- https://www.aiphotogenerator.net/blog/2026/02/best-stable-diffusion-models-2026
- [Apatero, 2025] "15 Best SDXL Models and Checkpoints 2025" -- https://apatero.com/blog/best-sdxl-models-checkpoints-2025
- [Apatero, 2026] "FLUX GGUF Quantization: Run FLUX on 8GB VRAM" -- https://apatero.com/blog/flux-gguf-quantization-8gb-vram-guide-2026
- [Apatero, 2026] "ComfyUI Batch Processing Guide 2026" -- https://apatero.com/blog/comfyui-batch-processing-workflow-automation-2026
- [Baseten, 2025] "Comparing few-step image generation models" -- https://www.baseten.co/blog/comparing-few-step-image-generation-models/
- [BentoML, 2026] "The Best Open-Source Image Generation Models in 2026" -- https://www.bentoml.com/blog/a-guide-to-open-source-image-generation-models
- [CivitAI Education] "Quickstart Guide to Flux.1" -- https://education.civitai.com/quickstart-guide-to-flux-1/
- [CivitAI Education] "Getting Started with Stable Diffusion 3.5" -- http://education.civitai.com/getting-started-with-stable-diffusion-3-5/
- [ComfyUI Wiki] "Flux.1 ComfyUI Guide" -- https://comfyui-wiki.com/en/tutorial/advanced/image/flux/flux-1-dev-t2i
- [ComfyUI Wiki, 2025] "Tencent Open Sources Hunyuan Image 3.0" -- https://comfyui-wiki.com/en/news/2025-09-27-tencent-open-source-hunyuan-image-3-0
- [ComfyUI Wiki, 2025] "HiDream-I1 Open Source Release" -- https://comfyui-wiki.com/en/news/2025-04-08-hidream-i1-open-source-release
- [GLM Images, 2026] "Flux vs SDXL: Complete Model Comparison 2026" -- https://www.glmimages.com/blog/flux-vs-sdxl-comparison-2026
- [HuggingFace] "city96/FLUX.1-dev-gguf discussions" -- https://huggingface.co/city96/FLUX.1-dev-gguf/discussions/15
- [HuggingFace] "stabilityai/stable-diffusion-3.5-large" -- https://huggingface.co/stabilityai/stable-diffusion-3.5-large
- [HuggingFace] "black-forest-labs/FLUX.2-dev" -- https://huggingface.co/black-forest-labs/FLUX.2-dev
- [Local AI Master, 2026] "How to Run FLUX Locally: ComfyUI Setup, VRAM Guide" -- https://localaimaster.com/blog/flux-local-image-generation
- [Pixazo, 2026] "Best Open-Source AI Image Generation Models in 2026" -- https://www.pixazo.ai/blog/top-open-source-image-generation-models
- [PXZ.AI, 2026] "Flux vs SDXL 2026: Quality, Speed & Hardware Compared" -- https://pxz.ai/blog/flux-vs-sdxl
- [PXZ.AI, 2026] "Flux Dev vs Schnell 2026: Speed, Quality & VRAM Compared" -- https://pxz.ai/blog/flux-dev-vs-schnell
- [Ropewalk AI, 2026] "FLUX.2 and the Future of AI Image Generation" -- https://ropewalk.ai/blog/flux-2-ai-image-generation-2026
- [Segmind, 2025] "Understanding SDXL Lightning" -- https://blog.segmind.com/sdxl-lightning/
- [Shakker AI] "SDXL Resolutions: Best Image Dimensions" -- https://wiki.shakker.ai/en/sdxl-resolutions
- [Stability AI] "Stability AI License" -- https://stability.ai/license
- [Stability AI] "Introducing Stable Diffusion 3.5" -- https://stability.ai/news/introducing-stable-diffusion-3-5
- [Stable Diffusion Art] "SDXL vs Flux1.dev models comparison" -- https://stable-diffusion-art.com/sdxl-vs-flux/
- [Stable Diffusion Art] "Hyper-SD and Hyper-SDXL fast models" -- https://stable-diffusion-art.com/hyper-sdxl/
- [VentureBeat, 2026] "Black Forest Labs launches Flux.2 klein" -- https://venturebeat.com/technology/black-forest-labs-launches-open-source-flux-2-klein-to-generate-ai-images-in
- [VRLA Tech, 2026] "Best Workstation for Stable Diffusion XL and ComfyUI in 2026" -- https://vrlatech.com/best-workstation-stable-diffusion-comfyui-2026/
