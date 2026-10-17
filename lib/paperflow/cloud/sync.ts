"use client";
import { create } from "zustand";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { cloudClient } from "./browser";
import { PAPER_BUCKET, paperPath, type AccountPlan } from "./config";
import { documentRepository } from "../persistence/document-repository";
import { annotationRepository } from "../persistence/annotation-repository";
import { translationRepository, TRANSLATION_PROMPT_VERSION } from "../persistence/translation-repository";
import { onLocalChange, setRemoteBlobLoader, type LocalChange } from "../persistence/changes";
import { openDatabase, transactionDone } from "../persistence/indexeddb";
import type { StoredDocument } from "../persistence/types";
import { recordOf, rowOf, type DocumentRow } from "./records";
import type { Annotation } from "../anchors/types";
import { forgetTombstone, noteRepository, noteTombstones } from "../notes/note-repository";
import type { QuickNote } from "../notes/notebook";
import { intelRepository } from "../intel/repository";
import type { IntelBrief, IntelItem } from "../intel/types";

/**
 * Notebook notes travel in the annotations table under this document id (rows "note:<id>"), so they
 * sync with the account without a schema change; the annotation merge skips them.
 */
const NOTEBOOK = "__notebook__";
/** The Intelligence tab rides the same table: rows "intel:<id>" (items) and "intelbrief:<id>" (briefings). */
const INTEL = "__intel__";

export type CloudStatus = "disabled" | "loading" | "signed-out" | "signed-in";
interface CloudState {
  status: CloudStatus; email?: string; name?: string; avatar?: string; plan?: AccountPlan;
  syncing: boolean; lastSyncedAt?: string; error?: string;
}
export const useCloud = create<CloudState>(() => ({ status: "loading", syncing: false }));
const set = (patch: Partial<CloudState>) => useCloud.setState(patch);

let session: Session | null = null;
const supabase = () => cloudClient() as SupabaseClient;

async function refreshPlan() {
  try { const account = await (await fetch("/api/cloud/account")).json(); if (account.plan) set({ plan: account.plan }); } catch { /* Keep the previous plan. */ }
}

