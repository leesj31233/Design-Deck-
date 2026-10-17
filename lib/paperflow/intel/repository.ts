import { openDatabase, requestResult, transactionDone } from "../persistence/indexeddb";
import { emitLocalChange } from "../persistence/changes";
import { REGISTRY_BRIEF, cleanRegistry } from "./registry";
import { PRICES_BRIEF, cleanPrices } from "./prices";
import { PLACES_BRIEF, cleanPlaces } from "./places";
import { isClass, type IntelBrief, type IntelClass, type IntelItem, type IntelKind, type IntelPack, type IntelStage, type IntelStatus, type IntelUserState } from "./types";

/** Class 1 / Class 2 tags, known ones only, each once. */
export const classesOf = (value: unknown): IntelClass[] | undefined => { const list = Array.isArray(value) ? [...new Set(value.filter(isClass))] : []; return list.length ? list : undefined; };

const KINDS: IntelKind[] = ["source", "company", "project", "vendor", "equipment", "market", "gap"];
const STATUSES: IntelStatus[] = ["verified", "claimed", "estimate", "unverified"];
const STAGES: IntelStage[] = ["research", "pilot", "construction", "commissioning", "commercial-production", "commercial-sales", "stopped"];
export const INTEL_EVENT = "paperflow:intel";

const text = (value: unknown, max = 600) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) || undefined : undefined;
const longText = (value: unknown, max = 4000) => typeof value === "string" ? value.trim().slice(0, max) || undefined : undefined;
/** Only web links: a pack is data, and a javascript: or file: link must never reach an anchor. */
const link = (value: unknown) => { const url = text(value, 1000); try { return url && /^https?:$/.test(new URL(url).protocol) ? url : undefined; } catch { return undefined; } };

/** One item from a pack, checked field by field; anything malformed is dropped rather than trusted. */
/** Reported figures: a fiscal year and a source link are required; every figure is a short printed string. */
function financialsOf(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>, fiscalYear = text(raw.fiscalYear, 20), source = link(raw.source);
  if (!fiscalYear || !source) return undefined;
  const field = (key: string) => text(raw[key], 40);
  return { fiscalYear, source, currency: text(raw.currency, 12), revenue: field("revenue"), operatingProfit: field("operatingProfit"), netIncome: field("netIncome"), totalAssets: field("totalAssets"), equity: field("equity"), employees: field("employees"), marketCap: field("marketCap"), note: text(raw.note, 160) };
}

function refsOf(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [key, ref] of Object.entries(value as Record<string, unknown>).slice(0, 30)) { const clean = typeof ref === "string" && /^https?:/.test(ref) ? link(ref) : text(ref, 20); if (clean && /^[\w-]{1,24}$/.test(key)) out[key] = clean; }
  return Object.keys(out).length ? out : undefined;
}
function peopleOf(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const out = value.flatMap((person: Record<string, unknown>) => { const name = text(person?.name, 60), title = text(person?.title, 80); return name && title ? [{ name, title, background: text(person?.background, 240), ref: text(person?.ref, 20), url: link(person?.url) }] : []; }).slice(0, 8);
  return out.length ? out : undefined;
}

const PLACE_KINDS = new Set(["hq", "plant", "project", "site", "port", "other"]), PRECISIONS = new Set(["exact", "street", "city", "region"]);
/** Map places: finite coordinates in range, a short label, a known kind and precision; at most 6. */
function placesOf(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const out = value.flatMap((place: Record<string, unknown>) => {
    const lat = Number(place?.lat), lng = Number(place?.lng), label = text(place?.label, 80), kind = text(place?.kind, 10), precision = text(place?.precision, 10);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !label || !PLACE_KINDS.has(kind ?? "") || !PRECISIONS.has(precision ?? "")) return [];
    return [{ lat, lng, label, kind: kind as "hq", precision: precision as "exact", address: text(place?.address, 200), ref: link(place?.ref) }];
  }).slice(0, 6);
  return out.length ? out : undefined;
}

