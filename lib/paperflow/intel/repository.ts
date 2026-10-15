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
  const briefs = (Array.isArray(raw.briefs) ? raw.briefs : []).slice(0, 40).flatMap((brief, index) => { const value = brief as Partial<IntelBrief>; const briefId = text(value?.id, 80), title = text(value?.title, 200), body = longText(value?.body, 60_000); return briefId && /^[\w.:-]+$/.test(briefId) && title && body ? [{ id: briefId, title, body, order: Number.isFinite(value.order) ? Number(value.order) : index, pack: id }] : []; });
  return { format: "paperflow-intel", version: 1, id, title: text(raw.title, 200), generatedAt: text(raw.generatedAt, 40) ?? new Date().toISOString(), items, briefs };
}

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
    const tx = db.transaction(["intel", "intelBriefs"], "readwrite"), done = transactionDone(tx);
    let added = 0, updated = 0;
    for (const item of pack.items) {
      const before = existing.get(item.id);
      if (before) updated++; else added++;
      tx.objectStore("intel").put({ ...item, user: before?.user, addedAt: before?.addedAt ?? now, updatedAt: now });
    }
    for (const brief of pack.briefs ?? []) tx.objectStore("intelBriefs").put({ ...brief, updatedAt: now });
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
