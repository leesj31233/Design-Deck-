"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, MapPinOff, Route, X } from "lucide-react";
import { KIND_LABEL, PLACE_LABEL, UPDATE_LABEL, type IntelItem, type IntelPlace } from "@/lib/paperflow/intel/types";
import "./intel-map.css";

/* Leaflet comes from a CDN when the map is first shown (the app ships no map library); tiles from OpenStreetMap. */
const LEAFLET_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css", LEAFLET_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Leaflet = any;
let leaflet: Promise<Leaflet> | null = null;
function loadLeaflet(): Promise<Leaflet> {
  const win = window as unknown as { L?: Leaflet };
  if (win.L) return Promise.resolve(win.L);
  leaflet ??= new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) { const link = document.createElement("link"); link.rel = "stylesheet"; link.href = LEAFLET_CSS; document.head.appendChild(link); }
    const script = document.createElement("script"); script.src = LEAFLET_JS; script.async = true;
    script.onload = () => win.L ? resolve(win.L) : reject(new Error("leaflet")); script.onerror = () => reject(new Error("leaflet"));
    document.head.appendChild(script);
  });
  return leaflet;
}

/** The country a place is in: named in its address, else the item's own country, else by position. */
const REGIONS: [string, [number, number, number, number]][] = [["Singapore", [1.1, 1.5, 103.6, 104.1]], ["South Korea", [33, 39, 124, 132]], ["Japan", [24, 46, 122, 146]], ["Vietnam", [8, 24, 102, 110]], ["Thailand", [5.5, 20.5, 97, 106]], ["Malaysia", [0.8, 7.5, 99.5, 119.5]], ["Indonesia", [-11, 6, 95, 141]], ["China", [18, 54, 73, 135]], ["Europe", [35, 71, -10, 40]], ["North America", [15, 72, -170, -50]]];
const NAMES: [RegExp, string][] = [[/indonesia|jakarta|sumatra|sumatera|kalimantan|riau|jambi|medan|papua/i, "Indonesia"], [/malaysia|kuala|johor|pahang|sabah|sarawak|selangor|perak|penang|kuantan|gebeng|pasir gudang/i, "Malaysia"], [/japan|tokyo|osaka|日本|東京|大阪|saga|imari/i, "Japan"], [/korea|seoul|incheon|busan|한국|서울/i, "South Korea"], [/vietnam|viet nam|hanoi|ho chi minh/i, "Vietnam"], [/singapore/i, "Singapore"], [/thailand|bangkok/i, "Thailand"], [/china|shanghai|beijing|jiangsu/i, "China"]];
export function regionOf(place: IntelPlace, item: IntelItem) {
  for (const [pattern, name] of NAMES) if (pattern.test(place.address ?? "") || pattern.test(place.label)) return name;
  const own = (item.country ?? "").split(/[;,/]/)[0].trim().replace(/^Korea$/, "South Korea");
  if (own && !/global|^-$|europe|eu$/i.test(own) && (item.country ?? "").split(/[;,/]/).length === 1) return own;
  for (const [name, [s, n, w, e]] of REGIONS) if (place.lat >= s && place.lat <= n && place.lng >= w && place.lng <= e) return name;
  return own || "기타";
}

const RELATION_TYPES = ["investor", "operator", "partner", "supplier", "buyer", "vendor"] as const;
const RELATION_LABEL: Record<string, string> = { investor: "투자·모회사", operator: "운영", partner: "협력", supplier: "공급", buyer: "구매", vendor: "장비 공급" };
const KIND_ORDER = ["company", "project", "vendor", "market", "source", "equipment"] as const;
const dayDiff = (date: string) => (Date.now() - new Date(date.length === 7 ? `${date}-01` : date.length === 4 ? `${date}-01-01` : date).getTime()) / 86400000;

type Pin = { key: string; lat: number; lng: number; entries: { item: IntelItem; place: IntelPlace }[] };

/**
 * Companies, plants, project sites and recent events on one map: pins by place (several items at the
 * same spot share a pin with a count), filtered by country, kind and recent news, with the business
 * relations between located items drawn as lines. A pin opens the list of what is there; an entry
 * opens the item's page or panel. Only places a source states are on the map.
 */
