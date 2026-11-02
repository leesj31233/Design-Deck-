// Bible maps: small static maps drawn inside pages, and a full interactive map of the biblical
// world with an era timeline. Places: OpenBible.info Bible Geocoding Data (CC BY 4.0).
// Coastlines: Natural Earth (public domain). Relief tiles: Esri.

import { lib, esc, json, parse, label } from "./data.js";

export const geo = { places: [], byFid: new Map(), base: null };

export async function loadGeo() {
  if (geo.base) return;
  const [places, base] = await Promise.all([json("data/places.json", []), json("data/basemap.json", null)]);
  geo.places = places;
  places.forEach(p => geo.byFid.set(p.fid, p));
  geo.base = base;
}

// ---------- eras ----------

export const ERAS = [
  { id: "태초", years: "창 1–11", from: ["Gen", 1], to: ["Gen", 11] },
  { id: "족장 시대", years: "주전 2100–1800년경", from: ["Gen", 12], to: ["Gen", 50], also: ["Job"] },
  { id: "출애굽·광야", years: "주전 1446/1260년경–", from: ["Exod", 1], to: ["Deut", 34] },
  { id: "정복·사사 시대", years: "주전 1400/1200–1050년경", from: ["Josh", 1], to: ["1Sam", 7] },
  { id: "통일 왕국", years: "주전 1050–930년", from: ["1Sam", 8], to: ["1Kgs", 11], also: ["1Chr", "Ps", "Prov", "Eccl", "Song"], also2: [["2Chr", 1, 9]] },
  { id: "분열 왕국", years: "주전 930–586년", from: ["1Kgs", 12], to: ["2Kgs", 24], also: ["Isa", "Jer", "Hos", "Joel", "Amos", "Obad", "Jonah", "Mic", "Nah", "Hab", "Zeph"], also2: [["2Chr", 10, 36]] },
  { id: "포로기", years: "주전 586–538년", from: ["2Kgs", 25], to: ["2Kgs", 25], also: ["Lam", "Ezek", "Dan"] },
  { id: "포로 귀환", years: "주전 538–430년경", from: ["Ezra", 1], to: ["Esth", 10], also: ["Hag", "Zech", "Mal"] },
  { id: "예수 시대", years: "주전 6년경–주후 30년경", from: ["Matt", 1], to: ["John", 21] },
  { id: "초대 교회", years: "주후 30–100년경", from: ["Acts", 1], to: ["Rev", 22] },
];

export function eraOf(ref) {
  const { b, c } = parse(ref);
  const i = lib.byId.get(b).i;
  for (const e of ERAS) {
    if (e.also?.includes(b)) return e.id;
    if (e.also2?.some(([x, a, z]) => x === b && c >= a && c <= z)) return e.id;
  }
  for (const e of ERAS) {
    const fi = lib.byId.get(e.from[0]).i, ti = lib.byId.get(e.to[0]).i;
    const after = i > fi || (i === fi && c >= e.from[1]);
    const before = i < ti || (i === ti && c <= e.to[1]);
    if (after && before) return e.id;
  }
  return null;
}

// Powers and regions shown behind the places, by era (approximate centres).
const REGIONS = [
  ["애굽", 27.5, 30.8, ["족장 시대", "출애굽·광야", "정복·사사 시대", "통일 왕국", "분열 왕국", "포로기", "포로 귀환", "예수 시대"]],
  ["가나안", 31.9, 35.0, ["족장 시대", "출애굽·광야", "정복·사사 시대"]],
  ["메소포타미아", 34.2, 42.5, ["태초", "족장 시대"]],
  ["이스라엘", 32.3, 35.3, ["통일 왕국"]],
  ["북이스라엘", 32.6, 35.4, ["분열 왕국"]],
  ["남유다", 31.5, 35.1, ["분열 왕국", "포로 귀환"]],
  ["앗수르", 36.0, 43.3, ["분열 왕국"]],
  ["바벨론 제국", 32.5, 44.4, ["분열 왕국", "포로기"]],
  ["바사(페르시아) 제국", 30.0, 52.5, ["포로 귀환"]],
  ["로마 제국", 41.9, 12.5, ["예수 시대", "초대 교회"]],
  ["갈릴리", 32.8, 35.4, ["예수 시대"]],
  ["유대", 31.6, 35.1, ["예수 시대", "초대 교회"]],
  ["사마리아", 32.25, 35.2, ["예수 시대"]],
  ["아시아", 38.6, 28.0, ["초대 교회"]],
  ["마게도냐", 40.8, 22.5, ["초대 교회"]],
  ["아가야", 37.9, 22.6, ["초대 교회"]],
];
const LANDMARKS = [
  { ko: "성전", ll: [31.778, 35.2354], refs: ["1Kgs.6.1", "Ezra.6.15", "John.2.20", "Matt.24.1"], note: "솔로몬 성전(주전 959년 완공) · 스룹바벨 성전(주전 516년) · 헤롯 성전(주후 70년 파괴)" },
];