export function cleanItem(raw: unknown, pack?: string): IntelItem | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const id = text(value.id, 120), title = text(value.title, 400), url = link(value.url);
  if (!id || !/^[\w.:-]+$/.test(id) || !title) return null;
  const kind = KINDS.includes(value.kind as IntelKind) ? value.kind as IntelKind : "source";
  // A gap (an open question) may have no source yet; everything else needs one.
  if (!url && kind !== "gap") return null;
  const list = <T,>(input: unknown, map: (entry: Record<string, unknown>) => T | null, max = 40) => Array.isArray(input) ? input.slice(0, max).flatMap(entry => entry && typeof entry === "object" ? [map(entry as Record<string, unknown>)].filter((item): item is T => item !== null) : []) : undefined;
  const reliability = Number(value.reliability);
  const naysor = value.naysor && typeof value.naysor === "object" ? Object.fromEntries(Object.entries(value.naysor as Record<string, unknown>).flatMap(([key, entry]) => ["new", "fit", "designChange", "testVars", "capex", "quality", "scaleup", "questions"].includes(key) && text(entry, 1500) ? [[key, text(entry, 1500)]] : [])) : undefined;
  const equipment = value.equipment && typeof value.equipment === "object" ? Object.fromEntries(Object.entries(value.equipment as Record<string, unknown>).slice(0, 30).flatMap(([key, entry]) => text(key, 40) && (typeof entry === "string" || typeof entry === "number") ? [[text(key, 40)!, text(String(entry), 300)!]] : [])) : undefined;
  return {
    id, kind, title, url: url ?? "",
    topics: (Array.isArray(value.topics) ? value.topics : []).flatMap(topic => text(topic, 40) ? [text(topic, 40)!] : []).slice(0, 12),
    classes: classesOf(value.classes),
    titleKo: text(value.titleKo, 400), summaryKo: longText(value.summaryKo, 2400), article: longText(value.article, 24_000), org: text(value.org, 200), authors: text(value.authors, 300), date: text(value.date, 20),
    pdfUrl: link(value.pdfUrl), libraryDoc: (typeof value.libraryDoc === "string" && /^[a-f0-9]{64}$/.test(value.libraryDoc) ? value.libraryDoc : undefined), lang: text(value.lang, 8), country: text(value.country, 120), sourceType: text(value.sourceType, 40),
    reliability: Number.isInteger(reliability) && reliability >= 1 && reliability <= 7 ? reliability : undefined,
    status: STATUSES.includes(value.status as IntelStatus) ? value.status as IntelStatus : undefined,
    stage: STAGES.includes(value.stage as IntelStage) ? value.stage as IntelStage : undefined,
    data: list(value.data, entry => { const label = text(entry.label, 160), datum = text(entry.value === undefined ? undefined : String(entry.value), 160); return label && datum ? { label, value: datum, unit: text(entry.unit, 40), basis: text(entry.basis, 160), where: text(entry.where, 160) } : null; }),
    relations: list(value.relations, entry => { const to = text(entry.to, 160), type = text(entry.type, 40); const evidence = text(entry.evidence, 300); return to && type ? (evidence ? { to, type, evidence } : { to, type }) : null; }),
    equipment: equipment && Object.keys(equipment).length ? equipment : undefined,
    naysor: naysor && Object.keys(naysor).length ? naysor : undefined,
    profile: record(value.profile),
    dossier: dossierOf(value.dossier),
    update: updateOf(value.update),
    logoDark: value.logoDark === true ? true : undefined, geo: placesOf(value.geo), financials: financialsOf(value.financials), profileRefs: refsOf(value.profileRefs), people: peopleOf(value.people), logo: typeof value.logo === "string" && /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value.logo) && value.logo.length < 60_000 ? value.logo : undefined,
    hasCover: value.hasCover === true ? true : undefined,
    cover: typeof value.cover === "string" && /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value.cover) && value.cover.length < 140_000 ? value.cover : undefined,
    checkedAt: text(value.checkedAt, 20), pack
  };
}

