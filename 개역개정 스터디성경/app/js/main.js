import { lib, loadBooks, loadBook, parse, R, label, indexPlaces } from "./data.js";
import { partsList, paginate, pageHtml } from "./layout.js";
import { Annotations, loadSettings, saveSettings, loadPosition, savePosition, loadText } from "./store.js";
import { createStudy } from "./study.js";
import { attachPen, drawInk, INK_COLORS } from "./ink.js";
import { createLeaf } from "./curl.js";
import { loadGeo, openMap, geo } from "./map.js";
import { pageNumbers } from "./front.js";
import { createSearch } from "./search.js";
import { openPeople } from "./people.js";
import { exportPdf } from "./print.js";

const $ = s => document.querySelector(s);
const bookEl = $("#book");
const settings = loadSettings();
const ann = new Annotations(() => refresh());
const parts = [];
const S = {
  geom: null, layouts: new Map(), pos: { pi: 0, s: 0 }, busy: false,
  tool: null, toolMode: "pen", toolColor: INK_COLORS[0], counts: {}, total: 0,
};
let study, search;

// ---------- geometry ----------

function computeGeom() {
  const W = innerWidth, H = innerHeight;
  const phone = W < 640 || (H < 500 && W < 1000 && W / H > 1.6 && matchMedia("(pointer: coarse)").matches && W < 700);
  const top = phone ? 0 : 52, bottom = phone ? 0 : 46;
  const availH = H - top - bottom - (phone ? 0 : 26);
  const spread = !phone && W / H >= 1.12 && W >= 760;
  let w, h;
  if (phone) { w = W; h = H; }
  else if (spread) { h = availH; w = Math.min(Math.round(h * 0.72), Math.floor((W - 150) / 2)); }
  else { h = availH; w = Math.min(Math.round(h * 0.74), W - 110); }
  const cols = settings.cols === "auto" ? (w >= 500 ? 2 : 1) : settings.cols;
  return { mode: spread ? "spread" : "single", phone, w, h, cols, fs: settings.fs, lh: settings.lh };
}
const geomKey = g => [g.mode, g.w, g.h, g.cols, g.fs, g.lh, settings.main, settings.par].join("|");

// ---------- parts and pages ----------

// Background layout yields to the reader: it waits while a page is turning and for a moment
// after any input, and works in short slices so animation frames are never starved.
S.lastInput = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function yieldToReader() {
  while (S.busy || performance.now() - S.lastInput < 1200) await sleep(160);
  if (window.requestIdleCallback) await new Promise(r => requestIdleCallback(r, { timeout: 300 }));
}
["pointerdown", "keydown", "wheel"].forEach(t => addEventListener(t, () => { S.lastInput = performance.now(); }, { capture: true, passive: true }));

async function layoutOf(pi, { background = false } = {}) {
  const part = parts[pi];
  if (S.layouts.has(part.id)) return S.layouts.get(part.id);
  const job = (async () => {
    if (part.kind === "book") await loadBook(part.book.id);
    const lay = await paginate(part, settings, ann, S.geom, $("#measure"), background ? { pause: yieldToReader, slice: 8 } : {});
    lay.display = displayPages(lay);
    S.counts[part.id] = lay.display.length;
    resolved.set(part.id, lay);
    saveCounts();
    return lay;
  })();
  S.layouts.set(part.id, job);
  return job;
}

// Each part starts on a left page and ends on a right page, so a book's cover faces its introduction.
function displayPages(lay) {
  const pages = [...lay.pages];
  if (S.geom.mode !== "spread") return pages;
  if (lay.part.startRight) pages.unshift({ blank: true });
  if (pages.length % 2) pages.push({ blank: true });
  return pages;
}
const perSpread = () => (S.geom.mode === "spread" ? 2 : 1);

function countsKey() { return `bs3.counts.${geomKey(S.geom)}`; }
function loadCounts() { try { S.counts = JSON.parse(localStorage.getItem(countsKey()) || "{}"); } catch { S.counts = {}; } }
let countsTimer;
function saveCounts() {
  clearTimeout(countsTimer);
  countsTimer = setTimeout(() => { try { localStorage.setItem(countsKey(), JSON.stringify(S.counts)); } catch { /* full */ } updateNumbersAndBar(); }, 300);
}
// Estimated pages for parts not laid out yet, from verse counts.
function countOf(pi) {
  const p = parts[pi];
  if (S.counts[p.id]) return S.counts[p.id];
  if (p.kind !== "book") return 6;
  const verses = p.book.v.reduce((a, b) => a + b, 0);
  return Math.max(4, Math.round(verses / ((S.geom.w * S.geom.h) / (S.geom.fs * S.geom.fs * 95)))) + 2;
}
function offsetOf(pi) { let n = 0; for (let i = 0; i < pi; i++) n += countOf(i); return n; }