// ---------- static map (in pages) ----------

function project(bounds, W, H) {
  const [lon0, lat0, lon1, lat1] = bounds;
  const k = Math.cos(((lat0 + lat1) / 2) * Math.PI / 180);
  const sx = W / ((lon1 - lon0) * k), sy = H / (lat1 - lat0);
  const s = Math.min(sx, sy);
  const ox = (W - (lon1 - lon0) * k * s) / 2, oy = (H - (lat1 - lat0) * s) / 2;
  return ([lon, lat]) => [+(ox + (lon - lon0) * k * s).toFixed(1), +(oy + (lat1 - lat) * s).toFixed(1)];
}

function boundsFor(pts) {
  let lon0 = Infinity, lat0 = Infinity, lon1 = -Infinity, lat1 = -Infinity;
  for (const [lat, lon] of pts) { lon0 = Math.min(lon0, lon); lon1 = Math.max(lon1, lon); lat0 = Math.min(lat0, lat); lat1 = Math.max(lat1, lat); }
  const span = Math.max(lon1 - lon0, (lat1 - lat0) * 1.3, 1.6);
  const cx = (lon0 + lon1) / 2, cy = (lat0 + lat1) / 2;
  const w = span * 0.75 + 0.6, h = w / 1.33;
  return [cx - w, cy - h, cx + w, cy + h];
}

export function staticMap(fids, { route = false, W = 400, H = 300 } = {}) {
  const pts = fids.map(f => geo.byFid.get(f)).filter(Boolean);
  if (!pts.length || !geo.base) return `<div class="fig-missing">지도</div>`;
  const bounds = boundsFor(pts.map(p => p.ll));
  const P = project(bounds, W, H);
  const path = ring => "M" + ring.map(p => P(p).join(",")).join("L");
  const near = ring => ring.some(([x, y]) => x > bounds[0] - 4 && x < bounds[2] + 4 && y > bounds[1] - 4 && y < bounds[3] + 4);
  const land = geo.base.land.filter(near).map(r => `<path d="${path(r)}Z"/>`).join("");
  const lakes = geo.base.lakes.filter(near).map(r => `<path d="${path(r)}Z"/>`).join("");
  const rivers = geo.base.rivers.filter(near).map(r => `<path d="${path(r)}"/>`).join("");
  const xy = pts.map(p => P([p.ll[1], p.ll[0]]));
  const line = route && xy.length > 1
    ? `<path class="m-route" d="M${xy.map(p => p.join(",")).join("L")}" marker-end="url(#mArr)"/>` : "";
  const dots = pts.map((p, i) => {
    const [x, y] = xy[i];
    const right = x < W - 70;
    return `<circle cx="${x}" cy="${y}" r="3.6"/><text x="${right ? x + 6 : x - 6}" y="${y + 4}" text-anchor="${right ? "start" : "end"}">${route ? `${i + 1}. ` : ""}${esc(p.ko || p.en)}</text>`;
  }).join("");
  return `<svg class="smap" viewBox="0 0 ${W} ${H}" role="img" aria-label="지도">
    <defs><marker id="mArr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0L10,5L0,10z" class="m-arr"/></marker></defs>
    <rect class="m-sea" width="${W}" height="${H}"/><g class="m-land">${land}</g><g class="m-lake">${lakes}</g><g class="m-river">${rivers}</g>
    ${line}<g class="m-pt">${dots}</g></svg>`;
}

// ---------- interactive map ----------

let leafletReady = null;
function loadLeaflet() {
  leafletReady ||= new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    s.onload = () => resolve(window.L);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return leafletReady;
}

let map = null, layer = null, labelLayer = null, state = { era: "all", focus: [], route: false }, goTo = null;
const layers = { borders: true, regions: true };
const extra = { borders: null, regions: [], intros: {} };

async function loadExtras() {
  if (extra.borders) return;
  const [b, r, i] = await Promise.all([json("data/borders.json", { lines: [], labels: [] }), json("data/era_regions.json", []), json("data/place_intros.json", {})]);
  Object.assign(extra, { borders: b, regions: r, intros: i });
}