export function readPack(json: string): IntelPack {
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error("자료 팩이 올바른 JSON이 아닙니다."); }
  // A bare array of items is a pack too.
  const raw: Partial<IntelPack> = Array.isArray(value) ? { items: value } : value as Partial<IntelPack>;
  if (!raw || !Array.isArray(raw.items)) throw new Error("자료 팩에 items 목록이 없습니다.");
  const id = text(raw.id, 80) ?? `pack-${Date.now().toString(36)}`;
  const items = raw.items.slice(0, 5000).map(item => cleanItem(item, id)).filter((item): item is IntelItem => item !== null);
  const briefs: IntelBrief[] = (Array.isArray(raw.briefs) ? raw.briefs : []).slice(0, 40).flatMap((brief, index) => { const value = brief as Partial<IntelBrief>; const briefId = text(value?.id, 80), title = text(value?.title, 200), body = longText(value?.body, 60_000); return briefId && /^[\w.:-]+$/.test(briefId) && title && body ? [{ id: briefId, title, body, order: Number.isFinite(value.order) ? Number(value.order) : index, period: PERIODS.includes(value.period as string) ? value.period : "core", date: text(value.date, 20), pack: id, classes: classesOf(value.classes) }] : []; });
  // Terms the briefings use (FIT, LCA, GGL…), kept as a hidden briefing so they sync like the rest.
  const glossary = (Array.isArray((raw as { glossary?: unknown }).glossary) ? (raw as { glossary: unknown[] }).glossary : []).slice(0, 500).flatMap(entry => {
    const value = entry as Record<string, unknown>, term = text(value?.term, 60), full = text(value?.full, 200), meaning = text(value?.meaning, 600);
    return term && full && meaning ? [{ term, full, meaning, note: text(value.note, 600), aliases: Array.isArray(value.aliases) ? value.aliases.flatMap(alias => text(alias, 60) ? [text(alias, 60)!] : []).slice(0, 6) : undefined }] : [];
  });
  if (glossary.length) briefs.push({ id: "__glossary__", title: "용어집", body: JSON.stringify(glossary), order: 999, period: "core", date: undefined, pack: id });
  // The entity registry (organisations, their codes and items) travels as a hidden briefing too.
  const registry = cleanRegistry((raw as { registry?: unknown }).registry);
  if (registry) briefs.push({ id: REGISTRY_BRIEF, title: "기업 레지스트리", body: JSON.stringify(registry), order: 998, period: "core", date: undefined, pack: id });
  // So does the price board (pellet, PKS, biochar prices by market, each point with its source).
  const prices = cleanPrices((raw as { prices?: unknown }).prices);
  // And the map's base layers (palm mills, coal power plants).
  const places = cleanPlaces((raw as { places?: unknown }).places);
  if (places) briefs.push({ id: PLACES_BRIEF, title: "지도 기본 레이어", body: JSON.stringify(places), order: 996, period: "core", date: undefined, pack: id });
  if (prices) briefs.push({ id: PRICES_BRIEF, title: "가격 보드", body: JSON.stringify(prices), order: 997, period: "core", date: undefined, pack: id });
  return { format: "paperflow-intel", version: 1, id, title: text(raw.title, 200), generatedAt: text(raw.generatedAt, 40) ?? new Date().toISOString(), items, briefs };
}

