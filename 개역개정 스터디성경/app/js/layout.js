// Turns a part of the Bible (front matter, a book, the New Testament title) into blocks and packs
// them into fixed-size pages by measuring them in a hidden page. Display uses the same HTML builders.

import { lib, esc, R, parse, verseText, tokenize, termMarks, redRange, label, xrefRegex } from "./data.js";
import { staticMap } from "./map.js";
import { FRONT } from "./front.js";

// ---------- parts ----------

export function partsList() {
  const parts = [{ id: "front", kind: "front", startRight: true }];
  for (const b of lib.books) {
    if (b.id === "Matt") parts.push({ id: "nt", kind: "nt" });
    parts.push({ id: b.id, kind: "book", book: b });
  }
  return parts;
}

// Inline formatting for study prose: **bold** and Korean verse references become links.
export function rich(s) {
  let h = esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  h = h.replace(xrefRegex(), (m, ab, c, v) => {
    const bk = lib.byAbbr.get(ab);
    return bk ? `<a class="xr" href="#" data-go="${R(bk.id, +c, +v)}">${m}</a>` : m;
  });
  return h;
}

function blocksFor(part, settings) {
  if (part.kind === "front") {
    return [{ type: "bibleCover" }, { type: "break" }, { type: "prayer" }, { type: "break" }, { type: "creed" }, { type: "break" },
      { type: "colophon" }, { type: "break" }, { type: "toc", t: "OT" }];
  }
  if (part.kind === "nt") return [{ type: "ntCover" }, { type: "break" }, { type: "toc", t: "NT" }];

  const b = part.book;
  const st = lib.study.get(b.id) || { headings: [], boxes: [], figures: [] };
  const blocks = [{ type: "bookCover", b }, { type: "break" }];
  const intro = st.intro;
  blocks.push({ type: "introTitle", b });
  if (intro) {
    const sec = [["저자", intro.author], ["기록 연대", intro.date], ["주제", intro.theme], ["기록 목적", intro.purpose], ["특징", intro.features]];
    for (const [k, v] of sec) if (v) blocks.push({ type: "introSec", label: k, text: v, key: `${b.id}.intro.${k}` });
    if (intro.keyVerses?.length) blocks.push({ type: "introSec", label: "핵심 구절", text: intro.keyVerses.join(" · "), key: `${b.id}.intro.key` });
    if (intro.outline?.length) blocks.push({ type: "outline", b, rows: intro.outline });
  } else {
    blocks.push({ type: "introSec", label: "안내", text: "이 권의 서론과 해설은 준비 중입니다." });
  }
  blocks.push({ type: "break" }, { type: "bookHead", b });

  const heads = new Map(st.headings.map(h => [h[0], h]));
  const boxes = groupBy(st.boxes, x => x.after);
  const figs = groupBy(st.figures, x => x.after);
  for (let c = 1; c <= b.chapters; c++) {
    for (let v = 1; v <= b.v[c - 1]; v++) {
      const cv = `${c}:${v}`;
      const ref = R(b.id, c, v);
      const h = heads.get(cv);
      if (h) blocks.push({ type: "heading", text: h[1], par: h[2] });
      const main = verseText(ref, settings.main) ? settings.main : "krv";
      blocks.push({ type: "verse", ref, ed: main, chap: v === 1 ? c : 0, ps: b.id === "Ps" });
      const par = settings.par;
      if (par !== "none" && par !== main && verseText(ref, par)) blocks.push({ type: "verse", ref, ed: par, sub: true });
      for (const x of boxes.get(cv) || []) blocks.push({ type: "box", ...x, key: `${b.id}.box.${x.after}` });
      for (const x of figs.get(cv) || []) blocks.push({ type: "figure", ...x, book: b.id });
    }
  }
  return blocks;
}