export async function openMap({ places = [], route = false, era = null, title = "" } = {}, onGo) {
  goTo = onGo;
  const dlg = document.getElementById("mapDlg");
  dlg.hidden = false;
  document.body.classList.add("map-open");
  document.getElementById("mapTitle").textContent = title || "성경 지도";
  await Promise.all([loadGeo(), loadExtras()]);
  const L = await loadLeaflet();
  if (!map) {
    map = L.map("mapCanvas", { zoomControl: true, minZoom: 3, maxZoom: 11 });
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 13, attribution: "Relief © Esri · Places © OpenBible.info (CC BY) · Borders © Natural Earth",
    }).addTo(map);
    map.createPane("regions").style.zIndex = 350;
    map.createPane("borders").style.zIndex = 360;
    map.on("zoomend moveend", placeLabels);
    buildBars();
  }
  state = { era: era || "all", focus: places, route };
  setTimeout(() => { map.invalidateSize(); draw(); }, 60);
}

export function closeMap() {
  document.getElementById("mapDlg").hidden = true;
  document.body.classList.remove("map-open");
}

function buildBars() {
  const bar = document.getElementById("mapEras");
  bar.innerHTML = `<button data-era="all" class="on">전체</button>${ERAS.map(e => `<button data-era="${e.id}" title="${e.years}"><b>${e.id}</b><small>${e.years}</small></button>`).join("")}`;
  bar.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    state.era = b.dataset.era;
    state.focus = [];
    draw();
  });
  document.getElementById("mapLayers").addEventListener("change", e => {
    layers[e.target.dataset.layer] = e.target.checked;
    draw();
  });
  document.getElementById("mapClose").addEventListener("click", closeMap);
}