// Printed page numbers restart for each testament; front matter is unnumbered.
function pageNumber(pi, idx) {
  const part = parts[pi];
  if (part.kind !== "book") return null;
  const t = part.book.t;
  let n = 0;
  for (let i = 0; i < pi; i++) {
    const q = parts[i];
    if (q.kind === "book" && q.book.t === t) {
      if (!S.counts[q.id]) return null;
      n += S.counts[q.id];
    }
  }
  return n + idx + 1;
}
pageNumbers.of = bookId => { const pi = parts.findIndex(p => p.id === bookId); return pi < 0 ? null : pageNumber(pi, 0); };

// ---------- rendering ----------

function spreadHtml(lay, s) {
  const g = S.geom;
  const pi = parts.indexOf(lay.part);
  const pageAt = idx => pageHtml(lay.display[idx], ann, g, g.mode === "spread" ? (idx % 2 ? "right" : "left") : "right", pageNumber(pi, idx));
  if (g.mode === "spread") return [pageAt(2 * s), pageAt(2 * s + 1)];
  return [pageAt(s)];
}

// Built page elements per spread. Building a page (parsing thousands of word spans) is the
// expensive step, so spreads next to the current one are built ahead of time and a turn only
// clones or moves finished elements.
const nodeCache = new Map();
function spreadNodes(lay, s) {
  const key = `${lay.part.id}:${s}`;
  let nodes = nodeCache.get(key);
  if (!nodes) {
    const t = document.createElement("template");
    t.innerHTML = spreadHtml(lay, s).join("");
    nodes = [...t.content.children];
    nodeCache.set(key, nodes);
    if (nodeCache.size > 10) nodeCache.delete(nodeCache.keys().next().value);
  }
  return nodes;
}
function clearNodes() { nodeCache.clear(); }

function mount(nodes) {
  const g = S.geom;
  const spread = document.createElement("div");
  spread.className = `spread ${g.mode}`;
  spread.append(...nodes);
  if (g.mode === "spread") spread.insertAdjacentHTML("beforeend", `<div class="gutter"></div>`);
  bookEl.replaceChildren(spread);
  bookEl.style.setProperty("--pw", `${g.w}px`);
  bookEl.style.setProperty("--ph", `${g.h}px`);
  for (const p of nodes) if (!p._inked) { drawInk(p, ann); p._inked = true; }
}

async function render() {
  const lay = await layoutOf(S.pos.pi);
  const nSpreads = Math.ceil(lay.display.length / perSpread());
  S.pos.s = Math.max(0, Math.min(nSpreads - 1, S.pos.s));
  mount(spreadNodes(lay, S.pos.s));
  savePosition(anchor());
  updateNumbersAndBar();
  warmNeighbours();
  prefetch();
}

// Builds the previous and next spreads while the reader is idle.
function warmNeighbours() {
  const idle = window.requestIdleCallback || (f => setTimeout(f, 60));
  idle(async () => {
    for (const d of [1, -1]) {
      const t = await neighbourOf(S.pos, d, { build: false });
      if (t) spreadNodes(t.lay, t.s);
    }
  }, { timeout: 500 });
}

function anchor() {
  const part = parts[S.pos.pi];
  const lay = resolved.get(part.id);
  const k = perSpread();
  const pg = lay?.display.slice(S.pos.s * k, S.pos.s * k + k).find(p => p.first);
  return pg?.first || `${part.id}@${S.pos.s * k}`;
}
const resolved = new Map();

