"""Fetch the pictures the study content asks for from Wikimedia Commons.

Reads work/image_queries.json ({query: caption}) written by build_content.py, searches Commons for
each query, keeps the first result with a free licence (public domain, CC0, CC BY, CC BY-SA),
downloads a 640px thumbnail into app/images/ and records credit and licence in app/data/images.json.
Already-fetched queries are skipped, so the script can be re-run as content grows.

Run: python -I tools/build_images.py
"""
import hashlib
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "app" / "images"
OUT = ROOT / "app" / "data" / "images.json"
UA = {"User-Agent": "BibleStudyPersonal/1.0 (personal study project; lees_j00@naver.com)"}
FREE = re.compile(r"public domain|^pd|cc0|cc[- ]by", re.I)


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def clean(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()


def search(query):
    params = {
        "action": "query", "format": "json", "generator": "search", "gsrnamespace": "6",
        "gsrsearch": f"{query} filetype:bitmap", "gsrlimit": "8", "prop": "imageinfo",
        "iiprop": "url|extmetadata|size", "iiurlwidth": "640",
    }
    data = json.loads(get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)))
    pages = sorted((data.get("query") or {}).get("pages", {}).values(), key=lambda p: p.get("index", 99))
    for p in pages:
        info = (p.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata", {})
        lic = clean(meta.get("LicenseShortName", {}).get("value"))
        if not FREE.search(lic) or not info.get("thumburl"):
            continue
        if info.get("thumbwidth", 0) < 200:
            continue
        return {
            "thumb": info["thumburl"], "w": info.get("thumbwidth"), "h": info.get("thumbheight"),
            "page": info.get("descriptionurl"), "license": lic,
            "credit": clean(meta.get("Artist", {}).get("value"))[:80] or "Wikimedia Commons",
            "desc": clean(meta.get("ImageDescription", {}).get("value"))[:200],
            "title": clean(p.get("title", "")).replace("File:", ""),
        }
    return None


def variants(query):
    """The query itself, then simpler forms: drop trailing words, then add 'painting' for people and scenes."""
    words = query.split()
    out = [query]
    for n in range(len(words) - 1, 1, -1):
        out.append(" ".join(words[:n]))
    out.append(" ".join(words[:2]) + " painting")
    return list(dict.fromkeys(out))


def find(query):
    for q in variants(query):
        hit = search(q)
        if hit:
            return hit
        time.sleep(0.3)
    return None


def main():
    queries = json.loads((ROOT / "work" / "image_queries.json").read_text(encoding="utf-8"))
    images = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    IMG.mkdir(parents=True, exist_ok=True)
    todo = [q for q in queries if not images.get(q)]
    print(f"queries={len(queries)} cached={len(queries) - len(todo)} todo={len(todo)}", flush=True)
    for i, q in enumerate(todo, 1):
        try:
            hit = find(q)
        except Exception as e:  # network hiccup: try again next run
            print(f"  ! {q}: {e}", flush=True)
            continue
        if not hit:
            images[q] = None
            print(f"  - {q}: no free image", flush=True)
            continue
        name = hashlib.sha1(q.encode("utf-8")).hexdigest()[:12] + ".jpg"
        try:
            (IMG / name).write_bytes(get(hit["thumb"]))
        except Exception as e:
            print(f"  ! {q}: download {e}", flush=True)
            continue
        images[q] = {"src": f"images/{name}", "w": hit["w"], "h": hit["h"], "credit": hit["credit"], "license": hit["license"],
                     "page": hit["page"], "desc": hit["desc"], "title": queries[q] or hit["title"]}
        if i % 10 == 0:
            OUT.write_text(json.dumps(images, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            print(f"  {i}/{len(todo)}", flush=True)
        time.sleep(0.4)
    OUT.write_text(json.dumps({k: v for k, v in images.items()}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"images={sum(1 for v in images.values() if v)} missing={sum(1 for v in images.values() if not v)}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