let candidates = [], regionLabels = [];
function draw() {
  const L = window.L;
  document.querySelectorAll("#mapEras button").forEach(b => b.classList.toggle("on", b.dataset.era === state.era));
  document.getElementById("mapNote").textContent = state.era === "all" ? "시대를 고르면 그 시대의 나라 영역과 장소가 보임"
    : `${state.era} · ${ERAS.find(e => e.id === state.era)?.years || ""} · 영역은 개략적 표시`;
  layer?.remove();
  layer = L.layerGroup().addTo(map);
  regionLabels = [];

  // Historical powers of the chosen era, drawn under everything else.
  const regions = state.era === "all" ? [] : extra.regions.filter(r => r.era === state.era);
  if (layers.regions) {
    for (const r of regions) {
      const poly = L.polygon(r.poly, { pane: "regions", color: r.color, weight: 1.2, opacity: 0.7, fillColor: r.color, fillOpacity: 0.16 }).addTo(layer);
      poly.bindPopup(`<div class="mpop"><div class="mp-h"><b>${esc(r.name)}</b> <span>${esc(r.en || "")}</span></div><div class="mp-m">${esc(r.years || "")}</div><p class="mp-i">${esc(r.note || "")}</p></div>`);
      regionLabels.push({ r, bounds: poly.getBounds() });
    }
  }
  if (!layers.regions || !regions.length) {
    for (const [ko, lat, lon, eras] of REGIONS) {
      if (state.era !== "all" && !eras.includes(state.era)) continue;
      if (state.era === "all" && !["애굽", "메소포타미아", "로마 제국", "앗수르", "바벨론 제국"].includes(ko)) continue;
      L.marker([lat, lon], { interactive: false, icon: L.divIcon({ className: "mregion", html: `<span>${esc(ko)}</span>`, iconSize: [200, 22], iconAnchor: [100, 11] }) }).addTo(layer);
    }
  }
  // Present-day borders and country names, for orientation.
  if (layers.borders && extra.borders) {
    for (const line of extra.borders.lines) L.polyline(line, { pane: "borders", color: "#6b5d4a", weight: 1, opacity: 0.55, dashArray: "4 3", interactive: false }).addTo(layer);
  }

  const focus = new Set(state.focus);
  const shown = [], all = [];
  candidates = [];
  for (const p of geo.places) {
    const refs = state.era === "all" ? p.refs : p.refs.filter(r => eraOf(r) === state.era);
    const isFocus = focus.has(p.fid);
    if (!refs.length && !isFocus) continue;
    if (!isFocus && refs.length < (state.era === "all" ? 5 : 1)) continue;
    const r = state.era === "all" ? Math.min(9, 2.5 + Math.sqrt(refs.length) * 0.5) : Math.min(6.5, 2.2 + Math.sqrt(refs.length) * 0.45);
    const m = L.circleMarker([p.ll[0], p.ll[1]], {
      radius: isFocus ? 8 : r, weight: isFocus ? 2.5 : 1, color: isFocus ? "#a4282a" : "#5a4a32",
      fillColor: isFocus ? "#e0563f" : "#c8a96a", fillOpacity: isFocus ? 0.95 : 0.62,
    }).addTo(layer);
    m.bindPopup(() => popupHtml(p, refs), { maxWidth: 340, minWidth: 260 });
    candidates.push({ p, n: refs.length, focus: isFocus, ll: [p.ll[0], p.ll[1]] });
    if (isFocus) shown.push([p.ll[0], p.ll[1]]);
    else all.push([p.ll[0], p.ll[1], refs.length]);
  }
  candidates.sort((a, b) => (b.focus - a.focus) || b.n - a.n);
  for (const lm of LANDMARKS) {
    const refs = state.era === "all" ? lm.refs : lm.refs.filter(r => eraOf(r) === state.era);
    if (!refs.length) continue;
    L.marker(lm.ll, { icon: L.divIcon({ className: "mlandmark", html: `<span>⛪ ${esc(lm.ko)}</span><em>${refs.map(r => esc(label(r))).join(" · ")}</em>`, iconSize: [180, 34], iconAnchor: [-6, 17] }) })
      .addTo(layer).bindPopup(`<div class="mpop"><b>${esc(lm.ko)}</b><p class="mp-i">${esc(lm.note)}</p>${refs.map(r => `<a href="#" class="mref" data-go="${r}">${esc(label(r))}</a>`).join(" ")}</div>`);
  }
  if (state.focus.length && state.route) {
    const line = state.focus.map(f => geo.byFid.get(f)).filter(Boolean).map(p => [p.ll[0], p.ll[1]]);
    L.polyline(line, { color: "#a4282a", weight: 3, dashArray: "6 6" }).addTo(layer);
  }
  if (shown.length) map.fitBounds(L.latLngBounds(shown).pad(shown.length === 1 ? 2.5 : 0.6), { maxZoom: 9 });
  else if (state.era !== "all" && all.length) {
    // Frame the places that carry most of the era's references, so a few far-off mentions don't zoom it out.
    const top = all.sort((a, b) => b[2] - a[2]).slice(0, Math.max(6, Math.round(all.length * 0.4)));
    const w = top.reduce((n, p) => n + p[2], 0);
    const cy = top.reduce((n, p) => n + p[0] * p[2], 0) / w, cx = top.reduce((n, p) => n + p[1] * p[2], 0) / w;
    const near = top.filter(p => Math.abs(p[0] - cy) < 4.5 && Math.abs(p[1] - cx) < 6).map(p => [p[0], p[1]]);
    map.fitBounds(L.latLngBounds(near.length >= 3 ? near : top.map(p => [p[0], p[1]])).pad(0.15), { maxZoom: 8 });
  } else map.setView([33.5, 37.5], 5);
  placeLabels();
  setTimeout(() => map.invalidateSize(), 120);
}

