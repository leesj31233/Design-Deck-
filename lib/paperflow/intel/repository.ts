import { openDatabase, requestResult, transactionDone } from "../persistence/indexeddb";
import { emitLocalChange } from "../persistence/changes";
import type { IntelBrief, IntelItem, IntelKind, IntelPack, IntelStage, IntelStatus, IntelUserState } from "./types";

const KINDS: IntelKind[] = ["source", "company", "project", "vendor", "equipment", "market", "gap"];
const STATUSES: IntelStatus[] = ["verified", "claimed", "estimate", "unverified"];
const STAGES: IntelStage[] = ["research", "pilot", "construction", "commissioning", "commercial-production", "commercial-sales", "stopped"];
export const INTEL_EVENT = "paperflow:intel";

const text = (value: unknown, max = 600) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) || undefined : undefined;
const longText = (value: unknown, max = 4000) => typeof value === "string" ? value.trim().slice(0, max) || undefined : undefined;
/** Only web links: a pack is data, and a javascript: or file: link must never reach an anchor. */
const link = (value: unknown) => { const url = text(value, 1000); try { return url && /^https?:$/.test(new URL(url).protocol) ? url : undefined; } catch { return undefined; } };

/** One item from a pack, checked field by field; anything malformed is dropped rather than trusted. */
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
    titleKo: text(value.titleKo, 400), summaryKo: longText(value.summaryKo, 2400), org: text(value.org, 200), authors: text(value.authors, 300), date: text(value.date, 20),
    pdfUrl: link(value.pdfUrl), lang: text(value.lang, 8), country: text(value.country, 120), sourceType: text(value.sourceType, 40),
    reliability: Number.isInteger(reliability) && reliability >= 1 && reliability <= 7 ? reliability : undefined,
    status: STATUSES.includes(value.status as IntelStatus) ? value.status as IntelStatus : undefined,
    stage: STAGES.includes(value.stage as IntelStage) ? value.stage as IntelStage : undefined,
    data: list(value.data, entry => { const label = text(entry.label, 160), datum = text(entry.value === undefined ? undefined : String(entry.value), 160); return label && datum ? { label, value: datum, unit: text(entry.unit, 40), basis: text(entry.basis, 160), where: text(entry.where, 160) } : null; }),
    relations: list(value.relations, entry => { const to = text(entry.to, 160), type = text(entry.type, 40); return to && type ? { to, type } : null; }),
    equipment: equipment && Object.keys(equipment).length ? equipment : undefined,
    naysor: naysor && Object.keys(naysor).length ? naysor : undefined,
    profile: record(value.profile),
    dossier: dossierOf(value.dossier),
    update: updateOf(value.update),
    logo: typeof value.logo === "string" && /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value.logo) && value.logo.length < 60_000 ? value.logo : undefined,
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
  const briefs = (Array.isArray(raw.briefs) ? raw.briefs : []).slice(0, 40).flatMap((brief, index) => { const value = brief as Partial<IntelBrief>; const briefId = text(value?.id, 80), title = text(value?.title, 200), body = longText(value?.body, 60_000); return briefId && /^[\w.:-]+$/.test(briefId) && title && body ? [{ id: briefId, title, body, order: Number.isFinite(value.order) ? Number(value.order) : index, period: PERIODS.includes(value.period as string) ? value.period : "core", date: text(value.date, 20), pack: id }] : []; });
  // Terms the briefings use (FIT, LCA, GGL…), kept as a hidden briefing so they sync like the rest.
  const glossary = (Array.isArray((raw as { glossary?: unknown }).glossary) ? (raw as { glossary: unknown[] }).glossary : []).slice(0, 500).flatMap(entry => {
    const value = entry as Record<string, unknown>, term = text(value?.term, 60), full = text(value?.full, 200), meaning = text(value?.meaning, 600);
    return term && full && meaning ? [{ term, full, meaning, note: text(value.note, 600), aliases: Array.isArray(value.aliases) ? value.aliases.flatMap(alias => text(alias, 60) ? [text(alias, 60)!] : []).slice(0, 6) : undefined }] : [];
  });
  if (glossary.length) briefs.push({ id: "__glossary__", title: "용어집", body: JSON.stringify(glossary), order: 999, period: "core", date: undefined, pack: id });
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
    sources: rows(value.sources, 30).flatMap(source => text(source.ref, 20) && text(source.title, 300) ? [{ ref: text(source.ref, 20)!, title: text(source.title, 300)!, org: text(source.org, 160), date: text(source.date, 20), url: link(source.url), pdfUrl: link(source.pdfUrl), where: text(source.where, 160), kind: text(source.kind, 40), reliability: Number.isInteger(source.reliability) ? Number(source.reliability) : undefined }] : [])
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
export const intelRepository = {
  async list(): Promise<IntelItem[]> { const db = await openDatabase(); return requestResult<IntelItem[]>(db.transaction("intel").objectStore("intel").getAll()); },
  async briefs(): Promise<IntelBrief[]> { const db = await openDatabase(); return (await requestResult<IntelBrief[]>(db.transaction("intelBriefs").objectStore("intelBriefs").getAll())).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); },
  /**
   * Merge a pack: new items are added, items already here are refreshed with the pack's facts while
   * the reader's own decisions (star, folder, memo, hidden) are kept.
   */
  async importPack(pack: IntelPack) {
    const db = await openDatabase(), now = new Date().toISOString();
    const existing = new Map((await intelRepository.list()).map(item => [item.id, item]));
    const earlier = (await intelRepository.briefs()).find(brief => brief.id === "__glossary__");
    const tx = db.transaction(["intel", "intelBriefs"], "readwrite"), done = transactionDone(tx);
    let added = 0, updated = 0;
    for (const item of pack.items) {
      const before = existing.get(item.id);
      if (before) updated++; else added++;
      tx.objectStore("intel").put({ ...item, user: before?.user, addedAt: before?.addedAt ?? now, updatedAt: now });
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
  async putRaw(item: IntelItem) { const db = await openDatabase(), tx = db.transaction("intel", "readwrite"), done = transactionDone(tx); tx.objectStore("intel").put(item); await done; announce(); },
  async putBriefRaw(brief: IntelBrief) { const db = await openDatabase(), tx = db.transaction("intelBriefs", "readwrite"), done = transactionDone(tx); tx.objectStore("intelBriefs").put(brief); await done; announce(); }
};
