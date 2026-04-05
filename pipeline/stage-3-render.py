"""
Stage 3: Render — Generate card art via ComfyUI.

Checkpoint: JuggernautXL Ragnarok v13
LoRAs: ClassipeintXL v2.1 (0.5) + Hyper-SDXL-8steps-CFG (0.6)
Sampler: dpmpp_2m_sde + karras
Resolution: 1152x896

Tiered rendering: rarity determines steps, CFG, and polish passes.
Resume-safe: skips existing PNGs (validates magic bytes + size >10KB).

Usage: python pipeline/stage-3-render.py
"""

import json
import os
import sys
import shutil
import time
import urllib.request
import urllib.parse
from pathlib import Path

COMFYUI_URL = "http://127.0.0.1:8188"

# Model files
CHECKPOINT = "juggernautXL_ragnarokBy.safetensors"
LORA_STYLE = "ClassipeintXL2.1.safetensors"
LORA_STYLE_WEIGHT = 0.5
LORA_SPEED = "Hyper-SDXL-8steps-CFG-lora.safetensors"
LORA_SPEED_WEIGHT = 0.6

# Generation settings
WIDTH = 1152
HEIGHT = 896
SAMPLER = "dpmpp_2m_sde"
SCHEDULER = "karras"

# Rarity tiers: steps, cfg, polish_passes, denoise_values
RARITY_TIERS = {
    "common":    {"steps": 8,  "cfg": 5.0, "polish": []},
    "uncommon":  {"steps": 8,  "cfg": 5.0, "polish": []},
    "rare":      {"steps": 12, "cfg": 6.0, "polish": [0.35]},
    "epic":      {"steps": 16, "cfg": 7.0, "polish": [0.30]},
    "legendary": {"steps": 16, "cfg": 8.0, "polish": [0.30, 0.20]},
}

# Paths
DESCRIPTIONS_FILE = Path("data/descriptions.json")
STATUS_FILE = Path("data/.status.json")
ART_DIR = Path("data/card-art")

# Region palettes and rarity moods (must match config.ts)
REGION_MAP = {
    "ME": "slate blue, autumn amber, harbor grey",
    "NH": "slate blue, autumn amber, harbor grey",
    "VT": "slate blue, autumn amber, harbor grey",
    "MA": "slate blue, autumn amber, harbor grey",
    "RI": "slate blue, autumn amber, harbor grey",
    "CT": "slate blue, autumn amber, harbor grey",
    "NY": "slate blue, autumn amber, harbor grey",
    "NJ": "slate blue, autumn amber, harbor grey",
    "PA": "slate blue, autumn amber, harbor grey",
    "DE": "warm gold, moss green, coral",
    "MD": "warm gold, moss green, coral",
    "NC": "warm gold, moss green, coral",
    "SC": "warm gold, moss green, coral",
    "GA": "warm gold, moss green, coral",
    "FL": "warm gold, moss green, coral",
    "DC": "warm gold, moss green, coral",
    "OH": "wheat gold, prairie green, storm grey",
    "IN": "wheat gold, prairie green, storm grey",
    "IL": "wheat gold, prairie green, storm grey",
    "MI": "wheat gold, prairie green, storm grey",
    "WI": "wheat gold, prairie green, storm grey",
    "MN": "wheat gold, prairie green, storm grey",
    "IA": "wheat gold, prairie green, storm grey",
    "MO": "wheat gold, prairie green, storm grey",
    "ND": "wheat gold, prairie green, storm grey",
    "SD": "wheat gold, prairie green, storm grey",
    "NE": "wheat gold, prairie green, storm grey",
    "KS": "wheat gold, prairie green, storm grey",
    "KY": "deep amber, rust red, bayou green",
    "TN": "deep amber, rust red, bayou green",
    "AL": "deep amber, rust red, bayou green",
    "MS": "deep amber, rust red, bayou green",
    "AR": "deep amber, rust red, bayou green",
    "LA": "deep amber, rust red, bayou green",
    "MT": "alpine white, granite blue, aspen gold",
    "ID": "alpine white, granite blue, aspen gold",
    "WY": "alpine white, granite blue, aspen gold",
    "CO": "alpine white, granite blue, aspen gold",
    "UT": "alpine white, granite blue, aspen gold",
    "WA": "emerald, Pacific blue, fog grey",
    "OR": "emerald, Pacific blue, fog grey",
    "CA": "emerald, Pacific blue, fog grey",
    "AK": "emerald, Pacific blue, fog grey",
    "HI": "emerald, Pacific blue, fog grey",
    "AZ": "terracotta, turquoise, sunset orange",
    "NM": "terracotta, turquoise, sunset orange",
    "NV": "terracotta, turquoise, sunset orange",
    "TX": "terracotta, turquoise, sunset orange",
    "OK": "terracotta, turquoise, sunset orange",
    "WV": "misty blue-green, forest deep green, morning fog",
    "VA": "misty blue-green, forest deep green, morning fog",
}

