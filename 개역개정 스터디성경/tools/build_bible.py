"""Build the whole-Bible data for the reader from the public sources in data/raw.

Sources
- 개역한글 KRV 1961 (public domain; scrollmapper/bible_databases KorRV)
- KJV (public domain)
- STEPBible TAHOT / TAGNT (CC BY 4.0): Hebrew and Greek words with Strong's numbers and grammar
- OpenScriptures Strong's Hebrew and Greek dictionaries (CC BY-SA)
- World English Bible USFM (public domain): which words are Jesus' words (red letters)
- OpenBible.info cross references (CC BY)

Output (app/data/)
  books.json            66 books: id, names, original title, verses per chapter
  text/<id>.json        [[krv, kjv], ...] per chapter, plus red-letter token ranges
  words/<id>.json       original-language words per verse
  lex/hebrew.json, lex/greek.json   Strong's entries that occur
  xref/<id>.json        top cross references per verse
Also work/text/<id>.txt   plain verse list (KRV | KJV | Strong's) for writing study notes.

Run: python -I tools/build_bible.py
"""
import json
import re
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from books import BOOKS, IDS  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "app" / "data"
WORK = ROOT / "work" / "text"

SRC_CODES = ("Gen Exo Lev Num Deu Jos Jdg Rut 1Sa 2Sa 1Ki 2Ki 1Ch 2Ch Ezr Neh Est Job Psa Pro Ecc Sng Isa Jer "
             "Lam Ezk Dan Hos Jol Amo Oba Jon Mic Nam Hab Zep Hag Zec Mal Mat Mrk Luk Jhn Act Rom 1Co 2Co Gal Eph "
             "Php Col 1Th 2Th 1Ti 2Ti Tit Phm Heb Jas 1Pe 2Pe 1Jn 2Jn 3Jn Jud Rev").split()
SRC_TO_ID = dict(zip(SRC_CODES, IDS))
XREF_CODES = ("Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov Eccl Song "
              "Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark Luke John Acts "
              "Rom 1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet 2Pet 1John 2John 3John "
              "Jude Rev").split()

WORD_LINE = re.compile(r"^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)(?:\([^)]*\))?#\d+=(\S+)")


def strong_id(field, lang):
    """'H9003/{H7225G}' -> 'H7225'; 'H1732|G1138«G1138' -> 'G1138'."""
    braced = re.findall(r"\{([HG]\d+)[A-Za-z]?\}", field)
    cands = braced or re.findall(r"([HG]\d+)", field.split("«")[-1])
    cands = [c for c in cands if c[0] == lang and not (lang == "H" and int(c[1:]) >= 9000)]
    return f"{lang}{int(cands[0][1:])}" if cands else None


def read_words(files, lang):
    """book id -> {(c, v): [word, ...]}"""
    out = {}
    for fn in files:
        with open(RAW / fn, encoding="utf-8-sig") as f:
            for line in f:
                m = WORD_LINE.match(line)
                if not m:
                    continue
                code, c, v, kind = m.groups()
                bid = SRC_TO_ID[code]
                c, v = int(c), max(int(v), 1)  # Psalm titles (verse 0) belong to verse 1, as in 개역한글
                cols = line.rstrip("\n").split("\t")
                if lang == "G":
                    low = kind.lower()
                    na, tr = "n" in low, "k" in low
                    if not (na or tr):
                        continue
                    gm = re.match(r"(.+?)\s*\((.+)\)$", cols[1])
                    surface, translit = (gm.group(1), gm.group(2)) if gm else (cols[1], "")
                    dstrong, _, morph = cols[3].partition("=")
                    lemma, _, gloss = cols[4].partition("=")
                    flag = "" if na and tr else ("t" if tr else "n")
                    word = [surface.replace("¶", "").strip(), translit, cols[2], strong_id(dstrong, "G"), morph, lemma, gloss, flag]
                else:
                    surface, translit, gloss, dstrong, morph = cols[1], cols[2], cols[3], cols[4], cols[5]
                    lemma = ""
                    lm = re.search(r"\{H\d+[A-Za-z]?=([^=]+)=([^}]*)\}", cols[-1] if len(cols) > 6 else "")
                    lexfield = next((x for x in cols[6:] if "=" in x and "{" in x), "")
                    lm = re.search(r"\{H\d+[A-Za-z]?=([^=]+)=([^}»]*)", lexfield)
                    lemma, lgloss = (lm.group(1), lm.group(2)) if lm else ("", "")
                    word = [surface.replace("/", "").replace("\\", ""), translit.replace("/", ""), gloss, strong_id(dstrong, "H"), morph, lemma, lgloss, ""]
                out.setdefault(bid, {}).setdefault((c, v), []).append(word)
    return out


