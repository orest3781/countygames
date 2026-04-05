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

import hashlib
import json
import os
import sys
import shutil
import time
import urllib.request
import urllib.parse
from pathlib import Path

COMFYUI_URL = "http://127.0.0.1:8188"

# Model files — JuggernautXL Ragnarok v13 alone, no LoRAs
CHECKPOINT = "juggernautXL_ragnarokBy.safetensors"

# Generation settings
WIDTH = 1152
HEIGHT = 896
SAMPLER = "dpmpp_2m_sde"
SCHEDULER = "karras"

# Rarity tiers: more steps + higher CFG = more detail/drama
RARITY_TIERS = {
    "common":    {"steps": 20, "cfg": 6.0, "polish": []},
    "uncommon":  {"steps": 25, "cfg": 7.0, "polish": []},
    "rare":      {"steps": 25, "cfg": 7.0, "polish": [0.35]},
    "epic":      {"steps": 30, "cfg": 7.5, "polish": [0.30]},
    "legendary": {"steps": 30, "cfg": 8.0, "polish": [0.30, 0.20]},
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
    "blurry, low quality, oversaturated, cartoon, anime, "
    "painting, brushstrokes, sketch, drawing, illustration"
)


def build_prompt(description, state_abbr, rarity):
    mood = RARITY_MOODS.get(rarity, RARITY_MOODS["common"])
    return f"{description}, {mood}, beautiful landscape, cinematic lighting, detailed, 8k, masterpiece"


def build_workflow(prompt, negative, seed, steps, cfg, denoise=1.0, input_image=None):
    """Build ComfyUI API workflow — pure JuggernautXL, no LoRAs."""
    nodes = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CHECKPOINT}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["1", 1]}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"text": negative, "clip": ["1", 1]}},
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
        "model": ["1", 0], "positive": ["4", 0], "negative": ["5", 0],
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
        if STATUS_FILE.exists():
            with open(STATUS_FILE) as f:
                status = json.load(f)
        else:
            status = {}
    except:
        status = {}
    status["stage3"] = {
        "complete": rendered >= total and (total == 0 or (total - rendered) / total < 0.05),
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

    if errors:
        for e in errors:
            print(f"[FAIL] {e}")
        return False

    print("[OK] ComfyUI running")
    print(f"[OK] {DESCRIPTIONS_FILE} found")
    print(f"[OK] Checkpoint {CHECKPOINT} found")
    return True


def load_descriptions():
    """Load descriptions.json, returning dict. Safe to call repeatedly."""
    if not DESCRIPTIONS_FILE.exists():
        return {}
    with open(DESCRIPTIONS_FILE) as f:
        return json.load(f)


def load_cards_meta():
    """Load cards-meta.json, returning dict. Safe to call repeatedly."""
    meta_file = Path("data/cards-meta.json")
    if not meta_file.exists():
        return {}
    with open(meta_file) as f:
        return json.load(f)


def get_todo(descriptions, cards_meta):
    """Build list of counties that need rendering."""
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
    return todo, skip


def main():
    print("=== Stage 3: Render ===\n")

    if not preflight():
        sys.exit(1)

    # Check for --follow flag: poll for new descriptions instead of one-shot
    follow_mode = "--follow" in sys.argv
    if follow_mode:
        print("Follow mode: will poll for new descriptions every 30s\n")

    ART_DIR.mkdir(parents=True, exist_ok=True)

    # Load initial data
    descriptions = load_descriptions()
    cards_meta = load_cards_meta()

    if not descriptions:
        if follow_mode:
            print("No descriptions yet. Waiting for Stage 2 to produce data...")
        else:
            print("ERROR: data/descriptions.json not found or empty. Run Stage 2 first.")
            sys.exit(1)

    if not cards_meta:
        if follow_mode:
            print("No cards-meta.json yet. Waiting for Stage 2...")
        else:
            print("ERROR: data/cards-meta.json not found. Run Stage 2 first.")
            sys.exit(1)

    print(f"Descriptions loaded: {len(descriptions)}")
    print(f"Card metadata loaded: {len(cards_meta)} entries")

    todo, skip = get_todo(descriptions, cards_meta)
    total = skip + len(todo)
    print(f"\nSkipped (existing): {skip} | To render: {len(todo)} | Total: {total}\n")

    if not todo and not follow_mode:
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
        seed = int(hashlib.md5(f"{fips}-v2".encode()).hexdigest(), 16) % (2**32)

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
        expected_polish = len(tier["polish"])
        completed_polish = 0
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
            if fn and download_output(fn, str(art_path)):
                completed_polish += 1

        if expected_polish > 0 and completed_polish < expected_polish:
            print(f"  [warn] {fips}: only {completed_polish}/{expected_polish} polish passes completed")

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

    # Follow mode: poll for new descriptions and render them
    if follow_mode:
        poll_interval = 30
        stale_rounds = 0
        while stale_rounds < 10:  # stop after 5 min of no new work
            time.sleep(poll_interval)
            new_desc = load_descriptions()
            new_meta = load_cards_meta()
            new_todo, new_skip = get_todo(new_desc, new_meta)
            if not new_todo:
                stale_rounds += 1
                total_now = new_skip + gen
                update_status(total_now, total_now)
                print(f"  [follow] No new work. Waiting... ({stale_rounds}/10 before exit)")
                continue
            stale_rounds = 0
            print(f"\n  [follow] Found {len(new_todo)} new descriptions to render\n")
            for i, card in enumerate(new_todo):
                fips = card["fips"]
                rarity = card["rarity"]
                tier = RARITY_TIERS.get(rarity, RARITY_TIERS["common"])
                art_path = ART_DIR / f"{fips}.png"
                prompt = build_prompt(card["description"], card["state_abbr"], rarity)
                seed = int(hashlib.md5(f"{fips}-v2".encode()).hexdigest(), 16) % (2**32)
                pid = queue_prompt(build_workflow(prompt, NEGATIVE_PROMPT, seed, tier["steps"], tier["cfg"]))
                if not pid:
                    fail += 1
                    continue
                hist = wait_for_completion(pid)
                if not hist:
                    fail += 1
                    continue
                fn = get_output_image(hist)
                if not fn or not download_output(fn, str(art_path)):
                    fail += 1
                    continue
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
                if (i + 1) % 10 == 0 or i < 3:
                    print(f"  [{i+1}/{len(new_todo)}] {fips} ({rarity})")
                if (i + 1) % 50 == 0:
                    update_status(new_skip + gen, new_skip + gen + len(new_todo) - (i + 1))
        print(f"\n  [follow] No new work for 5 min. Exiting follow mode.")

    elapsed = (time.time() - t0) / 60
    print(f"\n=== Stage 3 Complete in {elapsed:.1f} min ===")
    print(f"Generated: {gen} | Failed: {fail} | Total: {skip + gen}")

    if fail > 0 and len(todo) > 0 and fail / len(todo) >= 0.05:
        print(f"\nERROR: {fail / len(todo) * 100:.1f}% failure rate.")
        sys.exit(1)


if __name__ == "__main__":
    main()
