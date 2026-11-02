"""Representative photos for biblical places, from the Wikimedia Commons file each OpenBible.info
place record points to. Places mentioned at least MIN_REFS times get a 480px thumbnail.

Output: app/images/places/<id>.jpg, app/data/place_images.json {place id: {src, w, h, credit, license, page}}
Run: python -I tools/build_place_images.py
"""
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "app" / "images" / "places"
OUT = ROOT / "app" / "data" / "place_images.json"
UA = {"User-Agent": "BibleStudyPersonal/1.0 (personal study project; lees_j00@naver.com)"}
MIN_REFS = 4
FREE = re.compile(r"public domain|^pd|cc0|cc[- ]by", re.I)


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return r.read()


def clean(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()


def info_for(titles):
    params = {"action": "query", "format": "json", "prop": "imageinfo", "iiprop": "url|extmetadata|size",
              "iiurlwidth": "480", "titles": "|".join(titles)}
    data = json.loads(get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)))
    out = {}
    norm = {n["to"]: n["from"] for n in data.get("query", {}).get("normalized", [])}
    for p in data.get("query", {}).get("pages", {}).values():
        ii = (p.get("imageinfo") or [{}])[0]
        if not ii.get("thumburl"):
            continue
        meta = ii.get("extmetadata", {})
        lic = clean(meta.get("LicenseShortName", {}).get("value"))
        if not FREE.search(lic):
            continue
        title = norm.get(p["title"], p["title"])
        out[title] = {"thumb": ii["thumburl"], "w": ii.get("thumbwidth"), "h": ii.get("thumbheight"), "page": ii.get("descriptionurl"),
                      "license": lic, "credit": clean(meta.get("Artist", {}).get("value"))[:80] or "Wikimedia Commons"}
    return out


def main():
    places = json.loads((ROOT / "app" / "data" / "places.json").read_text(encoding="utf-8"))
    done = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    todo = []
    for p in places:
        if len(p["refs"]) < MIN_REFS or p["id"] in done or not p.get("img"):
            continue
        m = re.search(r"/wiki/(File:.+)$", p["img"])
        if m:
            todo.append((p["id"], urllib.parse.unquote(m.group(1)).replace("_", " ")))
    print(f"places with photos to fetch: {len(todo)} (cached {len(done)})", flush=True)
    for i in range(0, len(todo), 20):
        batch = todo[i:i + 20]
        try:
            infos = info_for([t for _, t in batch])
        except Exception as e:
            print("  ! batch", e, flush=True)
            continue
        for pid, title in batch:
            hit = infos.get(title)
            if not hit:
                continue
            try:
                (OUT_DIR / f"{pid}.jpg").write_bytes(get(hit["thumb"]))
            except Exception as e:
                print("  ! ", title, e, flush=True)
                continue
            done[pid] = {"src": f"images/places/{pid}.jpg", "w": hit["w"], "h": hit["h"], "credit": hit["credit"], "license": hit["license"], "page": hit["page"]}
            time.sleep(0.2)
        OUT.write_text(json.dumps(done, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"  {min(i + 20, len(todo))}/{len(todo)} photos={len(done)}", flush=True)
    print(f"place photos={len(done)}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