RARITY_MOODS = {
    "common": "soft daylight, clean, simple, peaceful, quiet",
    "uncommon": "warm afternoon, moderate detail, inviting, pleasant",
    "rare": "golden hour, rich texture, atmospheric, beautiful",
    "epic": "dramatic sunset, lush, cinematic, awe-inspiring",
    "legendary": "god rays, hyper-detailed, luminous, transcendent, mythic",
}

NEGATIVE_PROMPT = (
    "text, words, letters, watermark, signature, people, faces, "
    "blurry, low quality, oversaturated, cartoon, anime"
)


def build_prompt(description, state_abbr, rarity):
    palette = REGION_MAP.get(state_abbr, "natural light, atmospheric perspective")
    mood = RARITY_MOODS.get(rarity, RARITY_MOODS["common"])
    return f"{palette}, {mood}, {description}, landscape painting, no text, no people, no signs, masterpiece quality"


def build_workflow(prompt, negative, seed, steps, cfg, denoise=1.0, input_image=None):
    """Build ComfyUI API workflow with dual LoRAs."""
    nodes = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CHECKPOINT}},
        # LoRA 1: Style (ClassipeintXL)
        "2": {"class_type": "LoraLoader", "inputs": {
            "model": ["1", 0], "clip": ["1", 1],
            "lora_name": LORA_STYLE, "strength_model": LORA_STYLE_WEIGHT, "strength_clip": LORA_STYLE_WEIGHT,
        }},
        # LoRA 2: Speed (Hyper-SDXL-CFG)
        "3": {"class_type": "LoraLoader", "inputs": {
            "model": ["2", 0], "clip": ["2", 1],
            "lora_name": LORA_SPEED, "strength_model": LORA_SPEED_WEIGHT, "strength_clip": LORA_SPEED_WEIGHT,
        }},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["3", 1]}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"text": negative, "clip": ["3", 1]}},
    }

    if input_image:
        # img2img for polish pass
        nodes["6"] = {"class_type": "LoadImage", "inputs": {"image": input_image}}
        nodes["7"] = {"class_type": "ImageScale", "inputs": {
            "image": ["6", 0], "width": WIDTH, "height": HEIGHT,
            "upscale_method": "lanczos", "crop": "center",
        }}
        nodes["8"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["7", 0], "vae": ["1", 2]}}
        latent_out = ["8", 0]
    else:
        # txt2img
        nodes["6"] = {"class_type": "EmptyLatentImage", "inputs": {"width": WIDTH, "height": HEIGHT, "batch_size": 1}}
        latent_out = ["6", 0]

    nodes["9"] = {"class_type": "KSampler", "inputs": {
        "model": ["3", 0], "positive": ["4", 0], "negative": ["5", 0],
        "latent_image": latent_out, "seed": seed,
        "steps": steps, "cfg": cfg, "sampler_name": SAMPLER,
        "scheduler": SCHEDULER, "denoise": denoise,
    }}
    nodes["10"] = {"class_type": "VAEDecode", "inputs": {"samples": ["9", 0], "vae": ["1", 2]}}
    nodes["11"] = {"class_type": "SaveImage", "inputs": {"images": ["10", 0], "filename_prefix": "county_art"}}

    return nodes


