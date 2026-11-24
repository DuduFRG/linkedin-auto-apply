"""
Converts the landing page screenshots to responsive WebP and AVIF.
Usage: python3 scripts/optimize-images.py   (requires Pillow >= 11 with AVIF)

Input:  docs/images/site/*.png  (2x screenshots from capture-screenshots.js)
Output: site/assets/img/<name>-<width>.{avif,webp}
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "images" / "site"
OUT = ROOT / "site" / "assets" / "img"

# name -> (crop height in source pixels, output widths)
JOBS = {
    "painel": (1960, [400, 800]),
    "painel-dark": (1960, [400, 800]),
}

for name, (crop_h, widths) in JOBS.items():
    img = Image.open(SRC / f"{name}.png").convert("RGB")
    img = img.crop((0, 0, img.width, min(crop_h, img.height)))
    for w in widths:
        h = round(img.height * w / img.width)
        resized = img.resize((w, h), Image.LANCZOS)
        resized.save(OUT / f"{name}-{w}.webp", "WEBP", quality=82, method=6)
        resized.save(OUT / f"{name}-{w}.avif", "AVIF", quality=60, speed=4)
        print(f"{name}-{w}: {w}x{h}")