function groupBy(list, key) {
  const m = new Map();
  for (const x of list) { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}

// ---------- block HTML ----------

export function blockHtml(b, ann, from = 0, to = Infinity) {
  switch (b.type) {
    case "bibleCover": return FRONT.cover();
    case "prayer": return FRONT.prayer();
    case "creed": return FRONT.creed();
    case "colophon": return FRONT.colophon();
    case "ntCover": return FRONT.ntCover();
    case "toc": return FRONT.toc(b.t);
    case "bookCover":
      return `<div class="cover book-cover ${b.b.t}"><div class="cv-rule"></div><div class="cv-ko">${esc(b.b.ko)}</div>
        <div class="cv-gr" ${b.b.t === "OT" ? 'dir="rtl" lang="he"' : ""}>${esc(b.b.orig)}</div><div class="cv-en">${esc(b.b.en)}</div><div class="cv-rule"></div>
        <div class="cv-meta">${b.b.t === "OT" ? "구약" : "신약"} · ${b.b.chapters}${b.b.id === "Ps" ? "편" : "장"}</div></div>`;
    case "introTitle":
      return `<h2 class="intro-title">${esc(b.b.ko)} 서론</h2>`;
    case "introSec":
      return `<div class="intro-sec vs note" data-ref="${b.key}" data-ed="note"><span class="intro-label">${esc(b.label)}</span>${richTokens(b.text, b.key, ann)}</div>`;
    case "outline":
      return `<div class="outline"><div class="ol-title">개요</div>${b.rows.map(r =>
        `<a class="ol-row" href="#" data-go="${R(b.b.id, ...r[0].split("-")[0].split(":").map(Number))}"><span class="ol-r">${esc(rangeLabel(b.b, r[0]))}</span><span>${esc(r[1])}</span></a>`).join("")}</div>`;
    case "bookHead":
      return `<div class="book-head"><span class="bh-ko">${esc(b.b.ko.split("").join(" "))}</span><span class="bh-en">${esc(b.b.en.toUpperCase())}</span></div>`;
    case "heading":
      return `<div class="sec-head"><span class="sh-t">${esc(b.text)}</span>${b.par ? `<span class="sh-p">${rich(b.par)}</span>` : ""}</div>`;
    case "box":
      return `<aside class="study-box"><div class="sb-h"><b>${esc(b.ref)}</b> ${esc(b.title)}</div><p class="vs note" data-ref="${b.key}" data-ed="note">${richTokens(b.body, b.key, ann)}</p></aside>`;
    case "figure":
      return figureHtml(b);
    case "verse":
      return verseHtml(b, ann, from, to);
    default:
      return "";
  }
}

// Study prose split into word spans, so it can be highlighted and written on like verses.
function richTokens(text, key, ann) {
  const words = rich(text).replace(/<[^>]+>/g, "").split(/\s+/).filter(Boolean);
  const hls = ann.reanchor("note", key, words);
  let i = 0;
  return rich(text).split(/(<[^>]+>)/).map(part => {
    if (part.startsWith("<")) return part;
    return part.split(/(\s+)/).map(w => {
      if (!w || /^\s+$/.test(w)) return w;
      const hl = hls.find(h => i >= h.a && i <= h.b);
      return `<span class="t${hl ? ` hl-${hl.c}` : ""}" data-i="${i++}">${w}</span>`;
    }).join("");
  }).join("");
}

// "10:1-10:42" -> "10장", "19:1-23:39" -> "19–23장"; partial chapters keep verse numbers.
function rangeLabel(book, range) {
  const [a, z = a] = range.split("-");
  const [ac, av] = a.split(":").map(Number);
  let [zc, zv] = z.split(":").map(Number);
  if (zv === undefined) { zv = zc; zc = ac; }
  const unit = book.id === "Ps" ? "편" : "장";
  if (av === 1 && zv === book.v[zc - 1]) return ac === zc ? `${ac}${unit}` : `${ac}–${zc}${unit}`;
  return ac === zc ? `${ac}:${av}–${zv}` : `${ac}:${av}–${zc}:${zv}`;
}

function figureHtml(f) {
  const cap = `<figcaption><b>${esc(f.title)}</b> ${rich(f.caption || "")}</figcaption>`;
  if (f.kind === "map") {
    return `<figure class="fig map-fig" data-map="${esc(JSON.stringify({ places: f.places, route: !!f.route, title: f.title }))}">
      ${staticMap(f.places || [], { route: f.route })}${cap}<span class="fig-hint">누르면 성경 지도</span></figure>`;
  }
  if (f.kind === "photo") {
    const img = lib.images[f.query];
    if (!img) return `<figure class="fig"><div class="fig-missing">${esc(f.title)}</div>${cap}</figure>`;
    return `<figure class="fig photo-fig" data-photo="${esc(f.query)}"><div class="ph" style="aspect-ratio:${img.w}/${img.h}"><img src="${esc(img.src)}" alt="${esc(f.title)}" loading="lazy"></div>
      ${cap}<div class="credit">${esc(img.credit)} · ${esc(img.license)}</div></figure>`;
  }
  const rows = (f.rows || []).map(r => `<tr>${r.map(c => `<td>${rich(String(c))}</td>`).join("")}</tr>`).join("");
  const head = f.head ? `<thead><tr>${f.head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>` : "";
  return `<figure class="fig table-fig ${f.kind}"><div class="tb-title">${esc(f.title)}</div><table>${head}<tbody>${rows}</tbody></table>${f.caption ? `<figcaption>${rich(f.caption)}</figcaption>` : ""}</figure>`;
}

export function verseTokens(b) { return tokenize(verseText(b.ref, b.ed)); }

function verseHtml(b, ann, from, to) {
  const toks = verseTokens(b);
  const end = Math.min(to, toks.length);
  const { b: bid, c, v } = parse(b.ref);
  const terms = termMarks(bid, b.ed).get(`${c}:${v}`);
  const red = b.ed === "krv" ? redRange(b.ref) : null;
  const hls = ann.highlightsFor(b.ed, b.ref);
  const parts = [];
  for (let i = from; i < end; i++) {
    const cls = ["t"];
    let extra = "";
    if (terms?.[i]) { cls.push(terms[i][0] === "@" ? "tm pl" : terms[i][0] === "#" ? "tm pp" : "tm"); extra = ` data-term="${terms[i]}"`; }
    if (red && i >= red[0] && i <= red[1]) cls.push("wj");
    const hl = hls.find(h => i >= h.a && i <= h.b);
    if (hl) cls.push(`hl-${hl.c}`);
    parts.push(`<span class="${cls.join(" ")}" data-i="${i}"${extra}>${esc(toks[i].s)}${i < end - 1 ? " " : ""}</span>`);
  }
  const head = from > 0 || b.sub ? ""
    : b.chap ? `<button class="dc" data-verse="${b.ref}" aria-label="${c}${b.ps ? "편" : "장"} ${v}절">${c}</button>`
    : `<button class="vn" data-verse="${b.ref}">${v}</button>`;
  const memo = end === toks.length && !b.sub && ann.memosFor(b.ref).length ? `<button class="memo-mark" data-memo="${b.ref}" aria-label="메모">✎</button>` : "";
  const cls = ["vs", b.sub ? "sub" : "", from > 0 ? "cont" : "", b.chap && from === 0 ? "first" : ""].filter(Boolean).join(" ");
  return `<p class="${cls}" data-ref="${b.ref}" data-ed="${b.ed}"${b.ed === "krv" ? "" : ' lang="en"'}>${head}${parts.join("")}${memo}</p>`;
}

// ---------- pagination ----------

const TOP = new Set(["bookHead"]);
const FULL = new Set(["bibleCover", "bookCover", "ntCover", "colophon", "prayer", "creed"]);

function shell(geom) {
  const cols = Array.from({ length: geom.cols }, () => `<div class="col"></div>`).join("");
  return `<header class="rh"><span class="rh-l">0</span><span class="rh-c"></span><span class="rh-r"></span></header>
    <div class="ptop"></div><div class="pbody">${cols}</div><footer class="pf"></footer>`;
}

// Paginates one part. Yields to the browser every few milliseconds so the reader stays responsive.
export async function paginate(part, settings, ann, geom, host, { pause = null, slice = 30 } = {}) {
  const blocks = blocksFor(part, settings);
  const page = document.createElement("div");
  page.className = `page measure cols-${geom.cols}`;
  page.style.cssText = `width:${geom.w}px;height:${geom.h}px;--fs:${geom.fs}px;--lh:${geom.lh}`;
  page.innerHTML = shell(geom);
  host.appendChild(page);
  const colEls = [...page.querySelectorAll(".col")];
  const topEl = page.querySelector(".ptop");

  const pages = [];
  let cur = null, colIdx = 0;
  const newPage = () => {
    cur = { cols: Array.from({ length: geom.cols }, () => []) };
    pages.push(cur);
    colIdx = 0;
    colEls.forEach(el => { el.innerHTML = ""; });
    topEl.innerHTML = "";
  };
  const empty = () => !cur.full && !cur.top && cur.cols.every(x => !x.length);
  const nextCol = () => { if (++colIdx >= geom.cols) newPage(); };
  const fits = el => el.scrollHeight <= el.clientHeight + 1;
  const place = item => {
    const el = colEls[colIdx];
    el.insertAdjacentHTML("beforeend", blockHtml(item.b, ann, item.from, item.to));
    if (fits(el)) { cur.cols[colIdx].push(item); return true; }
    el.lastElementChild.remove();
    return false;
  };
  const colEmpty = () => cur.cols[colIdx].length === 0;

  newPage();
  let t0 = performance.now();
  for (let bi = 0; bi < blocks.length; bi++) {
    if (performance.now() - t0 > slice) {
      await new Promise(r => setTimeout(r, 0));
      if (pause) await pause();
      t0 = performance.now();
    }
    const b = blocks[bi];
    if (b.type === "break") { if (!empty()) newPage(); continue; }
    if (FULL.has(b.type)) { if (!empty()) newPage(); cur.full = { b }; continue; }
    if (TOP.has(b.type)) {
      if (!empty()) newPage();
      cur.top = { b };
      topEl.innerHTML = blockHtml(b, ann);
      continue;
    }
    if (b.type !== "verse") {
      if (place({ b })) {
        if (b.type === "heading" && blocks[bi + 1]?.type === "verse") {
          const el = colEls[colIdx];
          el.insertAdjacentHTML("beforeend", blockHtml(blocks[bi + 1], ann, 0, 3));
          const ok = fits(el);
          el.lastElementChild.remove();
          if (!ok && cur.cols[colIdx].length > 1) { cur.cols[colIdx].pop(); el.lastElementChild.remove(); nextCol(); place({ b }); }
        }
        continue;
      }
      if (!colEmpty()) { nextCol(); if (place({ b })) continue; }
      colEls[colIdx].insertAdjacentHTML("beforeend", blockHtml(b, ann));
      cur.cols[colIdx].push({ b });
      nextCol();
      continue;
    }
    const n = verseTokens(b).length;
    let from = 0;
    if (!n) { place({ b, from: 0, to: 0 }) || (nextCol(), place({ b, from: 0, to: 0 })); continue; }
    while (from < n) {
      if (place({ b, from, to: n })) break;
      let lo = from, hi = n - 1;
      const el = colEls[colIdx];
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        el.insertAdjacentHTML("beforeend", blockHtml(b, ann, from, mid));
        const ok = fits(el);
        el.lastElementChild.remove();
        if (ok) lo = mid; else hi = mid - 1;
      }
      if (lo - from >= 3 && n - lo >= 2) { place({ b, from, to: lo }); from = lo; }
      else if (colEmpty()) {
        const k = Math.max(lo, from + 1);
        if (!place({ b, from, to: k })) cur.cols[colIdx].push({ b, from, to: k });
        from = k;
      }
      nextCol();
    }
  }
  if (pages.length > 1 && empty()) pages.pop();
  page.remove();

  const index = new Map();
  pages.forEach((p, pi) => {
    const refs = [];
    for (const it of p.cols.flat()) if (it.b.type === "verse" && !it.b.sub) { refs.push(it.b.ref); if (!index.has(it.b.ref)) index.set(it.b.ref, pi); }
    p.first = refs[0];
    p.last = refs[refs.length - 1];
    p.part = part.id;
  });
  return { part, pages, index };
}