def queue_prompt(workflow):
    try:
        req = urllib.request.Request(
            f"{COMFYUI_URL}/prompt",
            data=json.dumps({"prompt": workflow}).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read()).get("prompt_id")
    except Exception as e:
        print(f"  Queue error: {e}")
        return None


def wait_for_completion(prompt_id, timeout=300):
    start = time.time()
    while time.time() - start < timeout:
        try:
            with urllib.request.urlopen(f"{COMFYUI_URL}/history/{prompt_id}") as resp:
                history = json.loads(resp.read())
                if prompt_id in history:
                    return history[prompt_id]
        except:
            pass
        time.sleep(0.5)
    return None


def get_output_image(history):
    try:
        for node_output in history.get("outputs", {}).values():
            if "images" in node_output:
                return node_output["images"][0].get("filename")
    except:
        pass
    return None


def download_output(filename, save_path):
    try:
        url = f"{COMFYUI_URL}/view?filename={urllib.parse.quote(filename)}&type=output"
        with urllib.request.urlopen(url) as resp:
            data = resp.read()
        tmp = save_path + ".tmp"
        with open(tmp, "wb") as f:
            f.write(data)
        shutil.move(tmp, save_path)
        return True
    except Exception as e:
        try:
            os.remove(save_path + ".tmp")
        except:
            pass
        print(f"  Download error: {e}")
        return False


def upload_image(image_path):
    """Upload an image to ComfyUI's input directory for img2img."""
    filename = os.path.basename(image_path)
    with open(image_path, "rb") as f:
        data = f.read()
    boundary = "----FormBoundary" + str(int(time.time() * 1000))
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="image"; filename="{filename}"\r\n'
        f"Content-Type: image/png\r\n\r\n"
    ).encode() + data + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        f"{COMFYUI_URL}/upload/image", data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read()).get("name")
    except:
        return None


def is_valid_png(path):
    """Check PNG magic bytes and minimum file size."""
    try:
        with open(path, "rb") as f:
            header = f.read(4)
        return header == b"\x89PNG" and os.path.getsize(path) > 10240
    except:
        return False


