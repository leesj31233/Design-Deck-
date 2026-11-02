"""Cross references for Matthew from OpenBible.info (CC BY), with Korean book abbreviations
and the KJV text of each target so the reader can show it without loading the whole Bible.

Output: app/data/crossrefs.json  {"2:6": [{"to": "미 5:2", "key": "Mic.5.2", "kjv": "..."}]}
Run:    python -I tools/build_crossrefs.py
"""
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
PER_VERSE = 6
MIN_VOTES = 5

CODES = ("Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov "
         "Eccl Song Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark "
         "Luke John Acts Rom 1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet "
         "2Pet 1John 2John 3John Jude Rev").split()
KO = ("창 출 레 민 신 수 삿 룻 삼상 삼하 왕상 왕하 대상 대하 스 느 에 욥 시 잠 전 아 사 렘 애 겔 단 호 욜 암 옵 욘 미 "
      "나 합 습 학 슥 말 마 막 눅 요 행 롬 고전 고후 갈 엡 빌 골 살전 살후 딤전 딤후 딛 몬 히 약 벧전 벧후 요일 요이 요삼 유 계").split()
BOOK = {c: i for i, c in enumerate(CODES)}


def parse(ref):
    b, c, v = ref.split(".")
    return BOOK[b], int(c), int(v)


def label(target):
    start, _, end = target.partition("-")
    b, c, v = parse(start)
    text = f"{KO[b]} {c}:{v}"
    if end:
        b2, c2, v2 = parse(end)
        text += f"-{v2}" if c2 == c else f"-{c2}:{v2}"
    return text


def main():
    kjv = json.load(open(RAW / "kjv.json", encoding="utf-8-sig"))
    rows = zipfile.ZipFile(RAW / "crossrefs.zip").read("cross_references.txt").decode("utf-8").splitlines()[1:]
    out = {}
    for row in rows:
        src, dst, votes = row.split("\t")
        if not src.startswith("Matt.") or int(votes) < MIN_VOTES:
            continue
        _, c, v = parse(src)
        out.setdefault(f"{c}:{v}", []).append((int(votes), dst))
    result = {}
    for ref, items in out.items():
        items.sort(reverse=True)
        refs = []
        for _, dst in items[:PER_VERSE]:
            b, c, v = parse(dst.partition("-")[0])
            try:
                text = kjv[b]["chapters"][c - 1][v - 1]
            except IndexError:
                continue
            refs.append({"to": label(dst), "key": dst, "kjv": text})
        result[ref] = refs
    (ROOT / "app" / "data" / "crossrefs.json").write_text(
        json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"verses with refs={len(result)} refs={sum(len(r) for r in result.values())}")


if __name__ == "__main__":
    main()
