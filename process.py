#!/usr/bin/env python3
"""
process.py - photo processing pipeline for the portfolio.
Run this whenever you add new photos.

Installs (run once):
  pip install cloudinary Pillow numpy scikit-learn umap-learn

Optional (CLIP semantic search):
  pip install transformers torch

Usage:
  python process.py --photos ./photos-original --out ./data/photos.json
  python process.py --photos ./photos-original --out ./data/photos.json --cloudinary-config creds.json

Cloudinary credentials JSON format (creds.json):
  { "cloud_name": "...", "api_key": "...", "api_secret": "..." }

Or set environment variables:
  CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
"""

import os, sys, json, argparse
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()  # loads .env into os.environ, no-op if file doesn't exist
import numpy as np
from PIL import Image
from sklearn.cluster import KMeans

# -- optional deps -------------------------------------------------------------
try:
    import cloudinary, cloudinary.uploader
    HAS_CLOUDINARY = True
except ImportError:
    HAS_CLOUDINARY = False
    print("[warn] cloudinary not installed. pip install cloudinary")

try:
    import umap as umap_lib
    HAS_UMAP = True
except ImportError:
    HAS_UMAP = False
    print("[warn] umap-learn not installed. pip install umap-learn")

try:
    from transformers import CLIPProcessor, CLIPModel
    import torch
    HAS_CLIP = True
except ImportError:
    HAS_CLIP = False

# -- config -------------------------------------------------------------------
SUPPORTED_EXTS  = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}
N_COLORS        = 5
CLOUDINARY_FOLDER = "portfolio"

PHOTO_TAGS = [
    # behaviour / shot type (universal)
    "portrait", "close-up", "macro", "silhouette", "backlit", "bokeh",
    "in flight", "perched", "hovering", "feeding", "resting",
    # bird-specific
    "wading", "singing", "nesting",
    # insect-specific
    "butterfly", "dragonfly", "bee", "beetle", "moth", "spider",
    "insect on flower", "wings open", "wings closed",
    # landscape
    "golden hour", "sunrise", "sunset", "long exposure",
    "forest", "wetland", "field", "sky", "clouds", "water", "reflection",
    "wide angle", "minimalist", "panoramic",
    # season
    "spring", "summer", "fall", "winter", "snow",
]

# -- color extraction ---------------------------------------------------------
def extract_dominant_colors(img_path, n=N_COLORS):
    """Returns n hex color strings, most dominant first."""
    img = Image.open(img_path).convert("RGB").resize((120, 120))
    pixels = np.array(img).reshape(-1, 3).astype(float)
    km = KMeans(n_clusters=n, random_state=42, n_init=10, max_iter=200)
    km.fit(pixels)
    counts = np.bincount(km.labels_)
    centers = km.cluster_centers_[np.argsort(-counts)].astype(int)
    return ["#{:02x}{:02x}{:02x}".format(*c) for c in centers]

def color_feature_vec(colors):
    """15-dim float vector from 5 dominant colors (for UMAP)."""
    padded = (colors + ["#808080"] * N_COLORS)[:N_COLORS]
    vec = []
    for h in padded:
        vec += [int(h[1:3],16)/255, int(h[3:5],16)/255, int(h[5:7],16)/255]
    return vec

# -- aspect ratio detection ---------------------------------------------------
def detect_aspect(img_path):
    w, h = Image.open(img_path).size
    r = w / h
    label = "landscape" if r > 1.15 else "portrait" if r < 0.87 else "square"
    return label, round(r, 4)

# -- CLIP ---------------------------------------------------------------------
_clip_model = _clip_proc = None

def load_clip():
    global _clip_model, _clip_proc
    if _clip_model is None:
        print("[clip] loading model (first run ~600 MB download)...")
        _clip_model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
        _clip_proc  = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
        _clip_model.eval()
    return _clip_model, _clip_proc

def get_clip_embedding(img_path):
    if not HAS_CLIP:
        return None
    model, proc = load_clip()
    img = Image.open(img_path).convert("RGB")
    inputs = proc(images=img, return_tensors="pt", padding=True)
    with torch.no_grad():
        feat = model.get_image_features(pixel_values=inputs['pixel_values'])
    # transformers 5.x may return a structured object instead of a raw tensor
    if not isinstance(feat, torch.Tensor):
        feat = feat.pooler_output
    feat = feat / feat.norm(dim=-1, keepdim=True)
    return feat.squeeze().numpy().tolist()