async function goToRef(ref, { flash = false } = {}) {
  const { b } = parse(ref);
  const pi = parts.findIndex(p => p.id === b);
  if (pi < 0) return;
  const lay = await layoutOf(pi);
  const idx = lay.display.findIndex(p => p.first && !lessThan(p.last, ref)) ;
  const at = idx < 0 ? 0 : idx;
  S.pos = { pi, s: Math.floor(at / perSpread()) };
  await render();
  if (flash) bookEl.querySelectorAll(`.vs[data-ref="${ref}"]`).forEach(el => { el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1800); });
}
function lessThan(a, b) { const x = parse(a), y = parse(b); return x.c < y.c || (x.c === y.c && x.v < y.v); }

async function goToPart(id, page = 0) {
  const pi = parts.findIndex(p => p.id === id);
  if (pi < 0) return;
  S.pos = { pi, s: Math.floor(page / perSpread()) };
  await render();
}

async function goToGlobal(n) {
  let pi = 0, acc = 0;
  while (pi < parts.length - 1 && acc + countOf(pi) <= n) { acc += countOf(pi); pi++; }
  const lay = await layoutOf(pi);
  const idx = Math.min(lay.display.length - 1, n - acc);
  S.pos = { pi, s: Math.floor(idx / perSpread()) };
  await render();
}

// ---------- turning ----------

async function neighbourOf(pos, dir, { build = true } = {}) {
  const lay = resolved.get(parts[pos.pi].id) || (build ? await layoutOf(pos.pi) : null);
  if (!lay) return null;
  const n = Math.ceil(lay.display.length / perSpread());
  if (dir > 0 && pos.s + 1 < n) return { pi: pos.pi, s: pos.s + 1, lay };
  if (dir < 0 && pos.s > 0) return { pi: pos.pi, s: pos.s - 1, lay };
  const pi = pos.pi + dir;
  if (pi < 0 || pi >= parts.length) return null;
  const nl = resolved.get(parts[pi].id) || (build ? await layoutOf(pi) : null);
  if (!nl) return null;
  return { pi, s: dir > 0 ? 0 : Math.ceil(nl.display.length / perSpread()) - 1, lay: nl };
}
const neighbour = dir => neighbourOf(S.pos, dir);

// A turn asked for while one is running is queued, so key presses are never dropped.
async function turn(dir, { fast = false, drag = null } = {}) {
  if (S.busy) { if (!drag) S.queued = dir; return false; }
  study.hideTip();
  const target = await neighbour(dir);
  if (!target) return false;
  if (settings.anim === false) { S.pos = { pi: target.pi, s: target.s }; await render(); return true; }
  S.busy = true;
  const g = S.geom;
  const from = spreadNodes(resolved.get(parts[S.pos.pi].id), S.pos.s);
  const to = spreadNodes(target.lay, target.s);
  const spreadEl = document.createElement("div");
  spreadEl.className = `spread ${g.mode} turning`;
  let front, back, under;
  if (g.mode === "spread") {
    if (dir > 0) { under = [from[0], to[1]]; front = from[1]; back = to[0]; }
    else { under = [to[0], from[1]]; front = from[0]; back = to[1]; }
  } else {
    under = [dir > 0 ? to[0] : from[0]];
    front = dir > 0 ? from[0] : to[0];
    back = null;
  }
  // The leaf shows copies; the real elements stay in place underneath.
  const frontCopy = front.cloneNode(true), backCopy = back?.cloneNode(true) || null;
  spreadEl.append(...under);
  if (g.mode === "spread") spreadEl.insertAdjacentHTML("beforeend", `<div class="gutter"></div>`);
  bookEl.replaceChildren(spreadEl);
  for (const p of under) if (!p._inked) { drawInk(p, ann); p._inked = true; }
  const quick = fast || S.queued != null;
  const leaf = createLeaf(spreadEl, { dir: g.mode === "single" && dir < 0 ? 1 : dir, single: g.mode === "single", w: g.w, h: g.h, front: frontCopy, back: backCopy, strips: quick ? 2 : 5 });
  const ms = quick ? 210 : 620;
  let ok = true;
  if (drag) ok = await drag(leaf);
  else if (g.mode === "single" && dir < 0) { leaf.set(1); await leaf.run(1, 0, ms); }
  else await leaf.run(0, 1, ms);
  if (ok) S.pos = { pi: target.pi, s: target.s };
  S.busy = false;
  await render();
  if (S.queued != null) { const q = S.queued; S.queued = null; turn(q, { fast: true }); }
  return ok;
}

