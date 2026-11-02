// Loading and addressing. A verse reference is "Book.c.v" (e.g. "Matt.2.1"); study files use
// local "c:v" refs and Korean abbreviations ("사 7:14") for other books.

export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const cache = new Map();
export async function json(url, fallback = null) {
  if (cache.has(url)) return cache.get(url);
  const p = fetch(url).then(r => (r.ok ? r.json() : fallback)).catch(() => fallback);
  cache.set(url, p);
  return p;
}
export async function text(url) {
  try { const r = await fetch(url); return r.ok ? await r.text() : ""; } catch { return ""; }
}

export const lib = {
  books: [], byId: new Map(), byAbbr: new Map(),
  text: new Map(),     // id -> {c: [[ [krv, kjv], ... ], ...], red: {"c:v": "a" | [from, to]}}
  study: new Map(),    // id -> study content (intro, headings, terms, boxes, figures, people)
  marks: new Map(),    // `${id}|${ed}` -> Map("c:v" -> [termId | null per token])
  user: { niv: {} },   // pasted NIV: "Book.c.v" -> text
  placesByVerse: new Map(), // id -> Map("c:v" -> [place]) for place names in the text
  placeById: new Map(),
  placeImages: {},
  images: {},          // query -> {src, credit, license, page}
};

export async function loadBooks() {
  lib.books = await json("data/books.json", []);
  lib.books.forEach((b, i) => {
    b.i = i;
    b.chapters = b.v.length;
    lib.byId.set(b.id, b);
    lib.byAbbr.set(b.ab, b);
    lib.byAbbr.set(b.ko, b);
  });
  lib.images = await json("data/images.json", {});
  lib.placeImages = await json("data/place_images.json", {});
}

export async function loadBook(id) {
  if (lib.text.has(id) && lib.study.has(id)) return;
  const [t, s] = await Promise.all([json(`data/text/${id}.json`, { c: [], red: {} }), json(`data/study/${id}.json`, null)]);
  lib.text.set(id, t);
  lib.study.set(id, normalizeStudy(s || {}, id));
}

function normalizeStudy(s, id) {
  s.intro ||= null;
  s.headings ||= [];
  s.terms ||= [];
  s.boxes ||= [];
  s.figures ||= [];
  s.people ||= [];
  s.termById = new Map(s.terms.map(t => [t.id, t]));
  s.book = id;
  return s;
}

// ---------- references ----------

export const R = (b, c, v) => `${b}.${c}.${v}`;
export function parse(ref) {
  const [b, c, v] = ref.split(".");
  return { b, c: +c, v: +v };
}
export function cmp(a, b) {
  const x = parse(a), y = parse(b);
  return lib.byId.get(x.b).i - lib.byId.get(y.b).i || x.c - y.c || x.v - y.v;
}
export function exists(ref) {
  const { b, c, v } = parse(ref);
  const bk = lib.byId.get(b);
  return !!bk && c >= 1 && c <= bk.chapters && v >= 1 && v <= bk.v[c - 1];
}
export function label(ref, { full = false } = {}) {
  const { b, c, v } = parse(ref);
  const bk = lib.byId.get(b);
  if (Number.isNaN(c)) return `${bk.ko} ${ref.includes(".intro.") ? "서론" : "해설"}`;
  return `${full ? bk.ko : bk.ab} ${c}:${v}`;
}

// Korean references inside study text: "사 7:14", "마태복음 5:3-12", "롬 8:1-9:3".
let abbrRe = null;
export function xrefRegex() {
  if (!abbrRe) {
    const names = [...lib.byAbbr.keys()].sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    abbrRe = new RegExp(`(?<![가-힣])(${names.join("|")})\\s?(\\d+):(\\d+)(?:-(\\d+)(?::(\\d+))?)?`, "g");
  }
  abbrRe.lastIndex = 0;
  return abbrRe;
}
export function parseKoRef(s) {
  const re = xrefRegex();
  const m = re.exec(s.trim());
  if (!m) return null;
  const bk = lib.byAbbr.get(m[1]);
  return { ref: R(bk.id, +m[2], +m[3]), text: m[0] };
}

// Local "c:v" of a book to a full ref.
export const local = (id, cv) => { const [c, v] = cv.split(":"); return R(id, +c, +v); };

export function inScope(c, v, scope) {
  return scope.some(s => {
    const [a, z = a] = s.split("-");
    const [ac, av] = a.split(":").map(Number);
    let [zc, zv] = z.split(":").map(Number);
    if (zv === undefined) { zv = zc; zc = ac; }
    return (c > ac || (c === ac && v >= av)) && (c < zc || (c === zc && v <= zv));
  });
}

// ---------- verse text ----------

