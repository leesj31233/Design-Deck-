// Everything the reader adds — pasted translations, highlights, memos, ink, bookmarks,
// settings and the reading position — lives in this browser's localStorage.

const PREFIX = "bs3.";

function get(key, fallback) {
  try { const v = localStorage.getItem(PREFIX + key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function set(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
}

export const DEFAULTS = { fs: 16, lh: 1.75, theme: "paper", cols: "auto", main: "krv", par: "none", anim: true };

export function loadSettings() { return { ...DEFAULTS, ...get("settings", {}) }; }
export function saveSettings(s) { set("settings", s); }
export function loadPosition() { return get("pos", null); }
export function savePosition(ref) { set("pos", ref); }
export function loadText(ed) { return get(`text.${ed}`, null); }
export function saveText(ed, map) { return set(`text.${ed}`, map); }

const uid = () => Math.random().toString(36).slice(2, 10);

// A second copy of the annotations in IndexedDB, so they survive if localStorage is cleared.
const IDB = { db: null };
function idb() {
  return (IDB.db ||= new Promise((resolve, reject) => {
    const r = indexedDB.open("bible-study", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
async function idbPut(key, value) {
  try { const db = await idb(); db.transaction("kv", "readwrite").objectStore("kv").put(value, key); } catch { /* unavailable */ }
}
async function idbGet(key) {
  try {
    const db = await idb();
    return await new Promise(res => { const q = db.transaction("kv").objectStore("kv").get(key); q.onsuccess = () => res(q.result); q.onerror = () => res(null); });
  } catch { return null; }
}

// Highlights, memos, handwriting and bookmarks. Keys and anchors stay the same across app updates:
// verse marks point at word positions of the fixed 개역한글/KJV text, and marks on study prose also keep
// the words they cover so they can find their place again if that prose is revised.
export class Annotations {
  constructor(onRestore) {
    const empty = ["hl", "memos", "ink", "marks"].every(k => localStorage.getItem(PREFIX + k) === null);
    this.hl = get("hl", {});        // "ed|ref" -> [{a, b, c, txt?}]
    this.memos = get("memos", {});  // ref -> [{id, text, quote, at}]
    this.ink = get("ink", []);      // [{id, ed, ref, i, w?, c, mode, pts: [[x, y] in em]}]
    this.marks = get("marks", []);  // [{ref, at}]
    this.undoStack = [];
    this.redoStack = [];
    if (empty) idbGet("annotations").then(d => { if (d) { this.load(JSON.parse(d)); this.persist(); onRestore?.(); } });
  }
  snapshot() { return JSON.stringify({ hl: this.hl, memos: this.memos, ink: this.ink, marks: this.marks }); }
  load(d) { Object.assign(this, { hl: d.hl || {}, memos: d.memos || {}, ink: d.ink || [], marks: d.marks || [] }); }
  persist() {
    set("hl", this.hl); set("memos", this.memos); set("ink", this.ink); set("marks", this.marks);
    clearTimeout(this.idbTimer);
    this.idbTimer = setTimeout(() => idbPut("annotations", this.snapshot()), 800);
  }
  // Every change records the state before it, for Ctrl+Z.
  change(tag, fn) {
    const now = Date.now();
    const top = this.undoStack[this.undoStack.length - 1];
    if (!(tag && top?.tag === tag && now - top.at < 4000)) {
      this.undoStack.push({ s: this.snapshot(), tag, at: now });
      if (this.undoStack.length > 100) this.undoStack.shift();
    } else top.at = now;
    this.redoStack.length = 0;
    fn();
    this.persist();
  }
  undo() {
    const top = this.undoStack.pop();
    if (!top) return false;
    this.redoStack.push({ s: this.snapshot() });
    this.load(JSON.parse(top.s));
    this.persist();
    return true;
  }
  redo() {
    const top = this.redoStack.pop();
    if (!top) return false;
    this.undoStack.push({ s: this.snapshot() });
    this.load(JSON.parse(top.s));
    this.persist();
    return true;
  }
  save() { this.persist(); }

  highlightsFor(ed, ref) { return this.hl[`${ed}|${ref}`] || []; }
  addHighlight(ed, ref, a, b, c, txt) {
    this.change(null, () => {
      const key = `${ed}|${ref}`;
      const rest = this.removeRange(this.hl[key] || [], a, b);
      this.hl[key] = [...rest, { a, b, c, ...(txt ? { txt } : {}) }].sort((x, y) => x.a - y.a);
    });
  }
  clearHighlight(ed, ref, a, b) {
    this.change(null, () => {
      const key = `${ed}|${ref}`;
      this.hl[key] = this.removeRange(this.hl[key] || [], a, b);
      if (!this.hl[key].length) delete this.hl[key];
    });
  }
  removeRange(list, a, b) {
    const out = [];
    for (const h of list) {
      if (h.b < a || h.a > b) { out.push(h); continue; }
      if (h.a < a) out.push({ ...h, b: a - 1, txt: undefined });
      if (h.b > b) out.push({ ...h, a: b + 1, txt: undefined });
    }
    return out;
  }
  // If revised prose moved the words, put each highlight back on the words it was made on.
  reanchor(ed, ref, words) {
    const list = this.hl[`${ed}|${ref}`];
    if (!list) return [];
    return list.map(h => {
      if (!h.txt || words.slice(h.a, h.b + 1).join(" ") === h.txt) return h;
      const want = h.txt.split(" ");
      for (let i = 0; i + want.length <= words.length; i++) {
        if (want.every((w, k) => words[i + k] === w)) return { ...h, a: i, b: i + want.length - 1 };
      }
      return h;
    });
  }

  memosFor(ref) { return this.memos[ref] || []; }
  addMemo(ref, text, quote = "") { this.change(null, () => { (this.memos[ref] ||= []).push({ id: uid(), text, quote, at: Date.now() }); }); }
  updateMemo(ref, id, text) {
    const m = this.memosFor(ref).find(x => x.id === id);
    if (m) this.change(`memo:${id}`, () => { m.text = text; m.at = Date.now(); });
  }
  deleteMemo(ref, id) {
    this.change(null, () => {
      this.memos[ref] = this.memosFor(ref).filter(x => x.id !== id);
      if (!this.memos[ref].length) delete this.memos[ref];
    });
  }

  addStroke(s) { this.change(null, () => { this.ink.push({ id: uid(), ...s }); }); }
  deleteStroke(id) { this.change(null, () => { this.ink = this.ink.filter(s => s.id !== id); }); }

  isBookmarked(ref) { return !!ref && this.marks.some(m => m.ref === ref); }
  toggleBookmark(ref) {
    this.change(null, () => {
      if (this.isBookmarked(ref)) this.marks = this.marks.filter(m => m.ref !== ref);
      else this.marks.push({ ref, at: Date.now() });
    });
  }

  exportAll() {
    return JSON.stringify({ v: 1, hl: this.hl, memos: this.memos, ink: this.ink, marks: this.marks }, null, 1);
  }
  importAll(json) {
    const d = JSON.parse(json);
    this.change(null, () => this.load(d));
  }
}

// Pasted text: "Matthew 2:1 …", "Gen 1:1 …", "마 2:2 …", or a "Matthew 2" line followed by "1 …" lines.
export function parseText(text, lib) {
  const norm = x => x.toLowerCase().replace(/[\s.]/g, "");
  const find = name => {
    const n = norm(name);
    if (!n) return null;
    return lib.books.find(b => norm(b.en) === n || norm(b.id) === n || b.ko === name.trim() || b.ab === name.trim())
      || (n.length >= 3 ? lib.books.find(b => norm(b.en).startsWith(n)) : null);
  };
  const out = {};
  let book = null, chapter = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const full = line.match(/^((?:[1-3]\s?)?[^\d:]+?)\s*(\d+)\s*:\s*(\d+)\s+(.+)$/);
    if (full && find(full[1])) {
      book = find(full[1]); chapter = +full[2];
      out[`${book.id}.${chapter}.${+full[3]}`] = full[4].trim();
      continue;
    }
    const head = line.match(/^((?:[1-3]\s?)?[^\d:]+?)\s+(\d+)$/) || line.match(/^chapter\s+(\d+)$/i);
    if (head) {
      if (head.length === 3 && find(head[1])) { book = find(head[1]); chapter = +head[2]; continue; }
      if (head.length === 2) { chapter = +head[1]; continue; }
    }
    const short = line.match(/^(\d+)\s*[.)]?\s+(.+)$/);
    if (short && book && chapter) out[`${book.id}.${chapter}.${+short[1]}`] = short[2].trim();
  }
  return out;
}