// Pressing an arrow turns at once; holding it riffles through the pages until released.
function holdRiffle(btn, dir) {
  let holding = false, timer = null;
  btn.addEventListener("pointerdown", e => {
    e.preventDefault();
    turn(dir);
    timer = setTimeout(async () => {
      holding = true;
      btn.classList.add("riffling");
      while (holding) { if (S.busy) { await sleep(30); continue; } const moved = await turn(dir, { fast: true }); if (!moved) break; }
      btn.classList.remove("riffling");
    }, 450);
  });
  const stop = () => { clearTimeout(timer); holding = false; };
  btn.addEventListener("pointerup", stop);
  btn.addEventListener("pointerleave", stop);
  btn.addEventListener("pointercancel", stop);
}

// Dragging the outer edge of a page lifts and turns it like paper.
function attachCornerDrag() {
  bookEl.addEventListener("pointerdown", e => {
    if (S.tool || S.busy || e.button || e.ctrlKey || e.metaKey) return;
    const page = e.target.closest(".page");
    if (!page) return;
    const r = page.getBoundingClientRect();
    const spread = S.geom.mode === "spread";
    const isRight = !spread || page.classList.contains("right");
    const edge = Math.min(70, r.width * 0.14);
    const nearEdge = isRight ? e.clientX > r.right - edge : e.clientX < r.left + edge;
    if (!nearEdge || e.target.closest(".t, a, button, figure")) return;
    e.preventDefault();
    const dir = isRight ? 1 : -1;
    const x0 = e.clientX;
    const w = S.geom.w;
    turn(dir, {
      drag: leaf => new Promise(resolve => {
        let t = 0;
        const move = ev => { t = Math.max(0, Math.min(1, (dir > 0 ? x0 - ev.clientX : ev.clientX - x0) / (w * 1.7))); leaf.set(t); };
        const up = async () => {
          removeEventListener("pointermove", move); removeEventListener("pointerup", up);
          const go = t > 0.22;
          await leaf.run(t, go ? 1 : 0, go ? 420 * (1 - t) + 120 : 300 * t + 80);
          resolve(go);
        };
        addEventListener("pointermove", move);
        addEventListener("pointerup", up);
      }),
    });
  });
}

// ---------- chrome: bar, tabs, thickness ----------

const TABS = [
  ["창출레", "Gen"], ["민신수", "Num"], ["삿룻삼", "Judg"], ["왕대스", "1Kgs"], ["느에욥", "Neh"], ["시잠전", "Ps"],
  ["아사렘", "Song"], ["애겔단", "Lam"], ["호욜암", "Hos"], ["옵욘미", "Obad"], ["나합습", "Nah"], ["학슥말", "Hag"],
  ["마막눅", "Matt"], ["요행롬", "John"], ["고갈엡", "1Cor"], ["빌골살", "Phil"], ["딤딛몬", "1Tim"], ["히약벧", "Heb"], ["요유계", "1John"],
];

function buildTabs() {
  $("#tabs").innerHTML = TABS.map(([t, id]) => {
    const b = lib.byId.get(id);
    return `<button class="tab ${b.t}" data-book="${id}" title="${b.ko}">${t.split("").join("<br>")}</button>`;
  }).join("");
}

function updateNumbersAndBar() {
  if (!S.geom) return;
  S.total = parts.reduce((n, _, i) => n + countOf(i), 0);
  const pos = offsetOf(S.pos.pi) + S.pos.s * perSpread();
  const slider = $("#slider");
  slider.max = String(S.total);
  slider.value = String(pos + 1);
  const part = parts[S.pos.pi];
  const a = anchor();
  const place = part.kind === "book" ? (a.includes(".") && !a.includes("@") ? `${part.book.ko} ${parse(a).c}${part.book.id === "Ps" ? "편" : "장"}` : part.book.ko) : part.kind === "nt" ? "신약전서" : "성경전서";
  $("#placeLabel").textContent = place;
  const num = part.kind === "book" ? pageNumber(S.pos.pi, S.pos.s * perSpread()) : null;
  $("#pageLabel").textContent = num ? `${part.book.t === "OT" ? "구약" : "신약"} ${num}쪽` : "";
  const frac = S.total ? pos / S.total : 0;
  bookEl.style.setProperty("--done", frac.toFixed(4));
  document.querySelectorAll("#tabs .tab").forEach(b => {
    const bi = lib.byId.get(b.dataset.book).i;
    const next = TABS[TABS.findIndex(t => t[1] === b.dataset.book) + 1];
    const end = next ? lib.byId.get(next[1]).i : 66;
    b.classList.toggle("on", part.kind === "book" && part.book.i >= bi && part.book.i < end);
  });
  $("#markBtn").classList.toggle("on", ann.isBookmarked(a));
}

