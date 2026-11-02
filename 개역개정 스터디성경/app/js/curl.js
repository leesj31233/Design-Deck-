// A turning page drawn as a chain of vertical strips. Each strip is rotated a little more than the
// one before it, so the sheet bends as it turns: the free edge leads and the paper near the spine
// follows, then the sheet lies flat again at the end of the turn.

const BEND = 56; // total extra rotation (deg) across the sheet at mid-turn

// Smooth start and finish without the abrupt middle of a quadratic.
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

export function createLeaf(host, { dir, single, w, h, front, back, strips = 7 }) {
  const n = strips;
  const sw = w / n;
  const fwd = dir > 0;
  const root = document.createElement("div");
  root.className = `curl ${fwd ? "fwd" : "bwd"}${single ? " single" : ""}`;
  root.style.cssText = `width:${w}px;height:${h}px;left:${single ? 0 : fwd ? w : 0}px`;

  // For a backward turn the chain starts at the spine on the right and grows leftwards.
  const frontOffset = i => (fwd ? -i * sw : -(w - (i + 1) * sw));
  const backOffset = i => (fwd ? -(w - (i + 1) * sw) : -i * sw);
  // front/back are page elements (or HTML); each strip gets its own copy, offset to its slice.
  const backNode = back || Object.assign(document.createElement("div"), { className: "page paper-back" });
  if (!back) backNode.style.cssText = `width:${w}px;height:${h}px`;
  const copy = x => (typeof x === "string" ? x : "");

  const nodes = [];
  let parent = root;
  for (let i = 0; i < n; i++) {
    const s = document.createElement("div");
    s.className = "cs";
    s.style.cssText = `width:${sw + 0.6}px;height:${h}px;${i === 0 ? (fwd ? "left:0" : `left:${w - sw}px`) : fwd ? `left:${sw}px` : `left:${-sw}px`};transform-origin:${fwd ? "left" : "right"} center`;
    s.innerHTML = `<div class="cf"><div class="cl" style="left:${frontOffset(i)}px;width:${w}px">${copy(front)}</div><i class="sh"></i></div>
      <div class="cb"><div class="cl" style="left:${backOffset(i)}px;width:${w}px">${copy(back)}</div><i class="sh"></i></div>`;
    const [fl, bl] = s.querySelectorAll(":scope > div > .cl");
    if (typeof front !== "string") fl.appendChild(front.cloneNode(true));
    if (typeof back !== "string") bl.appendChild((back ? back : backNode).cloneNode(true));
    parent.appendChild(s);
    nodes.push({ s, fs: s.querySelector(".cf .sh"), bs: s.querySelector(".cb .sh"), a: NaN });
    parent = s;
  }
  host.appendChild(root);

  const sign = fwd ? -1 : 1;
  let last = -1;
  function set(t) {
    t = Math.max(0, Math.min(1, t));
    if (Math.abs(t - last) < 0.0005) return;
    last = t;
    const base = 180 * ease(t);
    const bend = Math.sin(Math.PI * t) ** 0.85 * (BEND / Math.max(1, n - 1));
    let abs = 0;
    for (let i = 0; i < n; i++) {
      const nd = nodes[i];
      const a = i === 0 ? base : bend;
      abs += a;
      nd.s.style.transform = `rotateY(${(sign * a).toFixed(2)}deg)`;
      const r = (Math.min(abs, 180) * Math.PI) / 180;
      nd.fs.style.opacity = (0.42 * (1 - Math.cos(r)) / 2).toFixed(3);
      nd.bs.style.opacity = (0.42 * (1 + Math.cos(r)) / 2).toFixed(3);
    }
    root.style.setProperty("--lift", Math.sin(Math.PI * t).toFixed(3));
  }
  set(0);

  // Two frames to let the browser lay out and rasterise the strips before motion starts,
  // so the first moving frame is not the expensive one.
  const ready = (async () => { root.getBoundingClientRect(); await nextFrame(); await nextFrame(); })();

  // Runs the turn from t0 to t1, driven by elapsed time so a slow frame never slows the turn.
  // Falls back to timers when animation frames are not delivered (background tabs).
  async function run(t0, t1, ms) {
    await Promise.race([ready, new Promise(r => setTimeout(r, 120))]);
    return new Promise(resolve => {
      const start = performance.now();
      let done = false;
      const finish = () => { if (!done) { done = true; set(t1); clearInterval(timer); resolve(); } };
      const step = now => {
        if (done) return;
        const k = Math.min(1, (now - start) / ms);
        set(t0 + (t1 - t0) * k);
        if (k >= 1) finish(); else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      const timer = setInterval(() => { if (performance.now() - start > ms + 250) finish(); }, 60);
    });
  }

  return { set, run, ready, remove: () => root.remove() };
}
