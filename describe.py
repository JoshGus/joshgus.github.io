#!/usr/bin/env python3
"""
describe.py - auto-title photos using a local vision model via Ollama.

Setup:
  brew install ollama
  ollama serve                   # keep running in a separate terminal
  ollama pull llava:7b           # recommended — 4.7 GB, good quality
  ollama pull moondream          # alternative — 1.6 GB, faster but simpler descriptions
  pip install ollama python-dotenv

Usage:
  python3 describe.py                    # describe all UUID-titled photos
  python3 describe.py --limit 10         # test on first 10 first
  python3 describe.py --model moondream  # use a different model
  python3 describe.py --all              # re-describe everything

Writes back to photos.json after every 10 photos — safe to interrupt and resume.
"""

import os, json, re, time, argparse
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

try:
    import ollama
except ImportError:
    print("Run: pip install ollama")
    raise SystemExit(1)

# ---- config ------------------------------------------------------------------
PHOTOS_DIR  = Path("photos-original")
DEFAULT_MODEL   = "llava:7b"    # stage-1 general description
BIRD_ID_MODEL   = "llava:7b"    # stage-2 specialist bird identification
IMG_EXTS        = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}

# ---- stage-1: general description -------------------------------------------
PROMPT = """Describe this specific photo. Return a JSON object with these fields:
- "title": unique 3-6 word title in Title Case describing what is actually in THIS image
- "animal": common name of the main animal visible, or empty string
- "species": specific species name if identifiable, else empty string
- "species_confidence": integer 0-100, your confidence in the species ID (0 if no species)
- "category": one of birds, insects, landscape, macro, other
- "season": one of spring, summer, fall, winter, or empty string
- "location_hint": brief habitat description, or empty string"""

# ---- stage-2: specialist bird identification --------------------------------
BIRD_PROMPT = """You are an expert ornithologist. Study this bird photo carefully and return ONLY a JSON object — no markdown, no explanation.

Fields:
- species: exact common name (e.g. "Cedar Waxwing") or "" if unidentifiable
- scientific: Latin binomial (e.g. "Bombycilla cedrorum") or ""
- confidence: integer 0-100, your certainty in the species identification
- field_marks: list of 2-4 key visible features that led to this ID (e.g. ["yellow tail tip", "silky crest", "black mask"])
- age_sex: one of "adult male" | "adult female" | "juvenile" | "immature" | "unknown"
- behavior: brief observable behavior (e.g. "perched", "foraging", "in flight") or ""

If you cannot see a bird or cannot determine the species, set confidence to 0 and species/scientific to "".
Example: {"species":"Cedar Waxwing","scientific":"Bombycilla cedrorum","confidence":91,"field_marks":["silky crest","yellow tail tip","black mask"],"age_sex":"adult male","behavior":"perched"}"""

# ---- helpers -----------------------------------------------------------------
UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}[-_][0-9a-fA-F]{4}|"
    r"^img_\d+$|"
    r"^dsc[_\-]\d+$|"
    r"^[0-9a-fA-F]{20,}",
    re.IGNORECASE,
)

def looks_like_uuid(title: str) -> bool:
    return bool(UUID_RE.match(title.replace(" ", "-")))

def find_local_file(record: dict) -> Path | None:
    cid = record.get("id", "")
    rel = re.sub(r"^[^/]+/", "", cid)   # strip "portfolio/" prefix
    for ext in IMG_EXTS:
        p = PHOTOS_DIR / (rel + ext)
        if p.exists():
            return p
    p = PHOTOS_DIR / rel
    if p.exists():
        return p
    return None

def resize_for_model(img_path: Path) -> Path:
    """Resize image to max 768px on longest side before sending to model."""
    from PIL import Image
    import tempfile, os
    img = Image.open(img_path).convert("RGB")
    w, h = img.size
    max_side = 768
    if max(w, h) > max_side:
        scale = max_side / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    img.save(tmp.name, "JPEG", quality=85)
    return Path(tmp.name)