// Lays out the neighbouring parts in the background so turning across books is instant.
let prefetching = false;
async function prefetch() {
  if (prefetching) return;
  prefetching = true;
  for (const d of [1, -1]) { const pi = S.pos.pi + d; if (pi >= 0 && pi < parts.length) await layoutOf(pi, { background: true }); }
  prefetching = false;
  backgroundNumbers();
}
// Counts every part once per layout so page numbers and the contents are exact.
let numbering = false;
async function backgroundNumbers() {
  if (numbering) return;
  numbering = true;
  for (let i = 0; i < parts.length; i++) {
    if (S.counts[parts[i].id]) continue;
    await new Promise(r => (window.requestIdleCallback || setTimeout)(r, { timeout: 400 }));
    const key = geomKey(S.geom);
    await layoutOf(i, { background: true });
    if (key !== geomKey(S.geom)) break;
    if (S.layouts.size > 24) trimLayouts();
  }
  numbering = false;
}
function trimLayouts() {
  const keep = new Set([S.pos.pi - 1, S.pos.pi, S.pos.pi + 1].filter(i => i >= 0).map(i => parts[i].id));
  for (const id of [...S.layouts.keys()]) if (!keep.has(id) && S.layouts.size > 12) { S.layouts.delete(id); resolved.delete(id); }
}

// ---------- rebuild ----------

async function rebuild() {
  const a = S.geom ? anchor() : loadPosition();
  document.documentElement.dataset.theme = settings.theme;
  S.geom = computeGeom();
  document.body.dataset.mode = S.geom.mode;
  document.body.classList.toggle("phone", S.geom.phone);
  S.layouts.clear(); resolved.clear(); lib.marks.clear(); clearNodes();
  loadCounts();
  if (a && a.includes("@")) { const [id, pg] = a.split("@"); await goToPart(id, +pg); }
  else if (a) await goToRef(a);
  else await goToPart("front", 0);
}

// ---------- selection: highlight, memo, copy ----------

const selBar = $("#selbar");
function selectedTokens() {
  const sel = getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!bookEl.contains(range.commonAncestorContainer)) return null;
  const groups = new Map();
  for (const t of bookEl.querySelectorAll(".vs .t")) {
    if (!range.intersectsNode(t)) continue;
    const vs = t.closest(".vs");
    const key = `${vs.dataset.ed}|${vs.dataset.ref}`;
    const i = +t.dataset.i;
    const g = groups.get(key) || { ed: vs.dataset.ed, ref: vs.dataset.ref, a: i, b: i, words: new Map() };
    g.a = Math.min(g.a, i); g.b = Math.max(g.b, i);
    g.words.set(i, t.textContent.trim());
    groups.set(key, g);
  }
  for (const g of groups.values()) g.txt = [...g.words.entries()].sort((x, y) => x[0] - y[0]).map(x => x[1]).join(" ");
  return groups.size ? { groups: [...groups.values()], text: sel.toString().trim(), rect: range.getBoundingClientRect() } : null;
}
function showSelBar() {
  const s = selectedTokens();
  if (!s) { selBar.hidden = true; return; }
  selBar.hidden = false;
  const x = Math.min(Math.max(8, s.rect.left + s.rect.width / 2 - selBar.offsetWidth / 2), innerWidth - selBar.offsetWidth - 8);
  const y = s.rect.top - selBar.offsetHeight - 10 < 8 ? s.rect.bottom + 10 : s.rect.top - selBar.offsetHeight - 10;
  selBar.style.transform = `translate(${x}px, ${y}px)`;
  selBar._sel = s;
}
selBar.addEventListener("pointerdown", e => e.preventDefault());
selBar.addEventListener("click", e => {
  const b = e.target.closest("button");
  const s = selBar._sel;
  if (!b || !s) return;
  const act = b.dataset.act;
  if (act === "hl") { S.hlColor = b.dataset.c; markColor(); s.groups.forEach(g => ann.addHighlight(g.ed, g.ref, g.a, g.b, b.dataset.c, g.txt)); }
  else if (act === "clear") s.groups.forEach(g => ann.clearHighlight(g.ed, g.ref, g.a, g.b));
  else if (act === "memo" && s.groups[0].ed === "note") { toast("서론과 해설에는 형광펜과 필기를 쓸 수 있습니다. 메모는 절 번호를 눌러 남겨 주세요."); }
  else if (act === "memo") { study.open("verse", s.groups[0].ref); setTimeout(() => { const t = $("#newMemo"); if (t) { t.value = `“${s.text}” `; t.focus(); } }, 50); }
  else if (act === "copy") navigator.clipboard?.writeText(`${s.text} (${label(s.groups[0].ref)})`);
  else if (act === "find") search.fullText(s.text);
  getSelection().removeAllRanges();
  selBar.hidden = true;
  if (act === "hl" || act === "clear") refresh();
});
document.addEventListener("selectionchange", () => { if (!selBar.hidden && getSelection().isCollapsed) selBar.hidden = true; });

