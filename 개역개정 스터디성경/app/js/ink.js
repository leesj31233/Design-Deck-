// Handwriting on pages. Each stroke is anchored to the word under its first point and
// stored in em units relative to that word, so it follows the text when pages reflow.

export const PENS = {
  pen: { w: 0.12, alpha: 1 },
  marker: { w: 0.9, alpha: 0.32 },
};
export const INK_COLORS = ["#1f2a44", "#b3261e", "#1f6f43", "#2f5d8a", "#e0a800"];

function offsetIn(el, root) {
  let x = 0, y = 0;
  while (el && el !== root) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; }
  return { x, y };
}

function fontPx(pageEl) { return parseFloat(getComputedStyle(pageEl).getPropertyValue("--fs")) || 16; }

function sizeCanvas(pageEl) {
  const c = pageEl.querySelector("canvas.ink");
  if (!c) return null;
  const dpr = devicePixelRatio || 1;
  const w = pageEl.offsetWidth, h = pageEl.offsetHeight;
  if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return g;
}

function stroke(g, pts, s, fs) {
  if (!pts.length) return;
  const pen = PENS[s.mode] || PENS.pen;
  g.save();
  g.globalAlpha = pen.alpha;
  g.globalCompositeOperation = s.mode === "marker" ? "multiply" : "source-over";
  g.strokeStyle = s.c;
  g.lineWidth = pen.w * fs;
  g.lineCap = s.mode === "marker" ? "butt" : "round";
  g.lineJoin = "round";
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    g.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  if (pts.length === 1) g.lineTo(pts[0][0] + 0.1, pts[0][1]);
  g.stroke();
  g.restore();
}

// Draws every stored stroke whose anchor word is on this page; returns their page-space points.
export function drawInk(pageEl, ann) {
  const g = sizeCanvas(pageEl);
  if (!g) return [];
  const fs = fontPx(pageEl);
  const drawn = [];
  for (const s of ann.ink) {
    let el = pageEl.querySelector(`.vs[data-ref="${s.ref}"][data-ed="${s.ed}"] .t[data-i="${s.i}"]`);
    // On revised prose the word may have moved: find the same word nearest its old position.
    if (s.w && (!el || el.textContent.trim() !== s.w)) {
      const all = [...pageEl.querySelectorAll(`.vs[data-ref="${s.ref}"][data-ed="${s.ed}"] .t`)].filter(t => t.textContent.trim() === s.w);
      if (all.length) el = all.reduce((best, t) => (Math.abs(+t.dataset.i - s.i) < Math.abs(+best.dataset.i - s.i) ? t : best));
    }
    if (!el) continue;
    const o = offsetIn(el, pageEl);
    const pts = s.pts.map(([x, y]) => [o.x + x * fs, o.y + y * fs]);
    stroke(g, pts, s, fs);
    drawn.push({ s, pts });
  }
  pageEl._ink = drawn;
  return drawn;
}

function nearestWord(pageEl, x, y) {
  let best = null, bd = Infinity;
  for (const el of pageEl.querySelectorAll(".vs .t")) {
    const o = offsetIn(el, pageEl);
    const cx = Math.max(o.x, Math.min(x, o.x + el.offsetWidth));
    const cy = Math.max(o.y, Math.min(y, o.y + el.offsetHeight));
    const d = (cx - x) ** 2 + (cy - y) ** 2;
    if (d < bd) { bd = d; best = { el, o }; }
  }
  return best;
}

export function attachPen(bookEl, ann, getTool, onChange) {
  let live = null;

  const pagePoint = (pageEl, e) => {
    const r = pageEl.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const erase = (pageEl, x, y) => {
    const hit = (pageEl._ink || []).find(d => d.pts.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 < 100));
    if (hit) { ann.deleteStroke(hit.s.id); drawInk(pageEl, ann); onChange(); }
  };

  bookEl.addEventListener("pointerdown", e => {
    const tool = getTool();
    if (!tool) return;
    const pageEl = e.target.closest(".page");
    if (!pageEl || !pageEl.querySelector("canvas.ink")) return;
    e.preventDefault();
    pageEl.setPointerCapture?.(e.pointerId);
    const [x, y] = pagePoint(pageEl, e);
    if (tool.mode === "eraser") { live = { pageEl, eraser: true }; erase(pageEl, x, y); return; }
    live = { pageEl, pts: [[x, y]], s: { c: tool.color, mode: tool.mode }, fs: fontPx(pageEl) };
  });

  bookEl.addEventListener("pointermove", e => {
    if (!live) return;
    const [x, y] = pagePoint(live.pageEl, e);
    if (live.eraser) { erase(live.pageEl, x, y); return; }
    const last = live.pts[live.pts.length - 1];
    if ((last[0] - x) ** 2 + (last[1] - y) ** 2 < 2) return;
    live.pts.push([x, y]);
    drawInk(live.pageEl, ann);
    stroke(live.pageEl.querySelector("canvas.ink").getContext("2d"), live.pts, live.s, live.fs);
  });

  const end = () => {
    if (!live) return;
    const { pageEl, pts, s, fs, eraser } = live;
    live = null;
    if (eraser) return;
    const w = nearestWord(pageEl, pts[0][0], pts[0][1]);
    const vs = w?.el.closest(".vs");
    if (!w || !vs) { drawInk(pageEl, ann); return; }
    ann.addStroke({
      ed: vs.dataset.ed, ref: vs.dataset.ref, i: +w.el.dataset.i, w: w.el.textContent.trim(), c: s.c, mode: s.mode,
      pts: pts.map(([x, y]) => [+((x - w.o.x) / fs).toFixed(3), +((y - w.o.y) / fs).toFixed(3)]),
    });
    drawInk(pageEl, ann);
    onChange();
  };
  bookEl.addEventListener("pointerup", end);
  bookEl.addEventListener("pointercancel", end);
}
