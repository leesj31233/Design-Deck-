// PDF export: lays the current book out again on A5 pages (148 × 210 mm at 96 dpi) with the
// reader's highlights, memos and handwriting, then opens the browser's print dialog,
// where "PDF로 저장" saves the file.

import { paginate, pageHtml } from "./layout.js";
import { lib, esc, label, cmp, parse } from "./data.js";
import { drawInk } from "./ink.js";

const A5 = { mode: "print", phone: false, w: 559, h: 794, cols: 2, fs: 12.5, lh: 1.7 };

export async function exportPdf({ part, settings, ann }) {
  const root = document.getElementById("print");
  const toast = document.getElementById("toast");
  toast.textContent = "PDF용으로 쪽을 짜는 중…";
  toast.hidden = false;
  const layout = await paginate(part, settings, ann, A5, document.getElementById("measure"));
  root.innerHTML = layout.pages.map((p, i) => pageHtml(p, ann, A5, i % 2 ? "left" : "right", part.kind === "book" ? i + 1 : "")).join("") + memoAppendix(ann, part);
  document.body.classList.add("printing");
  await Promise.all([...root.querySelectorAll("img")].map(im => (im.complete ? null : new Promise(r => { im.onload = im.onerror = r; }))));
  root.querySelectorAll(".page").forEach(p => {
    drawInk(p, ann);
    const c = p.querySelector("canvas.ink");
    if (c && p._ink?.length) {
      const img = new Image();
      img.src = c.toDataURL("image/png");
      img.className = "ink";
      c.replaceWith(img);
    }
  });
  toast.hidden = true;
  const done = () => { document.body.classList.remove("printing"); root.innerHTML = ""; removeEventListener("afterprint", done); };
  addEventListener("afterprint", done);
  setTimeout(() => print(), 60);
}

function memoAppendix(ann, part) {
  const memos = Object.entries(ann.memos)
    .filter(([ref]) => part.kind !== "book" || parse(ref).b === part.book.id)
    .flatMap(([ref, list]) => list.map(m => ({ ref, ...m }))).sort((a, b) => cmp(a.ref, b.ref));
  if (!memos.length) return "";
  return `<section class="appendix"><h2>나의 메모${part.kind === "book" ? ` · ${esc(part.book.ko)}` : ""}</h2>${memos.map(m => `<div class="ap-item"><b>${esc(label(m.ref))}</b>
    ${m.quote ? `<q>${esc(m.quote)}</q>` : ""}<p>${esc(m.text)}</p></div>`).join("")}</section>`;
}

export { lib };
