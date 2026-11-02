"""Check content/<id>.json against the book text. Prints ERROR / WARN lines; exits 1 on any ERROR.

Run: python -I tools/validate_content.py Gen [Exod ...]   (or: all)
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from books import BOOKS, IDS, KO_ABBR  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
KINDS = {"linguistic", "historical", "interpretation", "scripture", "tradition", "caution"}
LINK_KINDS = {"인용", "암시", "성취", "예표", "배경", "병행", "같은 단어"}
FIG_KINDS = {"map", "photo", "table", "timeline"}
ERAS = {"태초", "족장 시대", "출애굽·광야", "정복·사사 시대", "통일 왕국", "분열 왕국", "포로기", "포로 귀환", "중간기", "예수 시대", "초대 교회"}
ABBR_RE = "|".join(sorted(map(re.escape, KO_ABBR), key=len, reverse=True))
XREF = re.compile(rf"(?<![가-힣])({ABBR_RE})\s?(\d+):(\d+)(?:-(\d+)(?::(\d+))?)?")

_text = {}


def verses(bid):
    if bid not in _text:
        rows = {}
        for line in (ROOT / "work" / "text" / f"{bid}.txt").read_text(encoding="utf-8").splitlines():
            ref, krv, kjv, strongs = (line.split(" | ") + ["", "", ""])[:4]
            c, v = map(int, ref.split(":"))
            rows[(c, v)] = (krv, kjv, set(strongs.split()))
        _text[bid] = rows
    return _text[bid]


def parse_local(ref, bid):
    m = re.fullmatch(r"(\d+):(\d+)", ref.strip())
    if not m:
        return None
    key = (int(m.group(1)), int(m.group(2)))
    return key if key in verses(bid) else None


def scope_refs(scope, bid):
    out, bad = [], []
    rows = verses(bid)
    for s in scope:
        a, _, b = s.partition("-")
        ka = parse_local(a, bid)
        kb = parse_local(b, bid) if b else ka
        if b and not kb and re.fullmatch(r"\d+", b.strip()) and ka:
            kb = (ka[0], int(b))
            kb = kb if kb in rows else None
        if not ka or not kb:
            bad.append(s)
            continue
        out += [k for k in rows if ka <= k <= kb]
    return out, bad


def check_xref_text(text, where, warn):
    for m in XREF.finditer(text):
        bid = KO_ABBR[m.group(1)]
        if (int(m.group(2)), int(m.group(3))) not in verses(bid):
            warn(f"{where}: 없는 구절 {m.group(0)}")


def validate(bid):
    errs, warns = [], []
    err, warn = errs.append, warns.append
    path = ROOT / "content" / f"{bid}.json"
    if not path.exists():
        return [f"{path} 없음"], []
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        return [f"JSON 오류: {e}"], []
    rows = verses(bid)
    n_ch = max(c for c, _ in rows)
    places = set((ROOT / "work" / "places.txt").read_text(encoding="utf-8").splitlines())

    intro = d.get("intro") or {}
    for k in ("author", "date", "theme", "purpose", "features", "outline"):
        if not intro.get(k):
            err(f"intro.{k} 없음")
    covered = set()
    for row in intro.get("outline", []):
        refs, bad = scope_refs([row[0]], bid)
        if bad:
            err(f"intro.outline 범위 오류 {row[0]}")
        covered.update(refs)
    if intro.get("outline") and len(covered) < len(rows) * 0.9:
        warn(f"intro.outline이 책의 {len(covered)}/{len(rows)}절만 덮음")
    for s in ("theme", "purpose", "features", "author", "date"):
        check_xref_text(intro.get(s, ""), f"intro.{s}", warn)

    heads = d.get("headings", [])
    if not heads or heads[0][0] != "1:1":
        err("headings 첫 항목이 1:1이 아님")
    prev = (0, 0)
    for h in heads:
        k = parse_local(h[0], bid)
        if not k:
            err(f"heading 절 오류 {h[0]}")
            continue
        if k <= prev:
            err(f"heading 순서 오류 {h[0]}")
        prev = k
        if len(h) < 3:
            err(f"heading 형식 오류 {h}")
    chapters_with_head = {parse_local(h[0], bid)[0] for h in heads if parse_local(h[0], bid)}
    missing = [c for c in range(1, n_ch + 1) if c not in chapters_with_head]
    if len(missing) > n_ch * 0.25:
        warn(f"소제목 없는 장이 많음: {missing[:15]}")

    terms = d.get("terms", [])
    ids = set()
    spread = set()
    for t in terms:
        tid = t.get("id", "?")
        where = f"term {tid}"
        if tid in ids:
            err(f"{where}: id 중복")
        ids.add(tid)
        for k in ("label", "en", "kind", "scope", "anchors", "strong", "orig", "translit", "quick", "sections"):
            if k not in t or (k != "strong" and not t[k]):
                err(f"{where}: {k} 없음")
        refs, bad = scope_refs(t.get("scope", []), bid)
        for s in bad:
            err(f"{where}: scope 오류 {s}")
        spread.update(c for c, _ in refs)
        krv = t.get("anchors", {}).get("krv", [])
        hit = [a for a in krv if any(a in rows[r][0] for r in refs)]
        if not hit:
            err(f"{where}: 개역한글 anchor {krv}가 scope {t.get('scope')} 안 어느 절에도 없음")
        for a in krv:
            if a not in hit:
                warn(f"{where}: anchor '{a}'는 scope 안에 없음")
        for a in t.get("anchors", {}).get("kjv", []):
            if not any(a in rows[r][1] for r in refs):
                warn(f"{where}: KJV anchor '{a}'는 scope 안에 없음")
        for s in t.get("strong", []):
            if not re.fullmatch(r"[HG]\d+", s):
                err(f"{where}: Strong 형식 오류 {s}")
            elif not any(s in rows[r][2] for r in refs):
                err(f"{where}: Strong {s}가 scope 안 어느 절에도 없음")
        for sec in t.get("sections", []):
            if sec.get("k") not in KINDS:
                err(f"{where}: section 종류 오류 {sec.get('k')}")
            check_xref_text(sec.get("t", ""), where, warn)
        for ln in t.get("links", []):
            m = XREF.fullmatch(ln.get("ref", "").strip())
            if not m:
                err(f"{where}: link ref 형식 오류 '{ln.get('ref')}' (예: '사 7:14')")
            elif (int(m.group(2)), int(m.group(3))) not in verses(KO_ABBR[m.group(1)]):
                err(f"{where}: link 없는 구절 {ln.get('ref')}")
            if ln.get("kind") not in LINK_KINDS:
                warn(f"{where}: link 종류 '{ln.get('kind')}'")
        if t.get("place") and t["place"] not in places:
            err(f"{where}: place '{t['place']}'가 work/places.txt에 없음")
    want = min(40, max(8, n_ch))
    if len(terms) < want * 0.8:
        warn(f"terms {len(terms)}개 (목표 약 {want}개)")
    if n_ch >= 4 and len(spread) < min(n_ch, len(terms)) * 0.6:
        warn(f"terms가 {len(spread)}개 장에만 있음 (전체 {n_ch}장)")

    for b in d.get("boxes", []):
        if not parse_local(b.get("after", ""), bid):
            err(f"box after 오류 {b.get('after')}")
        for k in ("ref", "title", "body"):
            if not b.get(k):
                err(f"box {b.get('after')}: {k} 없음")
        check_xref_text(b.get("body", ""), f"box {b.get('after')}", warn)
    for f in d.get("figures", []):
        where = f"figure {f.get('title')}"
        if f.get("kind") not in FIG_KINDS:
            err(f"{where}: kind 오류")
        if not parse_local(f.get("after", ""), bid):
            err(f"{where}: after 오류 {f.get('after')}")
        if f.get("kind") == "map":
            for p in f.get("places", []):
                if p not in places:
                    err(f"{where}: place '{p}'가 work/places.txt에 없음")
        if f.get("kind") == "photo" and not f.get("query"):
            err(f"{where}: query 없음")
        if f.get("kind") in ("table", "timeline") and not f.get("rows"):
            err(f"{where}: rows 없음")
    for t in terms:
        if not t.get("here") or not t.get("facts"):
            warn(f"term {t.get('id')}: here/facts 없음")
        if re.search(r"(습니다|입니다)[.)]?(\s|$)", " ".join(s.get("t", "") for s in t.get("sections", [])) + t.get("quick", "")):
            warn(f"term {t.get('id')}: '~습니다' 문체 (나무위키체 '~함/~임'으로)")
    for p in d.get("people", []):
        where = f"person {p.get('id')}"
        for k in ("name", "en", "era", "summary", "life"):
            if not p.get(k):
                err(f"{where}: {k} 없음")
        if p.get("era") not in ERAS:
            err(f"{where}: era '{p.get('era')}'")
        for row in p.get("life", []) + p.get("nt", []):
            m = XREF.fullmatch(row[0].strip()) if row else None
            if not m:
                err(f"{where}: 구절 형식 오류 '{row[0] if row else row}' (예: '창 12:1-4')")
            elif (int(m.group(2)), int(m.group(3))) not in verses(KO_ABBR[m.group(1)]):
                err(f"{where}: 없는 구절 {row[0]}")
        if p.get("place") and p["place"] not in places:
            err(f"{where}: place '{p['place']}'가 work/places.txt에 없음")
    return errs, warns


def main():
    args = sys.argv[1:] or ["all"]
    ids = IDS if args == ["all"] else args
    bad = False
    for bid in ids:
        if bid not in IDS:
            print(f"알 수 없는 id {bid}")
            bad = True
            continue
        errs, warns = validate(bid)
        d = {}
        p = ROOT / "content" / f"{bid}.json"
        if p.exists():
            try:
                d = json.loads(p.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                pass
        print(f"== {bid}: terms={len(d.get('terms', []))} boxes={len(d.get('boxes', []))} figures={len(d.get('figures', []))} headings={len(d.get('headings', []))} errors={len(errs)} warnings={len(warns)}")
        for e in errs:
            print("  ERROR", e)
        for w in warns[:40]:
            print("  WARN ", w)
        bad |= bool(errs)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