export function IntelMap({ items, query, selected, onOpen }: { items: IntelItem[]; query: string; selected: string | null; onOpen: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null), mapRef = useRef<Leaflet>(null), layerRef = useRef<Leaflet>(null), linesRef = useRef<Leaflet>(null);
  const [ready, setReady] = useState<"loading" | "ready" | "failed">("loading");
  const [regions, setRegions] = useState<Set<string>>(new Set()), [kinds, setKinds] = useState<Set<string>>(new Set()), [recent, setRecent] = useState(false), [lines, setLines] = useState(true);
  const [active, setActive] = useState<Pin | null>(null);
  const byId = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);

  const located = useMemo(() => items.filter(item => item.geo?.length && (!query || [item.title, item.titleKo, item.org, item.country, item.profile?.hq, item.profile?.name].join(" ").toLowerCase().includes(query.toLowerCase()))), [items, query]);
  const regionCounts = useMemo(() => { const counts = new Map<string, number>(); for (const item of located) for (const place of item.geo!) { const region = regionOf(place, item); counts.set(region, (counts.get(region) ?? 0) + 1); } return [...counts].sort((a, b) => b[1] - a[1]); }, [located]);
  const shown = useMemo(() => located.filter(item => (!kinds.size || kinds.has(item.kind)) && (!recent || (item.update?.date && dayDiff(item.update.date) <= 90))), [located, kinds, recent]);
  const pins = useMemo(() => {
    const groups = new Map<string, Pin>();
    for (const item of shown) for (const place of item.geo!) {
      if (regions.size && !regions.has(regionOf(place, item))) continue;
      const key = `${place.lat.toFixed(2)},${place.lng.toFixed(2)}`, pin = groups.get(key) ?? { key, lat: place.lat, lng: place.lng, entries: [] };
      pin.entries.push({ item, place }); groups.set(key, pin);
    }
    return [...groups.values()];
  }, [shown, regions]);
  const links = useMemo(() => {
    const shownIds = new Set(pins.flatMap(pin => pin.entries.map(entry => entry.item.id))), out: { from: IntelItem; to: IntelItem; type: string }[] = [];
    for (const item of shown) for (const relation of item.relations ?? []) {
      const target = byId.get(relation.to);
      if (!target?.geo?.length || !shownIds.has(item.id) || !shownIds.has(target.id) || !(RELATION_TYPES as readonly string[]).includes(relation.type)) continue;
      out.push({ from: item, to: target, type: relation.type });
    }
    return out;
  }, [shown, pins, byId]);

  // The map itself, once.
  useEffect(() => {
    let alive = true;
    loadLeaflet().then(L => {
      if (!alive || !box.current || mapRef.current) return;
      const map = L.map(box.current, { zoomControl: true, worldCopyJump: true, minZoom: 2 }).setView([4, 112], 4);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
      mapRef.current = map; layerRef.current = L.layerGroup().addTo(map); linesRef.current = L.layerGroup().addTo(map);
      setReady("ready");
    }).catch(() => alive && setReady("failed"));
    return () => { alive = false; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, []);

  // Pins and lines follow the filters.
  const fitted = useRef(false);
  useEffect(() => {
    const L = (window as unknown as { L?: Leaflet }).L, map = mapRef.current, layer = layerRef.current, lineLayer = linesRef.current;
    if (!L || !map || !layer || ready !== "ready") return;
    layer.clearLayers(); lineLayer.clearLayers();
    const place = new Map<string, [number, number]>();
    for (const pin of pins) {
      const kind = pin.entries.map(entry => entry.item.kind).sort((a, b) => KIND_ORDER.indexOf(a as never) - KIND_ORDER.indexOf(b as never))[0];
      const isSelected = pin.entries.some(entry => entry.item.id === selected), hasNews = pin.entries.some(entry => entry.item.update?.date && dayDiff(entry.item.update.date) <= 90);
      const html = `<span class="pf-map-pin" data-kind="${kind}"${isSelected ? " data-selected" : ""}${hasNews ? " data-news" : ""}>${pin.entries.length > 1 ? pin.entries.length : ""}</span>`;
      const marker = L.marker([pin.lat, pin.lng], { icon: L.divIcon({ className: "pf-map-pin-wrap", html, iconSize: [26, 26], iconAnchor: [13, 13] }), keyboard: true, title: pin.entries.map(entry => companyLabel(entry.item)).slice(0, 3).join(", ") });
      marker.bindTooltip(pin.entries.slice(0, 4).map(entry => `${companyLabel(entry.item)} · ${PLACE_LABEL[entry.place.kind]}`).join("<br>") + (pin.entries.length > 4 ? `<br>+${pin.entries.length - 4}` : ""), { direction: "top", offset: [0, -10] });
      marker.on("click", () => setActive(pin));
      marker.addTo(layer);
      for (const entry of pin.entries) if (!place.has(entry.item.id)) place.set(entry.item.id, [pin.lat, pin.lng]);
    }
    if (lines) for (const link of links) {
      const a = place.get(link.from.id), b = place.get(link.to.id);
      if (!a || !b || (a[0] === b[0] && a[1] === b[1])) continue;
      L.polyline([a, b], { className: `pf-map-line pf-map-line-${link.type}`, weight: 1.5, opacity: .55 }).bindTooltip(`${companyLabel(link.from)} → ${companyLabel(link.to)} · ${RELATION_LABEL[link.type] ?? link.type}`, { sticky: true }).addTo(lineLayer);
    }
    // First view: the Southeast Asia–Japan region the research is about, when most pins are there; otherwise everything.
    if (!fitted.current && pins.length) {
      fitted.current = true;
      const asia = pins.filter(pin => pin.lat >= -12 && pin.lat <= 47 && pin.lng >= 94 && pin.lng <= 147);
      map.fitBounds((asia.length >= pins.length / 2 ? asia : pins).map(pin => [pin.lat, pin.lng]), { padding: [40, 40], maxZoom: 7 });
    }
  }, [pins, links, lines, selected, ready]);

  const toggle = <T,>(set: Set<T>, value: T) => { const next = new Set(set); if (next.has(value)) next.delete(value); else next.add(value); return next; };
  const missing = items.length - located.length;
  return <section className="pf-map" aria-label="지도">
    <div className="pf-map-filters">
      <div role="group" aria-label="국가">{regionCounts.map(([region, count]) => <button type="button" key={region} aria-pressed={regions.has(region)} onClick={() => setRegions(toggle(regions, region))}>{region}<i>{count}</i></button>)}</div>
      <div role="group" aria-label="구분">{KIND_ORDER.filter(kind => located.some(item => item.kind === kind)).map(kind => <button type="button" key={kind} data-kind={kind} aria-pressed={kinds.has(kind)} onClick={() => setKinds(toggle(kinds, kind))}><b/>{KIND_LABEL[kind]}</button>)}</div>
      <button type="button" aria-pressed={recent} onClick={() => setRecent(!recent)}>최근 90일 소식</button>
      <button type="button" aria-pressed={lines} onClick={() => setLines(!lines)}><Route size={13}/>관계선 {links.length}</button>
      <span className="pf-map-count">{pins.reduce((sum, pin) => sum + pin.entries.length, 0)}곳 · {shown.length}건{missing > 0 && <> · <MapPinOff size={12}/>위치 미확인 {missing}건</>}</span>
    </div>
    <div className="pf-map-stage">
      <div ref={box} className="pf-map-canvas" role="application" aria-label="기업·공장·프로젝트 지도"/>
      {ready === "loading" && <p className="pf-map-note">지도를 불러오는 중…</p>}
      {ready === "failed" && <p className="pf-map-note">지도 라이브러리를 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 여세요.</p>}
      {active && <aside className="pf-map-list" aria-label="이 위치의 항목">
        <header><b>{active.entries[0].place.address ?? active.entries[0].place.label}</b><small>{active.entries.length}건</small><button type="button" aria-label="닫기" onClick={() => setActive(null)}><X size={15}/></button></header>
        <ul>{active.entries.map(({ item, place }, index) => <li key={`${item.id}-${index}`}>
          <button type="button" onClick={() => onOpen(item.id)}>
            {item.logo ? <span className="pf-map-logo" data-dark={item.logoDark || undefined}><img src={item.logo} alt=""/></span> : <span className="pf-map-logo"><Building2 size={16}/></span>}
            <span>
              <b>{companyLabel(item)}</b>
              <small>{[KIND_LABEL[item.kind], PLACE_LABEL[place.kind], place.label].filter(Boolean).join(" · ")}{place.precision !== "exact" && place.precision !== "street" ? ` · ${place.precision === "city" ? "도시 단위" : "지역 단위"}` : ""}</small>
              {item.update && <small className="pf-map-news"><em>{UPDATE_LABEL[item.update.type]}</em> {item.update.date} {item.update.headline ?? ""}</small>}
            </span>
          </button>
        </li>)}</ul>
      </aside>}
    </div>
  </section>;
}

const companyLabel = (item: IntelItem) => (item.profile?.name ?? item.titleKo ?? item.title).split(/ [—–] /)[0].replace(/\(케이스 파일\)/, "").trim();
