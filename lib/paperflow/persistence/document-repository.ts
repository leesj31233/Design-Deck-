import { openDatabase, requestResult, transactionDone } from "./indexeddb";
import type { DocumentRepository, StoredDocument } from "./types";
export const documentRepository: DocumentRepository = {
  async saveDocument({ blob, filename, pageCount, fingerprint }) {
    const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    const id = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
    const db = await openDatabase();
    const tx = db.transaction(["documents", "blobs"], "readwrite"), done = transactionDone(tx);
    const store = tx.objectStore("documents");
    const existing: StoredDocument | undefined = await requestResult(store.get(id));
    if (existing) { await done; return existing; }
    const now = new Date().toISOString();
    const record: StoredDocument = { id, filename, title: filename.replace(/\.pdf$/i, ""), mimeType: "application/pdf", byteLength: blob.size, createdAt: now, updatedAt: now, pageCount, fingerprint, blobKey: id, currentPage: 1, authors: [], researchPoolIds: [], archived: false, sourceStatus: "local" };
    store.add(record); tx.objectStore("blobs").add(blob, id);
    await done; return record;
  },
  async getDocument(id) { const db = await openDatabase(); return (await requestResult<StoredDocument | undefined>(db.transaction("documents").objectStore("documents").get(id))) ?? null; },
  async getDocumentBlob(id) { const db = await openDatabase(); return (await requestResult<Blob | undefined>(db.transaction("blobs").objectStore("blobs").get(id))) ?? null; },
  async listDocuments() { const db = await openDatabase(); const docs = await requestResult<StoredDocument[]>(db.transaction("documents").objectStore("documents").getAll()); return docs.sort((a, b) => (b.lastOpenedAt ?? b.createdAt).localeCompare(a.lastOpenedAt ?? a.createdAt)); },
  async updateDocument(id, patch) {
    const db = await openDatabase(), tx = db.transaction("documents", "readwrite"), done = transactionDone(tx), store = tx.objectStore("documents");
    const record: StoredDocument | undefined = await requestResult(store.get(id));
    if (record) store.put({ ...record, ...patch, updatedAt: new Date().toISOString() });
    await done;
  }
};