def suggest_tags(img_path):
    """Zero-shot tag suggestion via CLIP. Returns (tags, scores_pct) — both lists of length 5."""
    if not HAS_CLIP:
        return [], []
    model, proc = load_clip()
    img = Image.open(img_path).convert("RGB")
    inputs = proc(
        text=[f"a photo: {t}" for t in PHOTO_TAGS],
        images=img, return_tensors="pt", padding=True,
    )
    with torch.no_grad():
        probs = model(**inputs).logits_per_image.softmax(dim=1).squeeze()
    top = probs.topk(5)
    tags   = [PHOTO_TAGS[i] for i in top.indices.tolist()]
    scores = [round(float(v) * 100, 1) for v in top.values.tolist()]
    return tags, scores

# -- Cloudinary ---------------------------------------------------------------
def configure_cloudinary(creds_path):
    if not HAS_CLOUDINARY:
        return
    if creds_path:
        cloudinary.config(**json.loads(Path(creds_path).read_text()))
    else:
        cloudinary.config(
            cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
            api_key=os.getenv("CLOUDINARY_API_KEY"),
            api_secret=os.getenv("CLOUDINARY_API_SECRET"),
        )

def upload(img_path, rel_id):
    res = cloudinary.uploader.upload(
        str(img_path), public_id=rel_id,
        folder=CLOUDINARY_FOLDER, overwrite=False, resource_type="image",
    )
    return res["public_id"]

# -- main pipeline ------------------------------------------------------------
def process(photos_dir, out_path, creds_path, skip_upload):
    existing = {}
    if out_path.exists():
        for r in json.loads(out_path.read_text()):
            existing[r["id"]] = r
        print(f"[info] {len(existing)} existing records loaded")

    configure_cloudinary(creds_path)
    all_records = list(existing.values())
    new_count   = 0

    for img_path in sorted(photos_dir.rglob("*")):
        if img_path.suffix.lower() not in SUPPORTED_EXTS:
            continue

        rel        = img_path.relative_to(photos_dir).with_suffix("")
        rel_id     = str(rel).replace("\\", "/")
        public_id  = f"{CLOUDINARY_FOLDER}/{rel_id}"

        if public_id in existing:
            print(f"[skip] {rel_id}")
            continue

        print(f"[proc] {img_path.name}")
        colors = extract_dominant_colors(img_path)

        # upload
        final_id = public_id
        if HAS_CLOUDINARY and not skip_upload:
            try:
                final_id = upload(img_path, rel_id)
                print(f"  uploaded: {final_id}")
            except Exception as e:
                print(f"  upload failed: {e}")

        aspect_label, ratio = detect_aspect(img_path)
        tags, tag_scores    = suggest_tags(img_path)
        record = {
            "id":             final_id,
            "title":          img_path.stem.replace("-"," ").replace("_"," ").title(),
            "species":        "",
            "category":       "",
            "location":       "",
            "season":         "",
            "aspect":         aspect_label,
            "ratio":          ratio,
            "tags":           tags,
            "tag_scores":     tag_scores,
            "dominant_colors": colors,
            "_vec":           color_feature_vec(colors),
            "clip_embedding": get_clip_embedding(img_path),
            "umap_3d":        None,
        }
        all_records.append(record)
        new_count += 1

    # recompute UMAP over all records so positions stay consistent
    if HAS_UMAP and len(all_records) >= 4:
        print(f"[umap] projecting {len(all_records)} photos...")
        vecs   = [r.get("_vec") or color_feature_vec(r.get("dominant_colors",[])) for r in all_records]
        nn     = min(15, len(all_records) - 1)
        coords = umap_lib.UMAP(n_components=3, random_state=42, n_neighbors=nn).fit_transform(np.array(vecs))
        for r, c in zip(all_records, coords):
            r["umap_3d"] = [round(float(x), 4) for x in c]
        print("  UMAP done")
    elif not HAS_UMAP:
        print("[warn] umap_3d not computed -- install umap-learn")

    for r in all_records:
        r.pop("_vec", None)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(all_records, indent=2))
    print(f"\nDone -- {len(all_records)} total ({new_count} new) -> {out_path}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--photos",             default="photos-original")
    ap.add_argument("--out",                default="data/photos.json")
    ap.add_argument("--cloudinary-config",  default=None)
    ap.add_argument("--skip-upload",        action="store_true")
    args = ap.parse_args()

    process(
        photos_dir   = Path(args.photos),
        out_path     = Path(args.out),
        creds_path   = args.cloudinary_config,
        skip_upload  = args.skip_upload,
    )