/** A flat record of short texts (profile, equipment): anything else is dropped. */
function record(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const entries = Object.entries(input as Record<string, unknown>).slice(0, 30).flatMap(([key, entry]) => text(key, 40) && (typeof entry === "string" || typeof entry === "number") && text(String(entry), 600) ? [[text(key, 40)!, text(String(entry), 600)!]] : []);
  return entries.length ? Object.fromEntries(entries) : undefined;
}
/** A figure is an embedded image (WebP/PNG/JPEG, ≤ 600 KB) or a web image; nothing else is shown. */
const figureSrc = (value: unknown) => typeof value === "string" && (/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value) && value.length < 820_000 || link(value)) ? value : undefined;
function dossierOf(input: unknown): IntelItem["dossier"] {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>, headline = text(value.headline, 400);
  if (!headline) return undefined;
  const rows = (list: unknown, max: number) => (Array.isArray(list) ? list.slice(0, max) : []).filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object");
  const status = (entry: unknown) => STATUSES.includes(entry as IntelStatus) ? entry as IntelStatus : undefined;
  return {
    headline, asOf: text(value.asOf, 20),
    facts: rows(value.facts, 24).flatMap(fact => text(fact.label, 80) && text(fact.value, 300) ? [{ label: text(fact.label, 80)!, value: text(fact.value, 300)!, ref: text(fact.ref, 20), status: status(fact.status) }] : []),
    figures: rows(value.figures, 16).flatMap(figure => { const src = figureSrc(figure.src), caption = text(figure.caption, 400); return src && caption ? [{ src, caption, ref: text(figure.ref, 20), where: text(figure.where, 120) }] : []; }),
    timeline: rows(value.timeline, 40).flatMap(event => text(event.date, 20) && text(event.event, 400) ? [{ date: text(event.date, 20)!, event: text(event.event, 400)!, ref: text(event.ref, 20), status: status(event.status) }] : []),
    conflicts: rows(value.conflicts, 12).flatMap(conflict => { const topic = text(conflict.topic, 160), versions = rows(conflict.versions, 6).flatMap(version => text(version.value, 300) ? [{ value: text(version.value, 300)!, ref: text(version.ref, 20) }] : []); return topic && versions.length ? [{ topic, versions, judgement: text(conflict.judgement, 600) }] : []; }),
    sections: rows(value.sections, 16).flatMap(section => text(section.title, 120) && longText(section.body, 12_000) ? [{ title: text(section.title, 120)!, body: longText(section.body, 12_000)! }] : []),
    sources: rows(value.sources, 30).flatMap(source => text(source.ref, 20) && text(source.title, 300) ? [{ ref: text(source.ref, 20)!, title: text(source.title, 300)!, org: text(source.org, 160), date: text(source.date, 20), url: link(source.url), pdfUrl: link(source.pdfUrl), libraryDoc: typeof source.libraryDoc === "string" && /^[a-f0-9]{64}$/.test(source.libraryDoc) ? source.libraryDoc : undefined, where: text(source.where, 160), kind: text(source.kind, 40), reliability: Number.isInteger(source.reliability) ? Number(source.reliability) : undefined }] : [])
  };
}
const UPDATE_TYPES = ["report", "vision", "news", "contract", "plant", "certification", "exit", "price", "policy", "research"];
function updateOf(input: unknown): IntelItem["update"] {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>, date = text(value.date, 20);
  if (!UPDATE_TYPES.includes(value.type as string) || !date || !/^\d{4}-\d{2}(-\d{2})?$/.test(date)) return undefined;
  const entities = (Array.isArray(value.entities) ? value.entities : []).flatMap(entity => text(entity, 120) && /^[\w.:-]+$/.test(String(entity)) ? [text(entity, 120)!] : []).slice(0, 12);
  return { type: value.type as NonNullable<IntelItem["update"]>["type"], date, entities, headline: text(value.headline, 300) };
}
const PERIODS = ["core", "daily", "weekly", "monthly", "quarterly"];

const announce = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(INTEL_EVENT)); };

