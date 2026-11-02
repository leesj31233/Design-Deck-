"""Shrink downloaded pictures for the web: at most 720px wide (480px for place photos), JPEG quality 80.
Updates the recorded width/height in images.json and place_images.json. Safe to re-run.

Run: python tools/optimize_images.py      (needs Pillow)
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"


def shrink(path, max_w):
    try:
        im = Image.open(path)
        im.load()
    except Exception:
        return None
    changed = False
    if im.mode not in ("RGB", "L"):
        bg = Image.new("RGB", im.size, (255, 255, 255))
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA")
            bg.paste(im, mask=im.split()[-1])
        else:
            bg.paste(im.convert("RGB"))
        im, changed = bg, True
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
        changed = True
    if changed or path.stat().st_size > 160_000:
        im.save(path, "JPEG", quality=80, optimize=True, progressive=True)
    return im.width, im.height


def main():
    before = sum(f.stat().st_size for f in (APP / "images").rglob("*.jpg"))
    for manifest, max_w in ((APP / "data" / "images.json", 720), (APP / "data" / "place_images.json", 480)):
        if not manifest.exists():
            continue
        data = json.loads(manifest.read_text(encoding="utf-8"))
        for v in data.values():
            if not v:
                continue
            size = shrink(APP / v["src"], max_w)
            if size:
                v["w"], v["h"] = size
        manifest.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    after = sum(f.stat().st_size for f in (APP / "images").rglob("*.jpg"))
    print(f"images {before // 1024 // 1024}MB -> {after // 1024 // 1024}MB")


if __name__ == "__main__":
    main()