def update_status(rendered, total):
    try:
        status = json.load(open(STATUS_FILE)) if STATUS_FILE.exists() else {}
    except:
        status = {}
    status["stage3"] = {
        "complete": rendered >= total,
        "rendered": rendered,
        "total": total,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    with open(STATUS_FILE, "w") as f:
        json.dump(status, f, indent=2)


COMFYUI_CHECKPOINTS_DIR = Path(os.environ.get("COMFYUI_CHECKPOINTS", "A:/ComfyUI_Fresh/models/checkpoints"))
COMFYUI_LORAS_DIR = Path(os.environ.get("COMFYUI_LORAS", "A:/ComfyUI_Fresh/models/loras"))


def preflight():
    """Verify all dependencies before starting."""
    errors = []

    # ComfyUI
    try:
        urllib.request.urlopen(f"{COMFYUI_URL}/system_stats")
    except:
        errors.append("ComfyUI not running at " + COMFYUI_URL)

    # Descriptions
    if not DESCRIPTIONS_FILE.exists():
        errors.append(f"{DESCRIPTIONS_FILE} not found. Run Stage 2 first.")

    # Checkpoint
    ckpt_path = COMFYUI_CHECKPOINTS_DIR / CHECKPOINT
    if not ckpt_path.exists():
        errors.append(f"Checkpoint not found: {ckpt_path}")

    # LoRAs
    for lora in [LORA_STYLE, LORA_SPEED]:
        lora_path = COMFYUI_LORAS_DIR / lora
        if not lora_path.exists():
            errors.append(f"LoRA not found: {lora_path}")

    if errors:
        for e in errors:
            print(f"[FAIL] {e}")
        return False

    print("[OK] ComfyUI running")
    print(f"[OK] {DESCRIPTIONS_FILE} found")
    print(f"[OK] Checkpoint {CHECKPOINT} found")
    print(f"[OK] LoRA {LORA_STYLE} found")
    print(f"[OK] LoRA {LORA_SPEED} found")
    return True


def main():
    print("=== Stage 3: Render ===\n")

    if not preflight():
        sys.exit(1)

    # Load descriptions + rarity data
    descriptions = json.load(open(DESCRIPTIONS_FILE))
    print(f"Descriptions loaded: {len(descriptions)}")

    # Load rarity data from CSV or descriptions keys
    # We need state_abbr + rarity for each FIPS. Read from a supplementary file.
    # The simplest approach: load from Supabase via a pre-exported JSON.
    # For the Python script, we'll read a cards-meta.json that stage-2 can also write.
    # OR: we can read the CSV export if it exists.
    # Simplest: read directly from the descriptions and a separate meta file.

    # Load card metadata (fips -> {state_abbr, rarity})
    META_FILE = Path("data/cards-meta.json")
    if not META_FILE.exists():
        print(f"ERROR: {META_FILE} not found. Run Stage 2 first.")
        sys.exit(1)

    cards_meta = json.load(open(META_FILE))
    print(f"Card metadata loaded: {len(cards_meta)} entries")

    ART_DIR.mkdir(parents=True, exist_ok=True)

    # Filter to counties that need rendering
    todo = []
    skip = 0
    for fips, desc in descriptions.items():
        art_path = ART_DIR / f"{fips}.png"
        if art_path.exists() and is_valid_png(str(art_path)):
            skip += 1
            continue
        meta = cards_meta.get(fips, {})
        todo.append({
            "fips": fips,
            "description": desc,
            "state_abbr": meta.get("state_abbr", ""),
            "rarity": meta.get("rarity", "common"),
        })

    total = skip + len(todo)
    print(f"\nSkipped (existing): {skip} | To render: {len(todo)} | Total: {total}\n")

    if not todo:
        update_status(total, total)
        print("All done!")
        return

    gen = 0
    fail = 0
    t0 = time.time()

    for i, card in enumerate(todo):
        fips = card["fips"]
        rarity = card["rarity"]
        tier = RARITY_TIERS.get(rarity, RARITY_TIERS["common"])
        art_path = ART_DIR / f"{fips}.png"

        prompt = build_prompt(card["description"], card["state_abbr"], rarity)
        seed = hash(f"{fips}-v2") % (2**32)

        # Base generation (txt2img)
        pid = queue_prompt(build_workflow(prompt, NEGATIVE_PROMPT, seed, tier["steps"], tier["cfg"]))
        if not pid:
            fail += 1
            continue

        hist = wait_for_completion(pid)
        if not hist:
            fail += 1
            if fail <= 10:
                print(f"  Timeout: {fips}")
            continue

        fn = get_output_image(hist)
        if not fn or not download_output(fn, str(art_path)):
            fail += 1
            continue

        # Polish passes (img2img on own output)
        for denoise in tier["polish"]:
            uploaded = upload_image(str(art_path))
            if not uploaded:
                break
            pid = queue_prompt(build_workflow(prompt, NEGATIVE_PROMPT, seed + 1, tier["steps"], tier["cfg"], denoise, uploaded))
            if not pid:
                break
            hist = wait_for_completion(pid)
            if not hist:
                break
            fn = get_output_image(hist)
            if fn:
                download_output(fn, str(art_path))

        gen += 1

        if (i + 1) % 25 == 0 or i < 5:
            elapsed = time.time() - t0
            rate = gen / max(elapsed, 1)
            eta = (len(todo) - (i + 1)) / max(rate, 0.01) / 60
            print(f"  [{i+1}/{len(todo)}] {fips} ({rarity}) | {rate:.2f}/s ETA {eta:.0f}m")

        # Update status periodically
        if (i + 1) % 50 == 0:
            update_status(skip + gen, total)

    update_status(skip + gen, total)

    elapsed = (time.time() - t0) / 60
    print(f"\n=== Stage 3 Complete in {elapsed:.1f} min ===")
    print(f"Generated: {gen} | Failed: {fail} | Total: {skip + gen}")


if __name__ == "__main__":
    main()
