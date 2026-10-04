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

    const [{ data: notes }, localNotes] = await Promise.all([db.from("annotations").select("id, document_id, data, deleted, updated_at"), annotationRepository.listAll()]);
    const remoteNotes = new Map((notes ?? []).map(row => [row.id as string, row])), localById = new Map(localNotes.map(note => [note.id, note]));
    for (const row of remoteNotes.values()) {
      const note = localById.get(row.id);
      if (row.deleted) { if (note && note.updatedAt <= row.updated_at) await annotationRepository.removeRaw(row.id); continue; }
      if (!note || row.updated_at > note.updatedAt) await annotationRepository.putRaw(row.data as Annotation);
    }
    for (const note of localNotes) { const row = remoteNotes.get(note.id); if (!row || note.updatedAt > row.updated_at) await pushAnnotation(note.id, note.documentId, false); }

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
  const key = change.kind === "document" ? `d:${change.id}` : change.kind === "annotation" ? `a:${change.id}` : `t:${change.documentId}`;
  const previous = queued.get(key);
  queued.set(key, change.kind === "translation" && previous?.kind === "translation" ? { ...change, unitIds: [...new Set([...previous.unitIds, ...change.unitIds])] } : change);
  clearTimeout(timer);
  timer = setTimeout(() => void flush(), 1500);
}
async function flush() {
  const changes = [...queued.values()]; queued.clear();
  for (const change of changes) {
    try {
      if (change.kind === "document") { const doc = await documentRepository.getDocument(change.id); if (doc) await pushDocument(doc); }
      else if (change.kind === "annotation") await pushAnnotation(change.id, change.documentId, Boolean(change.deleted));
      else if (change.kind === "translation") await pushTranslations(change.documentId, change.unitIds);
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
  void client.auth.getSession().then(({ data }) => applySession(data.session));
  client.auth.onAuthStateChange((event, next) => { if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") void applySession(next); else session = next; });
}
