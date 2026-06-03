#!/usr/bin/env python3
"""
One-off script: read EXIF from photos-original/ and patch data/photos.json
and data/photos-web.json.  Run from the repo root:
  python patch_exif.py
"""
import json
from pathlib import Path
from PIL import Image
from PIL.ExifTags import TAGS

PHOTO_DIR = Path("photos-original")
FULL_JSON  = Path("data/photos.json")
WEB_JSON   = Path("data/photos-web.json")

WEB_KEYS = [
    "id", "title", "species", "category", "location", "season", "aspect", "ratio",
    "tags", "tag_scores", "dominant_colors", "umap_3d", "animal",
    "bird_confidence", "scientific_name", "field_marks", "age_sex", "behavior",
    "camera", "lens", "shutter", "aperture", "iso", "focal_length", "date_taken",
]

SUPPORTED = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}

def fmt_shutter(t):
    if t is None:
        return None
    t = float(t)
    if t >= 1:
        s = f"{t:.1f}".rstrip("0").rstrip(".")
        return f"{s}s"
    denom = round(1 / t)
    return f"1/{denom}s"

def fmt_aperture(f):
    if f is None:
        return None
    f = float(f)
    s = f"{f:.1f}".rstrip("0").rstrip(".")
    return f"f/{s}"

def extract_exif(img_path):
    try:
        raw = Image.open(img_path)._getexif()
        if not raw:
            return {}
        t = {TAGS.get(k, k): v for k, v in raw.items()}

        make  = (t.get("Make") or "").strip()
        model = (t.get("Model") or "").strip()
        if make and model.startswith(make):
            model = model[len(make):].strip()
        camera = f"{make} {model}".strip() if make else model

        lens = (t.get("LensModel") or "").strip()
        if "|" in lens:
            lens = lens[:lens.index("|")].strip()

        raw_date = (t.get("DateTimeOriginal") or "").strip()
        # EXIF date: "2025:12:30 09:04:09" → ISO "2025-12-30T09:04:09"
        date_taken = raw_date.replace(":", "-", 2).replace(" ", "T") if raw_date else None

        return {
            "camera":       camera or None,
            "lens":         lens or None,
            "shutter":      fmt_shutter(t.get("ExposureTime")),
            "aperture":     fmt_aperture(t.get("FNumber")),
            "iso":          str(t["ISOSpeedRatings"]) if t.get("ISOSpeedRatings") else None,
            "focal_length": f"{int(float(t['FocalLength']))}mm" if t.get("FocalLength") else None,
            "date_taken":   date_taken,
        }
    except Exception:
        return {}

# Build stem -> exif map
print("Reading EXIF from photos-original/ ...")
exif_map = {}
for f in PHOTO_DIR.iterdir():
    if f.suffix.lower() in SUPPORTED:
        exif_map[f.stem] = extract_exif(f)
print(f"  {len(exif_map)} files scanned")

# Patch photos.json
records = json.loads(FULL_JSON.read_text())
patched = 0
for r in records:
    stem = r["id"].split("/")[-1]
    exif = exif_map.get(stem, {})
    for k, v in exif.items():
        r[k] = v
    if exif:
        patched += 1

FULL_JSON.write_text(json.dumps(records, indent=2))
print(f"Patched {patched}/{len(records)} records → {FULL_JSON}")

# Rebuild photos-web.json
web = [{k: r[k] for k in WEB_KEYS if k in r} for r in records]
WEB_JSON.write_text(json.dumps(web))
print(f"Rebuilt {WEB_JSON}  ({len(web)} records)")
