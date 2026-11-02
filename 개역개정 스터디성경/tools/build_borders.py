"""Modern country borders and Korean country names for the Bible map (Natural Earth, public domain).

Output: app/data/borders.json  {"lines": [[[lat, lon], ...], ...], "labels": [[lat, lon, "이스라엘"], ...]}
Run: python -I tools/build_borders.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
BBOX = (-12.0, 10.0, 68.0, 50.0)  # lon0, lat0, lon1, lat1


def inside(lon, lat):
    return BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]


def main():
    lines = []
    gj = json.loads((RAW / "ne_50m_borders.geojson").read_text(encoding="utf-8"))
    for f in gj["features"]:
        g = f["geometry"]
        parts = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
        for part in parts:
            pts = [[round(lat, 3), round(lon, 3)] for lon, lat in part if inside(lon, lat)]
            if len(pts) >= 2:
                lines.append(pts)
    labels = []
    gj = json.loads((RAW / "ne_50m_countries.geojson").read_text(encoding="utf-8"))
    for f in gj["features"]:
        p = f["properties"]
        lon, lat = p.get("LABEL_X"), p.get("LABEL_Y")
        if lon is None or not inside(lon, lat):
            continue
        labels.append([round(lat, 2), round(lon, 2), p.get("NAME_KO") or p.get("NAME"), p.get("NAME")])
    (ROOT / "app" / "data" / "borders.json").write_text(json.dumps({"lines": lines, "labels": labels}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"border lines={len(lines)} labels={len(labels)} size={(ROOT / 'app' / 'data' / 'borders.json').stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