export const EDITIONS = { krv: "개역한글", kjv: "KJV", niv: "NIV" };
export function verseText(ref, ed = "krv") {
  const { b, c, v } = parse(ref);
  if (ed === "niv") return lib.user.niv[ref] || "";
  const row = lib.text.get(b)?.c[c - 1]?.[v - 1];
  return row ? row[ed === "kjv" ? 1 : 0] : "";
}
export async function verseTextAsync(ref, ed = "krv") {
  await loadBook(parse(ref).b);
  return verseText(ref, ed);
}

export function tokenize(s) {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(s))) out.push({ s: m[0], a: m.index, b: m.index + m[0].length });
  return out;
}

// Which tokens of each verse carry a study term. Longer anchors win.
export function termMarks(id, ed) {
  const key = `${id}|${ed}`;
  if (lib.marks.has(key)) return lib.marks.get(key);
  const st = lib.study.get(id);
  const out = new Map();
  if (st && ed !== "niv") {
    const anchors = [];
    for (const t of st.terms) for (const a of t.anchors?.[ed] || []) anchors.push({ t, a });
    anchors.sort((x, y) => y.a.length - x.a.length);
    const book = lib.byId.get(id);
    for (const { t, a } of anchors) {
      for (const s of t.scope) {
        const [from] = s.split("-");
        const [fc] = from.split(":").map(Number);
        const to = s.includes("-") ? s.split("-")[1] : from;
        const tc = to.includes(":") ? +to.split(":")[0] : fc;
        for (let c = fc; c <= tc && c <= book.chapters; c++) {
          for (let v = 1; v <= book.v[c - 1]; v++) {
            if (!inScope(c, v, [s])) continue;
            const txt = verseText(R(id, c, v), ed);
            let at = txt.indexOf(a);
            if (at < 0) continue;
            const toks = tokenize(txt);
            const k = `${c}:${v}`;
            const marks = out.get(k) || new Array(toks.length).fill(null);
            while (at >= 0) {
              const end = at + a.length;
              const hit = toks.map((tk, i) => (tk.b > at && tk.a < end ? i : -1)).filter(i => i >= 0);
              if (hit.every(i => marks[i] === null)) hit.forEach(i => { marks[i] = t.id; });
              at = txt.indexOf(a, end);
            }
            out.set(k, marks);
          }
        }
      }
    }
  }
  // Place names are marked in the verses where that place is actually meant (OpenBible.info),
  // wherever a study term has not already claimed the words.
  if (ed === "krv") {
    for (const [cv, places] of lib.placesByVerse.get(id) || []) {
      const [c, v] = cv.split(":").map(Number);
      const txt = verseText(R(id, c, v), ed);
      if (!txt) continue;
      const toks = tokenize(txt);
      const marks = out.get(cv) || new Array(toks.length).fill(null);
      for (const p of places) {
        let at = txt.indexOf(p.ko);
        while (at >= 0) {
          const end = at + p.ko.length;
          const hit = toks.map((tk, i) => (tk.b > at && tk.a < end ? i : -1)).filter(i => i >= 0);
          if (hit.length && hit.every(i => marks[i] === null)) hit.forEach(i => { marks[i] = `@${p.id}`; });
          at = txt.indexOf(p.ko, end);
        }
      }
      if (marks.some(Boolean)) out.set(cv, marks);
    }
  }
  lib.marks.set(key, out);
  return out;
}

export function indexPlaces(places) {
  for (const p of places) {
    lib.placeById.set(p.id, p);
    if (!p.ko || p.ko.length < 2) continue;
    for (const r of p.refs) {
      const { b, c, v } = parse(r);
      if (!lib.placesByVerse.has(b)) lib.placesByVerse.set(b, new Map());
      const m = lib.placesByVerse.get(b);
      const k = `${c}:${v}`;
      if (!m.has(k)) m.set(k, []);
      if (!m.get(k).includes(p)) m.get(k).push(p);
    }
  }
  // Longer names first, so "갈릴리 바다" wins over "갈릴리".
  for (const m of lib.placesByVerse.values()) for (const list of m.values()) list.sort((a, b) => b.ko.length - a.ko.length);
}

// Jesus' words: which token indices are red.
export function redRange(ref) {
  const { b, c, v } = parse(ref);
  const r = lib.text.get(b)?.red?.[`${c}:${v}`];
  if (!r) return null;
  return r === "a" ? [0, Infinity] : r;
}

// ---------- original-language data (lazy) ----------

export async function words(id) { return json(`data/words/${id}.json`, {}); }
export async function lexicon(lang) { return json(`data/lex/${lang === "H" ? "hebrew" : "greek"}.json`, {}); }
export async function crossrefs(id) { return json(`data/xref/${id}.json`, {}); }
export async function occurrences(strong) {
  const bucket = await json(`data/occ/${strong[0]}${Math.floor(+strong.slice(1) / 100)}.json`, {});
  return bucket[strong] || [];
}