# ---------- red letters ----------

SPEECH_BEFORE = re.compile(r"(가라사대|이르시되|가로되|하시되|이르시기를|하시기를|말씀하시되|이르되|가라사되|대답하시되)$")
SPEECH_AFTER = re.compile(r"(하시니|하시니라|하시고|하시매|하신대|하시더라|하시는지라|하시니이다|하시며|하시거늘|하셨으니)[.,]?$")


def wj_profile(body):
    """Split a USFM verse body into words flagged as Jesus' words."""
    words = []
    inside = False
    for part in re.split(r"(\\wj\*|\\wj )", body):
        if part == "\\wj ":
            inside = True
            continue
        if part == "\\wj*":
            inside = False
            continue
        text = re.sub(r"\\\+?w\s+([^|\\]*)\|[^\\]*\\\+?w\*", r"\1", part)
        text = re.sub(r"\\[a-z0-9+]+\*?", " ", text)
        for w in re.findall(r"[A-Za-z’']+", text):
            words.append(inside)
    return words


def read_red():
    z = zipfile.ZipFile(RAW / "web_usfm.zip")
    red = {}
    for name in z.namelist():
        m = re.match(r"\d+-([0-9A-Z]{3})eng-web\.usfm", name)
        if not m or m.group(1).title() not in [c.title() for c in SRC_CODES[39:]]:
            continue
        code = next(c for c in SRC_CODES if c.upper() == m.group(1))
        bid = SRC_TO_ID[code]
        text = z.read(name).decode("utf-8")
        chap = 0
        for line in re.split(r"(?=\\c \d+)|(?=\\v \d+)", text):
            cm = re.match(r"\\c (\d+)", line)
            if cm:
                chap = int(cm.group(1))
                continue
            vm = re.match(r"\\v (\d+)\s(.*)", line, re.S)
            if vm and "\\wj" in vm.group(2):
                words = wj_profile(vm.group(2))
                if words and any(words):
                    red.setdefault(bid, {})[(chap, int(vm.group(1)))] = words
    return red


TRAILING = {"하시니", "하시니라", "하시고", "하시매", "하신대", "하시더라", "하시며", "하시거늘", "하시는지라", "하셨느니라"}


def red_tokens(krv, words):
    """Map an English Jesus'-words profile onto the Korean tokens: 'a' (all), [from, to] or None."""
    share = sum(words) / len(words)
    toks = krv.split()
    if share < 0.08 or not toks:
        return None
    start, end = 0, len(toks) - 1
    if not words[0]:
        hits = [i for i, t in enumerate(toks[:-1]) if SPEECH_BEFORE.search(t)]
        if hits:
            start = hits[-1] + 1
        elif share < 0.55:
            return None
    if not words[-1]:
        hits = [i for i, t in enumerate(toks) if i > start and SPEECH_AFTER.search(t)]
        if hits:
            end = max(start, hits[-1] - 1)
    while end > start and toks[end].rstrip(".,") in TRAILING:
        end -= 1
    if start == 0 and end == len(toks) - 1:
        return "a"
    return [start, end]


# ---------- main ----------

def load_lex(fn):
    src = (RAW / fn).read_text(encoding="utf-8")
    return json.loads(src[src.index("{"): src.rindex("}") + 1])


