// Top-bar search with suggestions: books ("갈라" → 갈라디아서), chapters ("갈 1" → 1장 with its
// first heading), verses ("마2:1"), headings, study terms and people, then full-text search.

import { lib, esc, json, R, label, loadBook, verseText } from "./data.js";

export function createSearch(ctx) {
  const input = document.getElementById("q");
  const list = document.getElementById("qList");
  let items = [], sel = 0, index = null, fullTextLoaded = false;

  const loadIndex = async () => (index ||= await json("data/index.json", { h: [], t: [], p: [] }));

  function findBooks(name) {
    const n = name.replace(/\s/g, "").toLowerCase();
    if (!n) return [];
    const exact = lib.books.filter(b => b.ab === n || b.ko === n);
    if (exact.length) return exact;
    return lib.books.filter(b => b.ko.startsWith(n) || b.en.toLowerCase().replace(/\s/g, "").startsWith(n) || b.id.toLowerCase() === n);
  }
  const firstHeading = (b, c) => {
    const hs = lib.study.get(b.id)?.headings || index?.h.filter(h => h[0] === b.id).map(h => [h[1], h[2]]) || [];
    const h = hs.find(x => +x[0].split(":")[0] === c);
    return h ? h[1] : "";
  };

  async function suggest(q) {
    q = q.trim();
    items = [];
    if (!q) return render();
    await loadIndex();
    const m = q.match(/^([^\d:]+?)\s*(\d+)?\s*(?:[:장편.]\s*(\d+)?)?\s*절?$/);
    const books = m ? findBooks(m[1]) : [];
    if (books.length) {
      const b0 = books[0];
      const c = m[2] ? +m[2] : null, v = m[3] ? +m[3] : null;
      if (books.length === 1 || c) {
        if (!c) {
          items.push({ kind: "cover", label: `${b0.ko}`, sub: `표지 · ${b0.en} · ${b0.chapters}${b0.id === "Ps" ? "편" : "장"}`, go: () => ctx.goToPart(b0.id, 0) });
          for (let i = 1; i <= Math.min(b0.chapters, 150); i++) items.push({ kind: "chap", label: `${b0.ko} ${i}${b0.id === "Ps" ? "편" : "장"}`, sub: firstHeading(b0, i), go: () => ctx.goToRef(R(b0.id, i, 1)) });
        } else if (c <= b0.chapters) {
          if (v && v <= b0.v[c - 1]) {
            await loadBook(b0.id);
            items.push({ kind: "verse", label: `${b0.ko} ${c}:${v}`, sub: verseText(R(b0.id, c, v)), go: () => ctx.goToRef(R(b0.id, c, v), { flash: true }) });
          }
          items.push({ kind: "chap", label: `${b0.ko} ${c}${b0.id === "Ps" ? "편" : "장"}`, sub: firstHeading(b0, c), go: () => ctx.goToRef(R(b0.id, c, 1)) });
          for (let i = c * 10; i < c * 10 + 10 && i <= b0.chapters && !v; i++) items.push({ kind: "chap", label: `${b0.ko} ${i}${b0.id === "Ps" ? "편" : "장"}`, sub: firstHeading(b0, i), go: () => ctx.goToRef(R(b0.id, i, 1)) });
        }
      } else {
        for (const b of books) items.push({ kind: "cover", label: b.ko, sub: `표지 · ${b.en}`, go: () => ctx.goToPart(b.id, 0) });
      }
    }
    if (!items.length || items.length < 4) {
      const lower = q.toLowerCase();
      for (const [bid, cv, title] of index.h) if (title.includes(q)) { items.push({ kind: "head", label: title, sub: `${lib.byId.get(bid).ab} ${cv}`, go: () => ctx.goToRef(R(bid, ...cv.split(":").map(Number))) }); if (items.length > 12) break; }
      for (const [bid, id, lab, en] of index.t) if (lab.includes(q) || en.toLowerCase().includes(lower)) { items.push({ kind: "term", label: `${lab} (${en})`, sub: `단어 해설 · ${lib.byId.get(bid).ko}`, go: () => ctx.study.open("term", `${bid}|${id}`) }); if (items.length > 20) break; }
      for (const [bid, id, name, en] of index.p) if (name.includes(q) || en.toLowerCase().includes(lower)) { items.push({ kind: "person", label: `${name} (${en})`, sub: `인물 카드 · ${lib.byId.get(bid).ko}`, go: () => import("./people.js").then(m => m.openPeople(ctx.goToRef, id)) }); if (items.length > 26) break; }
      items.push({ kind: "full", label: `'${q}' 성경 전체에서 찾기`, sub: "개역한글 · KJV 본문", go: () => fullText(q) });
    }
    sel = 0;
    render();
  }

  function render(extra = "") {
    if (!items.length && !extra) { list.hidden = true; return; }
    list.hidden = false;
    list.innerHTML = items.map((it, i) => `<li class="${i === sel ? "on" : ""} k-${it.kind}" data-i="${i}"><b>${esc(it.label)}</b><span>${esc(it.sub || "")}</span></li>`).join("") + extra;
  }

  function choose(i) {
    const it = items[i];
    if (!it) return;
    if (it.kind !== "full") { list.hidden = true; input.blur(); }
    it.go();
  }

  async function fullText(q) {
    input.value = q;
    items = [];
    render(`<li class="msg">성경 전체를 찾는 중…</li>`);
    list.hidden = false;
    if (!fullTextLoaded) { await Promise.all(lib.books.map(b => loadBook(b.id))); fullTextLoaded = true; }
    const lower = q.toLowerCase();
    const hits = [];
    for (const b of lib.books) {
      const t = lib.text.get(b.id);
      t.c.forEach((ch, ci) => ch.forEach((row, vi) => {
        if (hits.length < 400 && (row[0].includes(q) || row[1].toLowerCase().includes(lower))) hits.push([R(b.id, ci + 1, vi + 1), row[0].includes(q) ? row[0] : row[1]]);
      }));
    }
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    items = hits.map(([ref, txt]) => ({ kind: "verse", label: label(ref), sub: txt, go: () => ctx.goToRef(ref, { flash: true }) }));
    sel = -1;
    list.hidden = false;
    list.innerHTML = `<li class="msg">'${esc(q)}' ${hits.length >= 400 ? "400+" : hits.length}구절</li>` + items.map((it, i) =>
      `<li class="k-verse" data-i="${i}"><b>${esc(it.label)}</b><span>${esc(it.sub).replace(re, s => `<mark>${s}</mark>`)}</span></li>`).join("");
  }

  input.addEventListener("input", () => suggest(input.value));
  input.addEventListener("focus", () => { if (input.value) suggest(input.value); });
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey && !list.hidden)) { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); highlight(); }
    else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey && !list.hidden)) { e.preventDefault(); sel = Math.max(0, sel - 1); highlight(); }
    else if (e.key === "Enter") { e.preventDefault(); choose(Math.max(0, sel)); }
    else if (e.key === "Escape") { list.hidden = true; input.blur(); }
  });
  function highlight() {
    list.querySelectorAll("li[data-i]").forEach(li => li.classList.toggle("on", +li.dataset.i === sel));
    list.querySelector("li.on")?.scrollIntoView({ block: "nearest" });
  }
  list.addEventListener("pointerdown", e => e.preventDefault());
  list.addEventListener("click", e => { const li = e.target.closest("li[data-i]"); if (li) choose(+li.dataset.i); });
  document.addEventListener("pointerdown", e => { if (!e.target.closest(".search-box")) list.hidden = true; });

  return { focus: () => input.focus(), fullText };
}
