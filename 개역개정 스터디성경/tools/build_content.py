"""Merge the written study content into the reader's data.

content/<id>.json  ->  app/data/study/<id>.json   (per-book intro, headings, terms, boxes, figures, people)
                       app/data/people.json        (all person cards, with their book)
                       app/data/index.json         (search index: headings, terms, people)
                       work/image_queries.json     (every picture the content asks for)

Only books that pass validation (no ERROR) are merged.
Run: python -I tools/build_content.py
"""
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from books import IDS  # noqa: E402
from validate_content import validate  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "app" / "data" / "study"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    people, index_h, index_t, index_p, queries = [], [], [], [], {}
    merged, skipped = [], []
    for bid in IDS:
        src = ROOT / "content" / f"{bid}.json"
        if not src.exists():
            continue
        errs, _ = validate(bid)
        if errs:
            skipped.append(f"{bid} ({len(errs)} errors)")
            continue
        d = json.loads(src.read_text(encoding="utf-8"))
        study = {k: d.get(k, []) for k in ("headings", "terms", "boxes", "figures")}
        study["intro"] = d.get("intro")
        (OUT / f"{bid}.json").write_text(json.dumps(study, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        for h in d.get("headings", []):
            index_h.append([bid, h[0], h[1]])
        for t in d.get("terms", []):
            index_t.append([bid, t["id"], t["label"], t.get("en", "")])
            if t.get("img", {}).get("query"):
                queries[t["img"]["query"]] = t["img"].get("caption", t["label"])
        for f in d.get("figures", []):
            if f.get("kind") == "photo" and f.get("query"):
                queries[f["query"]] = f.get("title", "")
        for p in d.get("people", []):
            people.append({"book": bid, **p})
            index_p.append([bid, p["id"], p["name"], p.get("en", "")])
            if p.get("img", {}).get("query"):
                queries[p["img"]["query"]] = p["img"].get("caption", p["name"])
        merged.append(bid)
    # Books without content get no study file; drop stale ones.
    for f in OUT.glob("*.json"):
        if f.stem not in merged and f.stem != "index":
            f.unlink()
    data = ROOT / "app" / "data"
    (OUT / "index.json").write_text(json.dumps(merged), encoding="utf-8")
    (data / "people.json").write_text(json.dumps(people, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (data / "index.json").write_text(json.dumps({"h": index_h, "t": index_t, "p": index_p}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (ROOT / "work" / "image_queries.json").write_text(json.dumps(queries, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"merged={len(merged)} {merged}\nskipped={skipped}\npeople={len(people)} terms={len(index_t)} headings={len(index_h)} image_queries={len(queries)}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
