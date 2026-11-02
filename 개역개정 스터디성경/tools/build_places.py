"""Biblical places for the map, from OpenBible.info's Bible Geocoding Data (CC BY 4.0).

Output: app/data/places.json  [{id, en, ko, ll: [lat, lon], type, refs: ["Gen.35.19", ...]}]
        work/places_ko_input.txt  places needing a Korean (개역한글) name, with sample verses
Korean names are read from work/places_ko.json ({id: "베들레헴"}) when it exists.

Run: python -I tools/build_places.py
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from books import IDS  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
TEXT = ROOT / "app" / "data" / "text"

XREF_CODES = ("Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov Eccl Song "
              "Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark Luke John Acts "
              "Rom 1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet 2Pet 1John 2John 3John "
              "Jude Rev").split()
CODE_TO_ID = dict(zip(XREF_CODES, IDS))


def main():
    texts = {}

    def verse(ref):
        b, c, v = ref.split(".")
        if b not in texts:
            texts[b] = json.loads((TEXT / f"{b}.json").read_text(encoding="utf-8"))["c"]
        try:
            return texts[b][int(c) - 1][int(v) - 1][0]
        except IndexError:
            return ""

    ko_path = ROOT / "work" / "places_ko.json"
    ko = json.loads(ko_path.read_text(encoding="utf-8")) if ko_path.exists() else {}
    places, need = [], []
    for line in open(RAW / "geo_ancient.jsonl", encoding="utf-8"):
        x = json.loads(line)
        extra = json.loads(x["extra"]) if isinstance(x.get("extra"), str) else x.get("extra") or {}
        refs = []
        for o in extra.get("osises", []):
            b, c, v = o.split(".")[:3]
            if b in CODE_TO_ID:
                refs.append(f"{CODE_TO_ID[b]}.{c}.{v}")
        ll = None
        for ident in x.get("identifications", []):
            for res in ident.get("resolutions", []):
                if res.get("lonlat"):
                    lon, lat = map(float, res["lonlat"].split(","))
                    ll = [round(lat, 4), round(lon, 4)]
                    break
            if ll:
                break
        if not ll or not refs:
            continue
        en = re.sub(r"\s+\d+$", "", x["friendly_id"])
        types = x.get("types") or []
        p = {"id": x["id"], "en": en, "fid": x["friendly_id"], "ko": ko.get(x["id"], ""), "ll": ll,
             "type": types[0] if types else "", "refs": refs}
        thumb = (x.get("media") or {}).get("thumbnail") or {}
        if thumb.get("credit_url"):
            p["img"] = thumb["credit_url"]
        places.append(p)
        if not p["ko"]:
            sample = " / ".join(f"{r}: {verse(r)}" for r in refs[:2])
            need.append(f"{x['id']} | {x['friendly_id']} | {len(refs)} | {sample}")
    places.sort(key=lambda p: -len(p["refs"]))
    (ROOT / "app" / "data" / "places.json").write_text(json.dumps(places, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (ROOT / "work" / "places_ko_input.txt").write_text("\n".join(sorted(need, key=lambda s: -int(s.split(" | ")[2]))), encoding="utf-8")
    print(f"places={len(places)} with_korean={sum(1 for p in places if p['ko'])} need_korean={len(need)}")


if __name__ == "__main__":
    main()