// ---------- page HTML ----------

function headLabel(a, z) {
  const x = parse(a), y = parse(z);
  const bk = lib.byId.get(x.b);
  const unit = bk.id === "Ps" ? "편" : "";
  if (x.c === y.c) return `${bk.ko} ${x.c}${unit}:${x.v}${a !== z ? `–${y.v}` : ""}`;
  return `${bk.ko} ${x.c}:${x.v} – ${y.c}:${y.v}`;
}

export function pageHtml(p, ann, geom, side, num) {
  const style = `width:${geom.w}px;height:${geom.h}px;--fs:${geom.fs}px;--lh:${geom.lh}`;
  if (!p || p.blank) return `<div class="page blank ${side}" style="${style}"></div>`;
  if (p.full) return `<div class="page ${side} is-cover cols-${geom.cols}" style="${style}">${blockHtml(p.full.b, ann)}</div>`;
  const head = p.first ? headLabel(p.first, p.last) : "";
  const cols = p.cols.map(items => `<div class="col">${items.map(it => blockHtml(it.b, ann, it.from, it.to)).join("")}</div>`).join("");
  const mark = ann.isBookmarked(p.first) ? `<div class="ribbon" title="책갈피"></div>` : "";
  const n = num ?? "";
  return `<div class="page ${side} cols-${geom.cols}" style="${style}">${mark}
    <header class="rh"><span class="rh-l">${side === "left" ? n : ""}</span><span class="rh-c">${head}</span><span class="rh-r">${side === "right" ? n : ""}</span></header>
    <div class="ptop">${p.top ? blockHtml(p.top.b, ann) : ""}</div>
    <div class="pbody">${cols}</div><footer class="pf"></footer><canvas class="ink"></canvas></div>`;
}

export { label };
