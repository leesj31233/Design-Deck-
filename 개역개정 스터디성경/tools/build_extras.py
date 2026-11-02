"""Smaller derived data for the reader.

- app/data/occ/<H|G><n//100>.json   Strong's number -> every verse it occurs in, across the Bible
- app/data/basemap.json             land, lakes and rivers of the biblical world (Natural Earth, public domain)

Run after build_bible.py:  python -I tools/build_extras.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
DATA = ROOT / "app" / "data"
BBOX = (-10.0, 12.0, 66.0, 48.0)  # lon0, lat0, lon1, lat1


def build_occ():
    books = json.loads((DATA / "books.json").read_text(encoding="utf-8"))
    buckets = {}
    for b in books:
        words = json.loads((DATA / "words" / f"{b['id']}.json").read_text(encoding="utf-8"))
        for ref, ws in words.items():
            c, v = ref.split(":")
            for s in dict.fromkeys(w[3] for w in ws if w[3]):
                key = f"{s[0]}{int(s[1:]) // 100}"
                lst = buckets.setdefault(key, {}).setdefault(s, [])
                lst.append(f"{b['id']}.{c}.{v}")
    out = DATA / "occ"
    out.mkdir(exist_ok=True)
    for key, d in buckets.items():
        (out / f"{key}.json").write_text(json.dumps(d, separators=(",", ":")), encoding="utf-8")
    print(f"occ buckets={len(buckets)} strongs={sum(len(d) for d in buckets.values())}")


def inside(pt):
    return BBOX[0] - 3 <= pt[0] <= BBOX[2] + 3 and BBOX[1] - 3 <= pt[1] <= BBOX[3] + 3


def thin(ring, step=0.04):
    out = []
    for x, y in ring:
        p = [round(x, 2), round(y, 2)]
        if not out or abs(out[-1][0] - p[0]) + abs(out[-1][1] - p[1]) >= step:
            out.append(p)
    return out


def polys(fn, min_pts=4, keep=None):
    gj = json.loads((RAW / fn).read_text(encoding="utf-8"))
    out = []
    for f in gj["features"]:
        if keep and not keep(f["properties"]):
            continue
        g = f["geometry"]
        if not g:
            continue
        parts = [g["coordinates"]] if g["type"] in ("Polygon", "LineString") else g["coordinates"]
        for part in parts:
            rings = [part] if g["type"].endswith("LineString") else part[:1]
            for ring in rings:
                if any(inside(p) for p in ring):
                    r = thin(ring)
                    if len(r) >= min_pts:
                        out.append(r)
    return out


def build_basemap():
    land = polys("ne_50m_land.geojson")
    lakes = polys("ne_10m_lakes.geojson", keep=lambda p: (p.get("scalerank") or 9) <= 9)
    lakes = [r for r in lakes if all(inside(p) for p in r)]
    rivers = polys("ne_50m_rivers.geojson", min_pts=2, keep=lambda p: (p.get("scalerank") or 9) <= 8)
    (DATA / "basemap.json").write_text(json.dumps({"bbox": BBOX, "land": land, "lakes": lakes, "rivers": rivers}, separators=(",", ":")), encoding="utf-8")
    print(f"basemap land={len(land)} lakes={len(lakes)} rivers={len(rivers)} size={(DATA / 'basemap.json').stat().st_size // 1024}KB")


if __name__ == "__main__":
    build_occ()
    build_basemap()