/** The Intelligence tab's items and briefings, kept on this device and mirrored to the account. */
/** An item's cover goes to the media store; the item keeps only the fact that it has one. */
function splitCover(item: IntelItem): { item: IntelItem; cover?: string } {
  if (!item.cover) return { item };
  const { cover, ...rest } = item;
  return { item: { ...rest, hasCover: true }, cover };
}
type IntelMedia = { id: string; cover: string; updatedAt: string };
const coverUrls = new Map<string, string>();
/** NAYSOR News: covers are pictures on the server (cached by the browser), not copies on the device. */
const remoteCovers = new Map<string, string>();
export function setRemoteCovers(urls: Record<string, string>) { for (const [id, url] of Object.entries(urls)) remoteCovers.set(id, url); }
const dataUrlToObjectUrl = (dataUrl: string) => { try { const [head, body] = dataUrl.split(","), type = /data:([^;]+)/.exec(head)?.[1] ?? "image/webp", bytes = Uint8Array.from(atob(body), char => char.charCodeAt(0)); return URL.createObjectURL(new Blob([bytes], { type })); } catch { return dataUrl; } };

export const intelRepository = {
  async list(): Promise<IntelItem[]> {
    const db = await openDatabase(), items = await requestResult<IntelItem[]>(db.transaction("intel").objectStore("intel").getAll());
    // Items written before v7 still carry their cover inline: move it out once.
    const legacy = items.filter(item => item.cover);
    if (legacy.length) {
      const tx = db.transaction(["intel", "intelMedia"], "readwrite"), done = transactionDone(tx);
      for (const old of legacy) { const { item, cover } = splitCover(old); tx.objectStore("intel").put(item); tx.objectStore("intelMedia").put({ id: item.id, cover: cover!, updatedAt: item.updatedAt ?? new Date().toISOString() }); }
      await done;
      return items.map(item => item.cover ? splitCover(item).item : item);
    }
    return items;
  },
  /** The cover as an object URL (made once per device session), or nothing when the item has none. */
  async cover(id: string): Promise<string | undefined> {
    const hit = coverUrls.get(id) ?? remoteCovers.get(id);
    if (hit) return hit;
    const db = await openDatabase(), media = await requestResult<IntelMedia | undefined>(db.transaction("intelMedia").objectStore("intelMedia").get(id));
    if (!media?.cover) return undefined;
    const url = dataUrlToObjectUrl(media.cover); coverUrls.set(id, url); return url;
  },
  /** Sync only: a cover delivered on its own row. */
  async putCover(id: string, cover: string, updatedAt: string) {
    const db = await openDatabase(), tx = db.transaction(["intel", "intelMedia"], "readwrite"), done = transactionDone(tx);
    tx.objectStore("intelMedia").put({ id, cover, updatedAt });
    const item = await requestResult<IntelItem | undefined>(tx.objectStore("intel").get(id));
    if (item && !item.hasCover) tx.objectStore("intel").put({ ...item, hasCover: true });
    await done; coverUrls.delete(id); announce();
  },
  async mediaDates(): Promise<Map<string, string>> { const db = await openDatabase(); const rows = await requestResult<IntelMedia[]>(db.transaction("intelMedia").objectStore("intelMedia").getAll()); return new Map(rows.map(row => [row.id, row.updatedAt])); },
  async briefs(): Promise<IntelBrief[]> { const db = await openDatabase(); return (await requestResult<IntelBrief[]>(db.transaction("intelBriefs").objectStore("intelBriefs").getAll())).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); },
  /**
   * Merge a pack: new items are added, items already here are refreshed with the pack's facts while
   * the reader's own decisions (star, folder, memo, hidden) are kept.
   */
  async importPack(pack: IntelPack) {
    const db = await openDatabase(), now = new Date().toISOString();
    const existing = new Map((await intelRepository.list()).map(item => [item.id, item]));
    const earlier = (await intelRepository.briefs()).find(brief => brief.id === "__glossary__");
    const tx = db.transaction(["intel", "intelBriefs", "intelMedia"], "readwrite"), done = transactionDone(tx);
    let added = 0, updated = 0;
    for (const packed of pack.items) {
      const before = existing.get(packed.id), { item, cover } = splitCover(packed);
      if (before) updated++; else added++;
      if (cover) { tx.objectStore("intelMedia").put({ id: item.id, cover, updatedAt: now }); coverUrls.delete(item.id); }
      tx.objectStore("intel").put({ ...item, hasCover: item.hasCover || before?.hasCover || undefined, user: before?.user, addedAt: before?.addedAt ?? now, updatedAt: now });
    }
    for (const brief of pack.briefs ?? []) {
      // A new pack's terms are added to (or replace) the ones already known, never wiping them.
      if (brief.id === "__glossary__" && earlier) { try { const merged = new Map<string, unknown>([...JSON.parse(earlier.body), ...JSON.parse(brief.body)].map((term: { term: string }) => [term.term, term])); tx.objectStore("intelBriefs").put({ ...brief, body: JSON.stringify([...merged.values()]), updatedAt: now }); continue; } catch { /* replaced below */ } }
      tx.objectStore("intelBriefs").put({ ...brief, updatedAt: now });
    }
    await done;
    for (const item of pack.items) emitLocalChange({ kind: "intel", id: item.id });
    for (const brief of pack.briefs ?? []) emitLocalChange({ kind: "intel", id: brief.id, brief: true });
    announce();
    return { added, updated, briefs: pack.briefs?.length ?? 0 };
  },
  async setUser(id: string, patch: Partial<IntelUserState>) {
    const db = await openDatabase(), tx = db.transaction("intel", "readwrite"), done = transactionDone(tx), store = tx.objectStore("intel");
    const item = await requestResult<IntelItem | undefined>(store.get(id));
    if (!item) return;
    const now = new Date().toISOString();
    store.put({ ...item, user: { ...item.user, ...patch, updatedAt: now }, updatedAt: now });
    await done; emitLocalChange({ kind: "intel", id }); announce();
  },
  /** Sync only: write what the account holds without announcing a local change. */
  async putRaw(raw: IntelItem) {
    const db = await openDatabase(), tx = db.transaction(["intel", "intelMedia"], "readwrite"), done = transactionDone(tx), { item, cover } = splitCover(raw);
    if (cover) { tx.objectStore("intelMedia").put({ id: item.id, cover, updatedAt: item.updatedAt ?? new Date().toISOString() }); coverUrls.delete(item.id); }
    const has = item.hasCover || Boolean(cover) || Boolean(await requestResult<IntelMedia | undefined>(tx.objectStore("intelMedia").get(item.id)));
    tx.objectStore("intel").put({ ...item, hasCover: has || undefined });
    await done; announce();
  },
  /**
   * NAYSOR News: the device holds exactly what the site publishes. Items and briefings no longer published go;
   * the visitor's own decisions on the rest (star, hidden) stay.
   */
  async replaceFeed(items: IntelItem[], briefs: IntelBrief[]) {
    const db = await openDatabase(), before = new Map((await intelRepository.list()).map(item => [item.id, item]));
    const tx = db.transaction(["intel", "intelBriefs"], "readwrite"), done = transactionDone(tx), keep = new Set(items.map(item => item.id)), keepBriefs = new Set(briefs.map(brief => brief.id));
    for (const id of before.keys()) if (!keep.has(id)) tx.objectStore("intel").delete(id);
    for (const item of items) tx.objectStore("intel").put({ ...item, user: before.get(item.id)?.user, addedAt: before.get(item.id)?.addedAt ?? item.updatedAt });
    for (const brief of await requestResult<IntelBrief[]>(tx.objectStore("intelBriefs").getAll())) if (!keepBriefs.has(brief.id)) tx.objectStore("intelBriefs").delete(brief.id);
    for (const brief of briefs) tx.objectStore("intelBriefs").put(brief);
    await done; announce();
  },
  async putBriefRaw(brief: IntelBrief) { const db = await openDatabase(), tx = db.transaction("intelBriefs", "readwrite"), done = transactionDone(tx); tx.objectStore("intelBriefs").put(brief); await done; announce(); }
};