// Names are placed most-important first and skipped where they would overlap one already placed.
function placeLabels() {
  const L = window.L;
  if (!map || !L) return;
  labelLayer?.remove();
  labelLayer = L.layerGroup().addTo(map);
  const boxes = [];
  const size = map.getSize();
  let placed = 0;
  const overlaps = box => boxes.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
  // Region names only where the region is drawn big enough to hold its name.
  for (const { r, bounds } of regionLabels) {
    const a = map.latLngToContainerPoint(bounds.getNorthWest()), z = map.latLngToContainerPoint(bounds.getSouthEast());
    const w = r.name.length * 15 + 8, h = 20;
    if (z.x - a.x < w * 0.9 || z.y - a.y < h * 1.4) continue;
    const c = map.latLngToContainerPoint(bounds.getCenter());
    const box = [c.x - w / 2, c.y - h / 2, c.x + w / 2, c.y + h / 2];
    if (overlaps(box)) continue;
    boxes.push(box);
    L.marker(bounds.getCenter(), { interactive: false, icon: L.divIcon({ className: "mregion", html: `<span style="color:${r.color}">${esc(r.name)}</span>`, iconSize: [w, h], iconAnchor: [w / 2, h / 2] }) }).addTo(labelLayer);
  }
  for (const c of candidates) {
    if (placed > 70) break;
    const pt = map.latLngToContainerPoint(c.ll);
    if (pt.x < 0 || pt.y < 0 || pt.x > size.x || pt.y > size.y) continue;
    const name = c.p.ko || c.p.en;
    const w = name.length * (c.focus ? 14 : 12.5) + 10, h = 18;
    const box = [pt.x + 7, pt.y - h / 2, pt.x + 7 + w, pt.y + h / 2];
    if (!c.focus && boxes.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
    boxes.push(box);
    placed++;
    L.marker(c.ll, { interactive: false, icon: L.divIcon({ className: `mlabel${c.focus ? " focus" : ""}`, html: `<span>${esc(name)}</span>`, iconSize: [w, h], iconAnchor: [-7, h / 2] }) }).addTo(labelLayer);
  }
  // Present-day country names go last, only where they don't cover a biblical place.
  if (layers.borders && extra.borders) {
    for (const [lat, lon, ko] of extra.borders.labels) {
      const pt = map.latLngToContainerPoint([lat, lon]);
      if (pt.x < 0 || pt.y < 0 || pt.x > size.x || pt.y > size.y) continue;
      const w = ko.length * 11 + 6, h = 14;
      const box = [pt.x - w / 2, pt.y - h / 2, pt.x + w / 2, pt.y + h / 2];
      if (boxes.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
      boxes.push(box);
      L.marker([lat, lon], { interactive: false, icon: L.divIcon({ className: "mcountry", html: `<span>${esc(ko)}</span>`, iconSize: [w, h], iconAnchor: [w / 2, h / 2] }) }).addTo(labelLayer);
    }
  }
}

export const TYPE_KO = {
  settlement: "도시·마을", region: "지역", mountain: "산", campsite: "광야 진영지", river: "강", valley: "골짜기", gate: "성문", island: "섬",
  hill: "언덕", "body of water": "바다·호수", "natural area": "자연 지역", structure: "건축물", spring: "샘", special: "특별 장소",
  "mountain range": "산맥", pool: "못", road: "길", "district in settlement": "성읍 구역", well: "우물", tree: "나무", "people group": "민족 지역",
  altar: "제단", garden: "동산", field: "들", hall: "전각", fortification: "요새", ford: "나루", cliff: "절벽", rock: "바위",
  promontory: "곶", room: "방", canal: "운하", "mountain pass": "고개", "stone heap": "돌무더기", wadi: "와디(마른 시내)", forest: "수풀",
};
function popupHtml(p, refs) {
  const byBook = new Map();
  for (const r of refs) { const b = parse(r).b; if (!byBook.has(b)) byBook.set(b, []); byBook.get(b).push(r); }
  const im = lib.placeImages?.[p.id];
  const intro = extra.intros[p.id];
  const rows = [...byBook].slice(0, 10).map(([b, rs]) => `<div class="mp-b"><b>${esc(lib.byId.get(b).ab)}</b> ${rs.slice(0, 6).map(r =>
    `<a href="#" class="mref" data-go="${r}">${parse(r).c}:${parse(r).v}</a>`).join(" ")}${rs.length > 6 ? ` <span>외 ${rs.length - 6}</span>` : ""}</div>`).join("");
  return `<div class="mpop">${im ? `<img class="mp-img" src="${esc(im.src)}" alt=""><div class="mp-cr">${esc(im.credit)} · ${esc(im.license)}</div>` : ""}
    <div class="mp-h"><b>${esc(p.ko || p.en)}</b> <span>${esc(p.en)} · ${esc(TYPE_KO[p.type] || p.type || "장소")}</span></div>
    ${intro ? `<p class="mp-i">${esc(intro)}</p>` : ""}
    <div class="mp-m">성경 ${p.refs.length}회 언급${state.era !== "all" ? ` · ${esc(state.era)} ${refs.length}회` : ""}</div>${rows}
    <a href="#" class="mp-more" data-place="${esc(p.id)}">자세히 보기 ›</a></div>`;
}

document.addEventListener("click", e => {
  const more = e.target.closest?.(".mp-more");
  if (more) { e.preventDefault(); closeMap(); document.dispatchEvent(new CustomEvent("open-place", { detail: more.dataset.place })); return; }
  const a = e.target.closest?.(".mref");
  if (!a) return;
  e.preventDefault();
  closeMap();
  goTo?.(a.dataset.go, { flash: true });
});