// Ctrl + drag selects; releasing Ctrl paints the selection with the current highlighter colour.
S.hlColor = "y";
let ctrlSelecting = false;
function markColor() { selBar.querySelectorAll("[data-c]").forEach(b => b.classList.toggle("on", b.dataset.c === S.hlColor)); }
markColor();
bookEl.addEventListener("pointerdown", e => { ctrlSelecting = e.ctrlKey || e.metaKey; }, true);
addEventListener("keyup", e => {
  if ((e.key !== "Control" && e.key !== "Meta") || !ctrlSelecting) return;
  ctrlSelecting = false;
  const s = selectedTokens();
  if (!s) return;
  s.groups.forEach(g => ann.addHighlight(g.ed, g.ref, g.a, g.b, S.hlColor, g.txt));
  getSelection().removeAllRanges();
  selBar.hidden = true;
  refresh();
});

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
}

// Highlights and memos do not change the layout, so only the visible spread is redrawn.
function refresh() { clearNodes(); render(); study.refreshIfOpen(); }

// ---------- input ----------

let down = null;
bookEl.addEventListener("pointerdown", e => { down = { x: e.clientX, y: e.clientY, type: e.pointerType }; });
bookEl.addEventListener("pointerup", e => {
  if (S.tool) return;
  if (!(e.ctrlKey || e.metaKey)) setTimeout(showSelBar, 0);
  if (!down) return;
  const dx = e.clientX - down.x, dy = e.clientY - down.y;
  // Touch swipes turn pages; mouse clicks never do (use the arrows, keys or drag the page edge).
  if (down.type === "touch" && Math.abs(dx) > 50 && Math.abs(dy) < 60 && getSelection().isCollapsed) { down.swiped = true; turn(dx < 0 ? 1 : -1); }
});
bookEl.addEventListener("click", e => {
  if (S.tool || S.busy) return;
  if (down?.swiped) { down = null; return; }
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
  if (!getSelection().isCollapsed) return;
  const go = e.target.closest("[data-go]");
  if (go) { e.preventDefault(); goToRef(go.dataset.go, { flash: true }); return; }
  const bk = e.target.closest("[data-book]");
  if (bk) { e.preventDefault(); goToPart(bk.dataset.book, 0); return; }
  const tm = e.target.closest(".tm");
  if (tm) { study.hideTip(); study.open("term", `${parse(tm.closest(".vs").dataset.ref).b}|${tm.dataset.term}`); return; }
  const vn = e.target.closest("[data-verse]");
  if (vn) { study.open("verse", vn.dataset.verse); return; }
  const mm = e.target.closest("[data-memo]");
  if (mm) { study.open("verse", mm.dataset.memo); return; }
  const mf = e.target.closest("[data-map]");
  if (mf) { const d = JSON.parse(mf.dataset.map); openMap(d, goToRef); return; }
  const ph = e.target.closest("[data-photo]");
  if (ph) { study.openPhoto(ph.dataset.photo); return; }
  if (S.geom.phone) document.body.classList.toggle("chrome");
});

