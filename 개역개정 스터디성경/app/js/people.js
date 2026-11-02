// Person cards: collectible-card style, grouped by era or by book. Click a card to flip it.

import { lib, esc, json, parseKoRef } from "./data.js";
import { rich } from "./layout.js";
import { ERAS, staticMap, geo } from "./map.js";

let people = null, goTo = null, filter = { era: "all", book: "all" };

export async function openPeople(onGo, focusId) {
  goTo = onGo;
  people ||= await json("data/people.json", []);
  const dlg = document.getElementById("peopleDlg");
  dlg.hidden = false;
  document.body.classList.add("people-open");
  if (focusId) {
    const p = people.find(x => x.id === focusId);
    if (p) filter = { era: p.era, book: "all" };
  }
  renderBar();
  renderGrid(focusId);
}

function close() {
  document.getElementById("peopleDlg").hidden = true;
  document.body.classList.remove("people-open");
}

function renderBar() {
  const counts = new Map();
  for (const p of people) counts.set(p.era, (counts.get(p.era) || 0) + 1);
  document.getElementById("peopleEras").innerHTML = `<button data-era="all" class="${filter.era === "all" ? "on" : ""}">전체 <small>${people.length}</small></button>` +
    ERAS.concat([{ id: "중간기" }]).filter(e => counts.get(e.id)).map(e => `<button data-era="${e.id}" class="${filter.era === e.id ? "on" : ""}">${e.id} <small>${counts.get(e.id)}</small></button>`).join("");
  const books = [...new Set(people.map(p => p.book))];
  document.getElementById("peopleBook").innerHTML = `<option value="all">모든 권</option>` +
    books.map(id => `<option value="${id}" ${filter.book === id ? "selected" : ""}>${esc(lib.byId.get(id).ko)}</option>`).join("");
}

export function card(p, n) {
  const im = p.img && lib.images[p.img.query];
  const book = lib.byId.get(p.book);
  const refLink = row => { const r = parseKoRef(row[0]); return `<li>${r ? `<a href="#" data-go="${r.ref}">${esc(row[0])}</a>` : esc(row[0])}<span>${rich(row[1] || "")}</span></li>`; };
  const place = p.place && geo.byFid.get(p.place);
  return `<div class="pcard ${book.t}" data-id="${esc(p.id)}" tabindex="0">
    <div class="pc-in">
      <div class="pc-face pc-front">
        <div class="pc-top"><span class="pc-name">${esc(p.name)}</span><span class="pc-en">${esc(p.en)}</span><span class="pc-no">${n}</span></div>
        <div class="pc-art">${im ? `<img src="${esc(im.src)}" alt="" loading="lazy">` : `<div class="pc-noart">${esc(p.name.slice(0, 1))}</div>`}
          <span class="pc-era">${esc(p.era)}</span></div>
        <div class="pc-type">${esc(p.orig || "")}${p.meaning ? ` · ${esc(p.meaning)}` : ""}</div>
        <div class="pc-text">${rich(p.summary || "")}</div>
        <div class="pc-facts">${(p.facts || []).slice(0, 3).map(([k, v]) => `<div><b>${esc(k)}</b><span>${rich(String(v))}</span></div>`).join("")}</div>
        <div class="pc-foot"><span>${esc(book.ko)}</span><span>${esc(p.years || "")}</span></div>
      </div>
      <div class="pc-face pc-back">
        <div class="pc-top small"><span class="pc-name">${esc(p.name)}</span><span class="pc-en">${esc(p.en)}</span></div>
        ${place ? `<div class="pc-map">${staticMap([p.place], { W: 320, H: 150 })}<span>${esc(place.ko)}</span></div>` : ""}
        <h6>생애</h6><ol class="pc-life">${(p.life || []).map(refLink).join("")}</ol>
        ${p.nt?.length ? `<h6>${book.t === "OT" ? "신약에서" : "구약에서"}</h6><ul class="pc-life">${p.nt.map(refLink).join("")}</ul>` : ""}
        ${(p.facts || []).length > 3 ? `<h6>더 보기</h6><div class="pc-facts">${p.facts.slice(3).map(([k, v]) => `<div><b>${esc(k)}</b><span>${rich(String(v))}</span></div>`).join("")}</div>` : ""}
        ${im ? `<div class="pc-credit">${esc(p.img.caption || "")} · ${esc(im.credit)} · ${esc(im.license)}</div>` : ""}
      </div>
    </div></div>`;
}

function renderGrid(focusId) {
  const list = people.filter(p => (filter.era === "all" || p.era === filter.era) && (filter.book === "all" || p.book === filter.book));
  const grid = document.getElementById("peopleGrid");
  grid.innerHTML = list.length ? list.map((p, i) => card(p, i + 1)).join("") : `<p class="muted">아직 이 범위의 인물 카드가 없습니다.</p>`;
  if (focusId) grid.querySelector(`[data-id="${CSS.escape(focusId)}"]`)?.scrollIntoView({ block: "center" });
}

document.addEventListener("click", e => {
  const dlg = document.getElementById("peopleDlg");
  if (!dlg || dlg.hidden || !dlg.contains(e.target)) return;
  if (e.target.closest("#peopleClose")) { close(); return; }
  const era = e.target.closest("[data-era]");
  if (era && era.closest("#peopleEras")) { filter.era = era.dataset.era; renderBar(); renderGrid(); return; }
  const go = e.target.closest("[data-go]");
  if (go) { e.preventDefault(); close(); goTo?.(go.dataset.go, { flash: true }); return; }
  const c = e.target.closest(".pcard");
  if (c) c.classList.toggle("flipped");
});
document.addEventListener("change", e => {
  if (e.target.id !== "peopleBook") return;
  filter.book = e.target.value;
  renderGrid();
});
document.addEventListener("keydown", e => {
  const c = e.target.closest?.(".pcard");
  if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); c.classList.toggle("flipped"); }
});