/** Upload one PDF if this account keeps PDFs in the cloud and the quota allows it. */
async function uploadPdf(doc: StoredDocument): Promise<string | null> {
  if (useCloud.getState().plan?.mode !== "cloud") return null;
  const blob = await documentRepository.getDocumentBlob(doc.id);
  if (!blob) return null;
  const response = await fetch("/api/cloud/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: doc.id, byteLength: blob.size }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { if (response.status === 413) set({ error: body.error }); return null; }
  const { error } = await supabase().storage.from(PAPER_BUCKET).uploadToSignedUrl(body.path, body.token, blob, { contentType: "application/pdf", upsert: true });
  if (error) return null;
  return body.path as string;
}

async function pushDocument(doc: StoredDocument, remote?: DocumentRow) {
  if (!session) return;
  let storagePath = remote?.storage_path ?? doc.storagePath ?? null;
  if (!storagePath && doc.sourceStatus !== "remote") storagePath = await uploadPdf(doc);
  await supabase().from("documents").upsert(rowOf(session.user.id, doc, storagePath), { onConflict: "user_id,id" });
  if (storagePath && doc.storagePath !== storagePath) await documentRepository.putRecord({ ...doc, storagePath, sourceStatus: "cloud" });
}

async function pushAnnotation(id: string, documentId: string, deleted: boolean) {
  if (!session) return;
  const local = deleted ? null : (await annotationRepository.listByDocument(documentId)).find(item => item.id === id);
  await supabase().from("annotations").upsert({ user_id: session.user.id, id, document_id: documentId, data: local ?? {}, deleted: deleted || !local, updated_at: local?.updatedAt ?? new Date().toISOString() }, { onConflict: "user_id,id" });
}

async function pushNote(id: string, deleted: boolean) {
  if (!session) return;
  const local = deleted ? null : (await noteRepository.list()).find(note => note.id === id) ?? null;
  await supabase().from("annotations").upsert({ user_id: session.user.id, id: `note:${id}`, document_id: NOTEBOOK, data: local ?? {}, deleted: !local, updated_at: local?.updatedAt ?? noteTombstones()[id] ?? new Date().toISOString() }, { onConflict: "user_id,id" });
  if (!local) forgetTombstone(id);
}

/** Items and briefings of the Intelligence tab, a hundred rows per request (a pack brings hundreds at once). */
async function pushIntel(ids: string[], briefIds: string[]) {
  if (!session || (!ids.length && !briefIds.length)) return;
  const items = new Map((await intelRepository.list()).map(item => [item.id, item])), briefs = new Map((await intelRepository.briefs()).map(brief => [brief.id, brief]));
  const rows = [
    ...ids.flatMap(id => { const item = items.get(id); return item ? [{ user_id: session!.user.id, id: `intel:${id}`, document_id: INTEL, data: item, deleted: false, updated_at: item.updatedAt ?? new Date().toISOString() }] : []; }),
    ...briefIds.flatMap(id => { const brief = briefs.get(id); return brief ? [{ user_id: session!.user.id, id: `intelbrief:${id}`, document_id: INTEL, data: brief, deleted: false, updated_at: brief.updatedAt ?? new Date().toISOString() }] : []; })
  ];
  for (let at = 0; at < rows.length; at += 100) await supabase().from("annotations").upsert(rows.slice(at, at + 100), { onConflict: "user_id,id" });
}

/** Every intelligence row's id and date, a thousand at a time (the Intelligence tab keeps growing). */
async function intelDates() {
  const rows: { id: string; updated_at: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase().from("annotations").select("id, updated_at").eq("document_id", INTEL).order("id").range(from, from + 999);
    if (error) return { data: rows.length ? rows : null };
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return { data: rows };
  }
}

async function pushTranslations(documentId: string, unitIds?: string[]) {
  if (!session) return;
  const items = (await translationRepository.listByDocument(documentId)).filter(item => item.unitId && item.promptVersion === TRANSLATION_PROMPT_VERSION && (!unitIds || unitIds.includes(item.unitId)));
  for (let start = 0; start < items.length; start += 400) {
    await supabase().from("translations").upsert(items.slice(start, start + 400).map(item => ({ user_id: session!.user.id, document_id: documentId, unit_id: item.unitId!, prompt_version: TRANSLATION_PROMPT_VERSION, page_index: item.pageIndex, text: item.text, updated_at: item.createdAt })), { onConflict: "user_id,document_id,unit_id" });
  }
}

// Purges are remembered on the device until the account has them, so a paper deleted for good while
// offline (or signed out) is not pulled back from the account by the next sync.
type Purge = Extract<LocalChange, { kind: "purge" }>;
const PURGE_KEY = "paperflow-pending-purges";
function pendingPurges(): Purge[] { try { return JSON.parse(localStorage.getItem(PURGE_KEY) ?? "[]"); } catch { return []; } }
function setPendingPurges(items: Purge[]) { try { if (items.length) localStorage.setItem(PURGE_KEY, JSON.stringify(items)); else localStorage.removeItem(PURGE_KEY); } catch { /* Retried from memory only. */ } }

/**
 * Delete a paper from the account for good: the PDF, marks and translations. The document row stays
 * as a small tombstone (metadata.purged) so every other device removes its copy instead of
 * uploading it again.
 */
async function purgeRemote(item: Purge) {
  if (!session) return false;
  const db = supabase(), uid = session.user.id, now = new Date().toISOString();
  await db.storage.from(PAPER_BUCKET).remove([paperPath(uid, item.id)]);
  const [notes, texts] = await Promise.all([db.from("annotations").delete().eq("document_id", item.id), db.from("translations").delete().eq("document_id", item.id)]);
  const { error } = await db.from("documents").upsert({ user_id: uid, id: item.id, filename: item.filename || "deleted.pdf", title: item.title || "deleted", byte_length: Math.max(1, item.byteLength), page_count: item.pageCount || 1, storage_path: null, metadata: { purged: true }, archived: false, updated_at: now }, { onConflict: "user_id,id" });
  return !error && !notes.error && !texts.error;
}
async function flushPurges() {
  const left: Purge[] = [];
  for (const item of pendingPurges()) { try { if (!(await purgeRemote(item))) left.push(item); } catch { left.push(item); } }
  setPendingPurges(left);
}

/** Two-way merge of the whole library; the newer side wins per paper, note and translation. */
export async function syncAll() {
  if (!session || useCloud.getState().syncing) return;
  set({ syncing: true, error: undefined });
  try {
    const db = supabase();
    await flushPurges();
    const [{ data: rows, error }, local] = await Promise.all([db.from("documents").select("id, filename, title, byte_length, page_count, storage_path, metadata, archived, created_at, updated_at"), documentRepository.listDocuments()]);
    if (error) throw error;
    const remote = new Map((rows as DocumentRow[] ?? []).map(row => [row.id, row])), mine = new Map(local.map(doc => [doc.id, doc]));
    const purged = new Set([...remote.values()].filter(row => (row.metadata as { purged?: boolean } | null)?.purged).map(row => row.id));
    for (const id of purged) { if (mine.has(id)) { await documentRepository.removeDocument(id); mine.delete(id); } remote.delete(id); }
    for (const row of remote.values()) {
      const doc = mine.get(row.id);
      if (!doc || row.updated_at > doc.updatedAt) await documentRepository.putRecord(recordOf(row, doc));
    }
    const uploads = useCloud.getState().plan?.mode === "cloud";
    for (const doc of local) { if (purged.has(doc.id)) continue; const row = remote.get(doc.id); if (!row || doc.updatedAt > row.updated_at || (uploads && !row.storage_path && doc.sourceStatus !== "remote")) await pushDocument(doc, row); }

    const [{ data: notes }, { data: intelIndex }, localNotes] = await Promise.all([
      db.from("annotations").select("id, document_id, data, deleted, updated_at").neq("document_id", INTEL),
      // The Intelligence tab grows with images: list it by date first and fetch only what changed.
      intelDates(),
      annotationRepository.listAll()
    ]);
    // A device on an older version may have stored a notebook note as a mark (it has no document): drop it.
    for (const stray of localNotes.filter(note => !note.documentId)) await annotationRepository.removeRaw(stray.id);
    const remoteNotes = new Map((notes ?? []).filter(row => row.document_id !== NOTEBOOK && row.document_id !== INTEL).map(row => [row.id as string, row])), localById = new Map(localNotes.map(note => [note.id, note]));
    for (const row of remoteNotes.values()) {
      const note = localById.get(row.id);
      if (row.deleted) { if (note && note.updatedAt <= row.updated_at) await annotationRepository.removeRaw(row.id); continue; }
      if (!note || row.updated_at > note.updatedAt) await annotationRepository.putRaw(row.data as Annotation);
    }
    for (const note of localNotes.filter(item => item.documentId)) { const row = remoteNotes.get(note.id); if (!row || note.updatedAt > row.updated_at) await pushAnnotation(note.id, note.documentId, false); }

    // Notebook: newest wins; a note deleted anywhere is deleted everywhere.
    const notebookRows = (notes ?? []).filter(row => row.document_id === NOTEBOOK);
    const localNotebook = new Map((await noteRepository.list()).map(note => [note.id, note])), tombstones = noteTombstones();
    for (const row of notebookRows) {
      const id = String(row.id).slice(5), mine = localNotebook.get(id);
      if (row.deleted) { if (mine && mine.updatedAt <= row.updated_at) { await noteRepository.removeRaw(id); localNotebook.delete(id); } continue; }
      if (tombstones[id]) continue;
      if (!mine || row.updated_at > mine.updatedAt) { await noteRepository.putRaw(row.data as QuickNote); localNotebook.set(id, row.data as QuickNote); }
    }
    const notebookRemote = new Map(notebookRows.map(row => [String(row.id).slice(5), row]));
    for (const note of localNotebook.values()) { const row = notebookRemote.get(note.id); if (!row || note.updatedAt > row.updated_at) await pushNote(note.id, false); }
    for (const id of Object.keys(tombstones)) await pushNote(id, true);

    // Intelligence: newest wins, item by item (the reader's star/folder/memo travel inside the item).
    const localIntel = new Map((await intelRepository.list()).map(item => [item.id, item])), localBriefs = new Map((await intelRepository.briefs()).map(brief => [brief.id, brief])), localMedia = await intelRepository.mediaDates();
    const newer = (intelIndex ?? []).filter(row => {
      const id = String(row.id);
      if (id.startsWith("intelmedia:")) return row.updated_at > (localMedia.get(id.slice(11)) ?? "");
      const mine = id.startsWith("intelbrief:") ? localBriefs.get(id.slice(11)) : localIntel.get(id.slice(6)); return !mine || row.updated_at > (mine.updatedAt ?? "");
    }).map(row => String(row.id));
    const fetched = new Map<string, unknown>();
    for (let at = 0; at < newer.length; at += 40) { const { data } = await db.from("annotations").select("id, data").eq("document_id", INTEL).in("id", newer.slice(at, at + 40)); for (const row of data ?? []) fetched.set(String(row.id), row.data); }
    const intelRows = (intelIndex ?? []).map(row => ({ ...row, data: fetched.get(String(row.id)) }));
    const intelPush: string[] = [], briefPush: string[] = [], seenIntel = new Set<string>(), seenBriefs = new Set<string>();
    for (const row of intelRows) {
      const rowId = String(row.id);
      if (rowId.startsWith("intelmedia:")) {
        const id = rowId.slice(11), cover = (row.data as { cover?: string } | undefined)?.cover;
        if (cover && row.updated_at > (localMedia.get(id) ?? "")) await intelRepository.putCover(id, cover, row.updated_at);
      } else if (rowId.startsWith("intelbrief:")) {
        const id = rowId.slice(11), mine = localBriefs.get(id); seenBriefs.add(id);
        if (!mine || row.updated_at > (mine.updatedAt ?? "")) { if (row.data) await intelRepository.putBriefRaw(row.data as IntelBrief); }
        else if ((mine.updatedAt ?? "") > row.updated_at) briefPush.push(id);
      } else if (rowId.startsWith("intel:")) {
        const id = rowId.slice(6), mine = localIntel.get(id); seenIntel.add(id);
        // A pack delivered by the research routine carries the facts; the reader's star, folder and memo stay.
        if (!mine || row.updated_at > (mine.updatedAt ?? "")) { if (!row.data) continue; const remote = row.data as IntelItem; const keep = mine?.user && (mine.user.updatedAt ?? "") > (remote.user?.updatedAt ?? ""); await intelRepository.putRaw(keep ? { ...remote, user: mine!.user } : remote); if (keep) intelPush.push(id); }
        else if ((mine.updatedAt ?? "") > row.updated_at) intelPush.push(id);
      }
    }
    for (const id of localIntel.keys()) if (!seenIntel.has(id)) intelPush.push(id);
    for (const id of localBriefs.keys()) if (!seenBriefs.has(id)) briefPush.push(id);
    await pushIntel(intelPush, briefPush);

    // Translations: pull what this device lacks, push what the account lacks.
    const { data: keys } = await db.from("translations").select("document_id, unit_id").eq("prompt_version", TRANSLATION_PROMPT_VERSION);
    const remoteKeys = new Set((keys ?? []).map(key => `${key.document_id}|${key.unit_id}`));
    const docs = await documentRepository.listDocuments();
    for (const doc of docs) {
      const texts = await translationRepository.unitTexts(doc.id);
      const missingRemote = [...texts.keys()].filter(unitId => !remoteKeys.has(`${doc.id}|${unitId}`));
      if (missingRemote.length) await pushTranslations(doc.id, missingRemote);
      const remoteForDoc = [...remoteKeys].filter(key => key.startsWith(`${doc.id}|`)).length;
      if (remoteForDoc > texts.size) {
        const { data: pulled } = await db.from("translations").select("unit_id, page_index, text").eq("document_id", doc.id).eq("prompt_version", TRANSLATION_PROMPT_VERSION);
        const fresh = (pulled ?? []).filter(row => !texts.has(row.unit_id));
        if (fresh.length) await translationRepository.putUnits(doc.id, fresh.map(row => ({ unitId: row.unit_id, pageIndex: row.page_index, source: "", text: row.text })), false);
      }
    }
    set({ lastSyncedAt: new Date().toISOString() });
    await refreshPlan();
    window.dispatchEvent(new CustomEvent("paperflow:library-synced"));
  } catch (error) { set({ error: error instanceof Error ? error.message : "동기화하지 못했습니다." }); }
  finally { set({ syncing: false }); }
}

// Local edits are mirrored shortly after they happen, coalesced per item.
const queued = new Map<string, LocalChange>();
let timer: ReturnType<typeof setTimeout> | undefined;
function queue(change: LocalChange) {
  if (change.kind === "purge") { setPendingPurges([...pendingPurges().filter(item => item.id !== change.id), change]); if (session) void flushPurges(); return; }
  if (!session) return;
  const key = change.kind === "document" ? `d:${change.id}` : change.kind === "annotation" ? `a:${change.id}` : change.kind === "note" ? `n:${change.id}` : change.kind === "intel" ? `i:${change.brief ? "b" : ""}${change.id}` : `t:${change.documentId}`;
  const previous = queued.get(key);
  queued.set(key, change.kind === "translation" && previous?.kind === "translation" ? { ...change, unitIds: [...new Set([...previous.unitIds, ...change.unitIds])] } : change);
  clearTimeout(timer);
  timer = setTimeout(() => void flush(), 1500);
}
async function flush() {
  const changes = [...queued.values()]; queued.clear();
  const intel = changes.filter(change => change.kind === "intel");
  try { await pushIntel(intel.filter(change => !change.brief).map(change => change.id), intel.filter(change => change.brief).map(change => change.id)); }
  catch { set({ error: "일부 변경을 계정에 저장하지 못했습니다. 다음 동기화 때 다시 시도합니다." }); }
  for (const change of changes) {
    try {
      if (change.kind === "document") { const doc = await documentRepository.getDocument(change.id); if (doc) await pushDocument(doc); }
      else if (change.kind === "annotation") await pushAnnotation(change.id, change.documentId, Boolean(change.deleted));
      else if (change.kind === "translation") await pushTranslations(change.documentId, change.unitIds);
      else if (change.kind === "note") await pushNote(change.id, Boolean(change.deleted));
    } catch { set({ error: "일부 변경을 계정에 저장하지 못했습니다. 다음 동기화 때 다시 시도합니다." }); }
  }
  set({ lastSyncedAt: new Date().toISOString() });
}

async function downloadPdf(documentId: string): Promise<Blob | null> {
  if (!session) return null;
  const doc = await documentRepository.getDocument(documentId);
  if (!doc?.storagePath) return null;
  const { data, error } = await supabase().storage.from(PAPER_BUCKET).download(doc.storagePath);
  return error ? null : data;
}

const ACCOUNT_KEY = "paperflow-account";
/**
 * The local library belongs to one account. A first sign-in adopts what is already on this device
 * (it is uploaded); signing in as someone else clears it first, so libraries never mix.
 */
async function adoptDevice(userId: string) {
  let previous: string | null = null;
  try { previous = localStorage.getItem(ACCOUNT_KEY); } catch { /* Storage blocked: treat as first use. */ }
  if (previous && previous !== userId) {
    const db = await openDatabase(), stores = [...db.objectStoreNames];
    const tx = db.transaction(stores, "readwrite"), done = transactionDone(tx);
    for (const store of stores) tx.objectStore(store).clear();
    await done;
  }
  try { localStorage.setItem(ACCOUNT_KEY, userId); } catch { /* Next sign-in adopts again. */ }
}

async function applySession(next: Session | null) {
  session = next;
  if (!next) { set({ status: "signed-out", email: undefined, name: undefined, avatar: undefined, plan: undefined }); return; }
  const meta = next.user.user_metadata ?? {};
  set({ status: "signed-in", email: next.user.email, name: meta.full_name ?? meta.name, avatar: meta.avatar_url ?? meta.picture });
  await adoptDevice(next.user.id);
  await refreshPlan();
  // Local-storage accounts keep every PDF on this device: ask the browser not to evict it.
  if (useCloud.getState().plan?.mode === "local") void navigator.storage?.persist?.();
  void syncAll();
}

let started = false;
/** Start listening for the account session; safe to call more than once. */
export function initCloud() {
  if (started) return;
  started = true;
  const client = cloudClient();
  if (!client) { set({ status: "disabled" }); return; }
  setRemoteBlobLoader(downloadPdf);
  onLocalChange(queue);
  // Credits change with every translation: refresh the plan when a whole-paper job ends or the window returns.
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const refreshSoon = () => { if (!session) return; clearTimeout(refreshTimer); refreshTimer = setTimeout(() => void refreshPlan(), 800); };
  window.addEventListener("paperflow:translation-progress", event => { if (!(event as CustomEvent<{ running?: boolean }>).detail?.running) refreshSoon(); });
  window.addEventListener("focus", refreshSoon);
  let lastFocusSync = Date.now();
  const syncOnReturn = () => { if (!session || document.visibilityState === "hidden" || Date.now() - lastFocusSync < 60_000) return; lastFocusSync = Date.now(); void syncAll(); };
  window.addEventListener("focus", syncOnReturn); document.addEventListener("visibilitychange", syncOnReturn);
  window.addEventListener("paperflow:credits-changed", refreshSoon);
  void client.auth.getSession().then(({ data }) => applySession(data.session));
  client.auth.onAuthStateChange((event, next) => { if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") void applySession(next); else session = next; });
}