document.addEventListener("keydown", e => {
  if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
  // Ctrl+Z undoes the last highlight, stroke, memo or bookmark change; Ctrl+Y / Ctrl+Shift+Z redoes it.
  const mod = e.ctrlKey || e.metaKey;
  if (mod && (e.key === "z" || e.key === "Z") && !e.shiftKey) { e.preventDefault(); if (ann.undo()) { refresh(); toast("되돌렸습니다 (Ctrl+Y로 다시 실행)"); } else toast("되돌릴 작업이 없습니다"); return; }
  if (mod && (e.key === "y" || e.key === "Y" || ((e.key === "z" || e.key === "Z") && e.shiftKey))) { e.preventDefault(); if (ann.redo()) { refresh(); toast("다시 실행했습니다"); } return; }
  if (["ArrowRight", "PageDown"].includes(e.key) || (e.key === " " && !e.shiftKey)) { e.preventDefault(); turn(1, { fast: e.repeat }); }
  else if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); turn(-1, { fast: e.repeat }); }
  else if (e.key === "Escape") { study.close(); setTool(null); }
  else if (e.key === "/") { e.preventDefault(); search.focus(); }
});

$("#slider").addEventListener("change", e => goToGlobal(+e.target.value - 1));
$("#tabs").addEventListener("click", e => { const b = e.target.closest("[data-book]"); if (b) goToPart(b.dataset.book, 0); });
holdRiffle($("#prevBtn"), -1);
holdRiffle($("#nextBtn"), 1);
attachCornerDrag();

document.querySelector(".topbar").addEventListener("click", e => {
  const b = e.target.closest("[data-open],[data-act]");
  if (!b) return;
  if (b.dataset.open) { study.open(b.dataset.open); return; }
  const act = b.dataset.act;
  if (act === "mark") { const a = anchor(); if (a.includes(".") && !a.includes("@")) { ann.toggleBookmark(a); refresh(); } }
  else if (act === "pen") setTool(S.tool ? null : { mode: S.toolMode, color: S.toolColor });
  else if (act === "map") openMap({}, goToRef);
  else if (act === "people") openPeople(goToRef);
  else if (act === "pdf") { const part = parts[S.pos.pi]; exportPdf({ part, settings, ann }); }
});

// ---------- pen ----------

const penBar = $("#penbar");
penBar.innerHTML = `${INK_COLORS.map(c => `<button data-color="${c}" style="--c:${c}" aria-label="색"></button>`).join("")}
  <span class="sep"></span><button data-mode="pen">펜</button><button data-mode="marker">형광펜</button><button data-mode="eraser">지우개</button>
  <span class="sep"></span><button data-done>완료</button>`;
penBar.addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.done != null) { setTool(null); return; }
  if (b.dataset.color) S.toolColor = b.dataset.color;
  if (b.dataset.mode) S.toolMode = b.dataset.mode;
  setTool({ mode: S.toolMode, color: S.toolColor });
});
function setTool(t) {
  S.tool = t;
  document.body.classList.toggle("inking", !!t);
  penBar.hidden = !t;
  $("#penBtn").classList.toggle("on", !!t);
  penBar.querySelectorAll("[data-color]").forEach(b => b.classList.toggle("on", b.dataset.color === S.toolColor));
  penBar.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("on", b.dataset.mode === S.toolMode));
  if (t) { study.hideTip(); selBar.hidden = true; }
}
attachPen(bookEl, ann, () => S.tool, () => study.refreshIfOpen());

// ---------- start ----------

let resizeTimer;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const g = computeGeom();
    if (["mode", "w", "h", "cols"].some(k => g[k] !== S.geom?.[k])) rebuild();
  }, 250);
});

async function main() {
  await loadBooks();
  parts.push(...partsList());
  lib.user.niv = loadText("niv") || {};
  await loadGeo();
  indexPlaces(geo.places);
  buildTabs();
  const ctx = {
    lib, ann, settings, goToRef, goToPart, refresh,
    rebuild: () => { saveSettings(settings); rebuild(); },
    isNarrow: () => S.geom.phone, isInking: () => !!S.tool,
    openMap: d => openMap(d, goToRef),
  };
  study = createStudy(ctx);
  search = createSearch({ ...ctx, study });
  await document.fonts?.ready;
  await rebuild();
  document.body.classList.add("ready");
  // Offline caching only on the deployed site; on localhost it would serve stale files while editing.
  if ("serviceWorker" in navigator) {
    if (["localhost", "127.0.0.1"].includes(location.hostname)) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
    else navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

main();
