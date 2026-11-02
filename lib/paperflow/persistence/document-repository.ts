import { openDatabase, requestResult, transactionDone } from "./indexeddb";
import type { DocumentRepository, StoredDocument } from "./types";
import { emitLocalChange, loadRemoteBlob } from "./changes";
export const documentRepository: DocumentRepository = {
  async saveDocument({ blob, filename, pageCount, fingerprint }) {
    const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    const id = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
    const db = await openDatabase();
    const tx = db.transaction(["documents", "blobs"], "readwrite"), done = transactionDone(tx);
    const store = tx.objectStore("documents");
    const existing: StoredDocument | undefined = await requestResult(store.get(id));
    if (existing) {
      // A paper listed by the account but stored on another device: importing the same file links it here.
      const blobs = tx.objectStore("blobs");
      if (!(await requestResult(blobs.getKey(id)))) blobs.put(blob, id);
      await done; return existing;
    }
    const now = new Date().toISOString();
    const record: StoredDocument = { id, filename, title: filename.replace(/\.pdf$/i, ""), mimeType: "application/pdf", byteLength: blob.size, createdAt: now, updatedAt: now, pageCount, fingerprint, blobKey: id, currentPage: 1, authors: [], researchPoolIds: [], archived: false, sourceStatus: "local" };
    store.add(record); tx.objectStore("blobs").add(blob, id);
    await done; emitLocalChange({ kind: "document", id }); return record;
  },
  async getDocument(id) { const db = await openDatabase(); return (await requestResult<StoredDocument | undefined>(db.transaction("documents").objectStore("documents").get(id))) ?? null; },
  async getDocumentBlob(id, options) {
    const db = await openDatabase();
    const local = await requestResult<Blob | undefined>(db.transaction("blobs").objectStore("blobs").get(id));
    if (local || options?.remote === false) return local ?? null;
    // Not on this device yet: the account's cloud copy, cached here once downloaded.
    const remote = await loadRemoteBlob(id);
    if (remote) await documentRepository.putBlob(id, remote);
    return remote;
  },
  async putBlob(id, blob) { const db = await openDatabase(), tx = db.transaction("blobs", "readwrite"), done = transactionDone(tx); tx.objectStore("blobs").put(blob, id); await done; },
  async putRecord(record) { const db = await openDatabase(), tx = db.transaction("documents", "readwrite"), done = transactionDone(tx); tx.objectStore("documents").put(record); await done; },
  async listDocuments() { const db = await openDatabase(); const docs = await requestResult<StoredDocument[]>(db.transaction("documents").objectStore("documents").getAll()); return docs.sort((a, b) => (b.lastOpenedAt ?? b.createdAt).localeCompare(a.lastOpenedAt ?? a.createdAt)); },
  async updateDocument(id, patch) {
    const db = await openDatabase(), tx = db.transaction("documents", "readwrite"), done = transactionDone(tx), store = tx.objectStore("documents");
    const record: StoredDocument | undefined = await requestResult(store.get(id));
    if (record) store.put({ ...record, ...patch, visitedPages: patch.currentPage ? [...new Set([...(record.visitedPages ?? []), patch.currentPage])] : record.visitedPages, updatedAt: new Date().toISOString() });
    await done;
    if (record) emitLocalChange({ kind: "document", id });
  },
  async removeDocument(id) {
    const db = await openDatabase(), stores = ["documents", "blobs", "annotations", "translations", "translationManifests"].filter(name => db.objectStoreNames.contains(name));
    const tx = db.transaction(stores, "readwrite"), done = transactionDone(tx);
    tx.objectStore("documents").delete(id); tx.objectStore("blobs").delete(id);
    if (stores.includes("translationManifests")) tx.objectStore("translationManifests").delete(id);
    for (const name of ["annotations", "translations"]) {
      if (!stores.includes(name)) continue;
      const request = tx.objectStore(name).index("documentId").openKeyCursor(IDBKeyRange.only(id));
      request.onsuccess = () => { const cursor = request.result; if (cursor) { tx.objectStore(name).delete(cursor.primaryKey); cursor.continue(); } };
    }
    await done;
  }
};