def main():
    krv = json.load(open(RAW / "korrv.json", encoding="utf-8-sig"))["books"]
    kjv = json.load(open(RAW / "kjv.json", encoding="utf-8-sig"))
    heb = read_words(["tahot1.txt", "tahot2.txt", "tahot3.txt", "tahot4.txt"], "H")
    grk = read_words(["tagnt_mat_jhn.txt", "tagnt_act_rev.txt"], "G")
    red = read_red()

    for d in ("text", "words", "lex", "xref"):
        (OUT / d).mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)

    meta = []
    used = {"H": set(), "G": set()}
    red_count = 0
    for bi, (bid, ko, ab, en, orig) in enumerate(BOOKS):
        kb, jb = krv[bi]["chapters"], kjv[bi]["chapters"]
        words = (grk if bi >= 39 else heb).get(bid, {})
        chapters, wout, rout, lines = [], {}, {}, []
        for ci, ch in enumerate(kb, start=1):
            verses = []
            for v in ch["verses"]:
                vi = v["verse"]
                ktext = v["text"].strip()
                etext = jb[ci - 1][vi - 1] if ci - 1 < len(jb) and vi - 1 < len(jb[ci - 1]) else ""
                verses.append([ktext, etext])
                ws = words.get((ci, vi), [])
                if ws:
                    wout[f"{ci}:{vi}"] = ws
                    for w in ws:
                        if w[3]:
                            used[w[3][0]].add(w[3])
                prof = red.get(bid, {}).get((ci, vi))
                if prof:
                    r = red_tokens(ktext, prof)
                    if r:
                        rout[f"{ci}:{vi}"] = r
                        red_count += 1
                strongs = " ".join(dict.fromkeys(w[3] for w in ws if w[3]))
                lines.append(f"{ci}:{vi} | {ktext} | {etext} | {strongs}")
            chapters.append(verses)
        (OUT / "text" / f"{bid}.json").write_text(json.dumps({"c": chapters, "red": rout}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        (OUT / "words" / f"{bid}.json").write_text(json.dumps(wout, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        (WORK / f"{bid}.txt").write_text("\n".join(lines), encoding="utf-8")
        meta.append({"id": bid, "ko": ko, "ab": ab, "en": en, "orig": orig, "t": "OT" if bi < 39 else "NT",
                     "v": [len(ch) for ch in chapters]})
    (OUT / "books.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    for lang, fn, out in (("H", "strongs-hebrew.js", "hebrew.json"), ("G", "strongs-greek.js", "greek.json")):
        lex = load_lex(fn)
        keep = {k: lex[k] for k in sorted(used[lang], key=lambda s: int(s[1:])) if k in lex}
        (OUT / "lex" / out).write_text(json.dumps(keep, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    build_xrefs()
    print(f"books={len(meta)} verses={sum(sum(b['v']) for b in meta)} hebrew_strongs={len(used['H'])} greek_strongs={len(used['G'])} red_verses={red_count}")


def build_xrefs(per_verse=6, min_votes=5):
    rows = zipfile.ZipFile(RAW / "crossrefs.zip").read("cross_references.txt").decode("utf-8").splitlines()[1:]
    code_to_id = dict(zip(XREF_CODES, IDS))
    out = {}
    for row in rows:
        src, dst, votes = row.split("\t")
        if int(votes) < min_votes:
            continue
        b, c, v = src.split(".")
        out.setdefault(code_to_id[b], {}).setdefault(f"{c}:{v}", []).append((int(votes), dst))
    for bid, refs in out.items():
        res = {}
        for ref, items in refs.items():
            items.sort(reverse=True)
            res[ref] = []
            for _, dst in items[:per_verse]:
                a, _, z = dst.partition("-")
                ab, ac, av = a.split(".")
                target = f"{code_to_id[ab]}.{ac}.{av}"
                if z:
                    zb, zc, zv = z.split(".")
                    target += f"-{zc}.{zv}" if zc != ac else f"-{zv}"
                res[ref].append(target)
        (OUT / "xref" / f"{bid}.json").write_text(json.dumps(res, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
