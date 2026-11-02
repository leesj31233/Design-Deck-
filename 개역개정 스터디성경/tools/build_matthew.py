"""Build Matthew data for the reader from the public sources in data/raw.

Sources
- STEPBible TAGNT (CC BY 4.0): Greek words, Strong's numbers, grammar, editions
- OpenScriptures Strong's Greek dictionary (CC BY-SA): lemma, derivation, definitions
- KJV (public domain)
- 개역한글 KRV 1961 (public domain, scrollmapper/bible_databases KorRV)

Output: app/data/matthew.json, app/data/lexicon.json
Run:   python -I tools/build_matthew.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "app" / "data"

WORD_LINE = re.compile(r"^Mat\.(\d+)\.(\d+)#(\d+)=(\S+)$")


def strong_id(dstrong):
    """'H1732|G1138«G1138' -> 'G1138', 'G2424G' -> 'G2424'."""
    part = dstrong.split("«")[-1].split("|")[-1]
    m = re.match(r"G0*(\d+)", part)
    return f"G{m.group(1)}" if m else None


def read_greek():
    verses = {}
    with open(RAW / "tagnt_mat_jhn.txt", encoding="utf-8-sig") as f:
        for line in f:
            cols = line.rstrip("\n").split("\t")
            m = WORD_LINE.match(cols[0])
            if not m:
                continue
            ch, vs, _, kind = m.groups()
            low = kind.lower()
            in_na, in_tr = "n" in low, "k" in low
            if not (in_na or in_tr):
                continue  # words used by neither KJV nor modern translations
            greek_col = cols[1]
            gm = re.match(r"(.+?)\s*\((.+)\)$", greek_col)
            greek, translit = (gm.group(1), gm.group(2)) if gm else (greek_col, "")
            dstrong, _, morph = cols[3].partition("=")
            lemma, _, lemma_gloss = cols[4].partition("=")
            verses.setdefault((int(ch), int(vs)), []).append({
                "g": greek.replace("¶", "").strip(),
                "t": translit,
                "en": cols[2],
                "s": strong_id(dstrong),
                "m": morph,
                "l": lemma,
                "lg": lemma_gloss,
                "na": in_na,
                "tr": in_tr,
                "var": cols[14].strip() if len(cols) > 14 else "",
            })
    return verses


def main():
    greek = read_greek()
    kjv_books = json.load(open(RAW / "kjv.json", encoding="utf-8-sig"))
    kjv = next(b for b in kjv_books if b["name"] == "Matthew")["chapters"]
    krv_books = json.load(open(RAW / "korrv.json", encoding="utf-8-sig"))["books"]
    krv = next(b for b in krv_books if b["name"] == "Matthew")["chapters"]

    chapters = []
    used = set()
    for ci, ch in enumerate(kjv, start=1):
        verses = []
        for vi, text in enumerate(ch, start=1):
            words = greek.get((ci, vi), [])
            used.update(w["s"] for w in words if w["s"])
            ko = krv[ci - 1]["verses"][vi - 1]
            assert ko["verse"] == vi, (ci, vi)
            verses.append({"v": vi, "krv": ko["text"], "kjv": text, "words": words})
        chapters.append({"ch": ci, "verses": verses})

    missing = [k for k in greek if k[0] > len(kjv) or k[1] > len(kjv[k[0] - 1])]
    if missing:
        print("Greek verses without a KJV verse:", missing, file=sys.stderr)

    src = (RAW / "strongs-greek.js").read_text(encoding="utf-8")
    lex_all = json.loads(src[src.index("{"): src.rindex("}") + 1])
    lexicon = {k: lex_all[k] for k in sorted(used, key=lambda s: int(s[1:])) if k in lex_all}

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "matthew.json").write_text(
        json.dumps({"book": "Matthew", "chapters": chapters}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")
    (OUT / "lexicon.json").write_text(
        json.dumps(lexicon, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n_words = sum(len(w) for w in greek.values())
    print(f"chapters={len(chapters)} verses={sum(len(c['verses']) for c in chapters)} "
          f"greek_words={n_words} lexicon={len(lexicon)}/{len(used)}")


if __name__ == "__main__":
    main()