def extract_json(raw: str) -> dict:
    """
    Pull the first {...} block from an LLM response and parse it.
    Handles markdown fences, surrounding prose, and invalid escape sequences
    that models commonly emit (e.g. \\s, \\f in field values).
    Returns {} if no valid JSON is found.
    """
    text = raw.strip()
    # Strip markdown code fences
    if text.startswith("```"):
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    # Extract first {...} block (handles surrounding prose)
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return {}
    text = m.group(0)
    # Remove backslashes before characters that are not valid JSON escape chars.
    # Valid after \: " \ / b f n r t u  (+ digits for \uXXXX)
    text = re.sub(r'\\([^"\\/bfnrtux0-9])', r'\1', text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Last resort: try to strip trailing commas which models sometimes add
        text = re.sub(r',\s*([}\]])', r'\1', text)
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {}

def describe(img_path: Path, model: str) -> dict:
    tmp_path = None
    try:
        tmp_path = resize_for_model(img_path)
        resp = ollama.chat(
            model=model,
            format="json",
            messages=[{"role": "user", "content": PROMPT, "images": [str(tmp_path)]}],
        )
        result = extract_json(resp.message.content)
        if not result:
            print(f"  [no JSON] raw: {resp.message.content[:80]}")
        return result
    except Exception as e:
        print(f"  [error] {e}")
        return {}
    finally:
        if tmp_path and tmp_path.exists():
            tmp_path.unlink()

# ---- stage-2: bird specialist -----------------------------------------------
def identify_bird(img_path: Path) -> dict:
    """Run specialist bird ID via llava:7b. Returns dict or {} on failure."""
    tmp_path = None
    try:
        tmp_path = resize_for_model(img_path)
        r = ollama.chat(
            model=BIRD_ID_MODEL,
            format="json",
            messages=[{"role": "user", "content": BIRD_PROMPT, "images": [str(tmp_path)]}],
        )
        result = extract_json(r.message.content)
        if not result:
            print(f"\n  [bird-id no JSON] raw: {r.message.content[:80]}")
        return result
    except Exception as e:
        print(f"\n  [bird-id error] {e}")
        return {}
    finally:
        if tmp_path and tmp_path.exists():
            tmp_path.unlink()

# ---- main --------------------------------------------------------------------
def run(json_path: Path, model: str, limit: int | None, force_all: bool):
    photos = json.loads(json_path.read_text())

    # check ollama is running
    try:
        ollama.list()
    except Exception:
        print("Ollama not running. Start it with: ollama serve")
        raise SystemExit(1)

    # check model is available
    listed = ollama.list()
    models_list = listed.models if hasattr(listed, "models") else listed.get("models", [])
    available = [getattr(m, "model", getattr(m, "name", "")) for m in models_list]
    if not any(model in a for a in available):
        print(f"Model '{model}' not found locally.")
        print(f"Run: ollama pull {model}")
        raise SystemExit(1)

    todo = []
    for i, p in enumerate(photos):
        if force_all or looks_like_uuid(p.get("title", "")):
            local = find_local_file(p)
            if local:
                todo.append((i, p, local))

    if limit:
        todo = todo[:limit]

    print(f"Model : {model}")
    print(f"Photos: {len(todo)} to describe ({len(photos)} total in JSON)")
    if not todo:
        print("Nothing to do — all titles already look descriptive.")
        print("Use --all to re-describe everything.")
        return

    ok = 0
    t0 = time.time()
    for n, (i, photo, local_path) in enumerate(todo, 1):
        elapsed = time.time() - t0
        rate    = n / elapsed if elapsed > 0 else 0
        eta     = (len(todo) - n) / rate if rate > 0 else 0
        print(f"[{n}/{len(todo)}] ETA {eta/60:.1f}min  {local_path.name[:40]}", end=" ... ", flush=True)

        result = describe(local_path, model)
        if result:
            photo["title"]              = result.get("title",             photo["title"])
            photo["animal"]             = result.get("animal",            photo.get("animal", ""))
            photo["species"]            = result.get("species",           photo.get("species", ""))
            photo["species_confidence"] = result.get("species_confidence", photo.get("species_confidence", 0))
            photo["category"]           = result.get("category",          photo.get("category", ""))
            photo["season"]             = result.get("season",            photo.get("season", ""))
            if not photo.get("location") and result.get("location_hint"):
                photo["location"] = result["location_hint"]

            # Stage 2: specialist bird identification (overrides stage-1 confidence for birds)
            if photo.get("category") == "birds":
                print(f"\n  → bird — running {BIRD_ID_MODEL} specialist ID...", end=" ", flush=True)
                bird = identify_bird(local_path)
                if bird and bird.get("confidence", 0) > 0:
                    if bird.get("species") and bird.get("confidence", 0) >= 25:
                        photo["species"] = bird["species"]
                    photo["species_confidence"] = bird.get("confidence", 0)
                    photo["scientific_name"]    = bird.get("scientific", "")
                    photo["field_marks"]        = bird.get("field_marks", [])
                    photo["age_sex"]            = bird.get("age_sex", "unknown")
                    photo["behavior"]           = bird.get("behavior", "")
                    print(f"{photo.get('species','?')} ({photo['species_confidence']}%)")
                else:
                    print("[bird-id failed]")

            photos[i] = photo
            print(photo["title"])
            ok += 1
        else:
            print("[skipped]")

        # save every 10 photos
        if n % 10 == 0 or n == len(todo):
            json_path.write_text(json.dumps(photos, indent=2))

    total = time.time() - t0
    print(f"\nDone — {ok}/{len(todo)} described in {total/60:.1f} min -> {json_path}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--json",       default="data/photos.json")
    ap.add_argument("--model",      default=DEFAULT_MODEL)
    ap.add_argument("--bird-model", default=BIRD_ID_MODEL)
    ap.add_argument("--limit",      type=int, default=None)
    ap.add_argument("--all",        action="store_true")
    args = ap.parse_args()
    BIRD_ID_MODEL = args.bird_model  # allow CLI override
    run(Path(args.json), args.model, args.limit, args.all)
