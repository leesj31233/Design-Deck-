import type { DocumentRecord, Highlight } from "../types";
import { STORES, openDatabase, requestToPromise, transactionDone } from "./idb";

/**
 * Persistence boundaries. Phase 1 ships an IndexedDB implementation; a Supabase
 * implementation (Postgres rows + Storage objects, RLS per user) can satisfy the
 * same interfaces later without touching the reader.
 */
export interface DocumentRepository {
  list(): Promise<DocumentRecord[]>;
  get(id: string): Promise<DocumentRecord | undefined>;
  /** Upserts metadata only. Never touches the binary. */
  putRecord(record: DocumentRecord): Promise<void>;
  /** Stores the original bytes once. Rejects if different bytes exist for the hash. */
  putBinaryOnce(sha256: string, bytes: ArrayBuffer): Promise<void>;
  getBinary(sha256: string): Promise<ArrayBuffer | undefined>;
}

export interface HighlightRepository {
  listByDocument(documentId: string): Promise<Highlight[]>;
  put(highlight: Highlight): Promise<void>;
  remove(id: string): Promise<void>;
}

export class ImmutableBinaryError extends Error {
  constructor(sha256: string) {
    super(`Refusing to overwrite immutable binary ${sha256.slice(0, 12)}…`);
    this.name = "ImmutableBinaryError";
  }
}

export function createIndexedDbRepositories(factory?: IDBFactory, name?: string) {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = () => (dbPromise ??= openDatabase(factory, name));

  const documents: DocumentRepository = {
    async list() {
      const tx = (await db()).transaction(STORES.documents, "readonly");
      const all = await requestToPromise(tx.objectStore(STORES.documents).getAll() as IDBRequest<DocumentRecord[]>);
      return all.sort((a, b) => (b.lastOpenedAt ?? b.importedAt) - (a.lastOpenedAt ?? a.importedAt));
    },
    async get(id) {
      const tx = (await db()).transaction(STORES.documents, "readonly");
      return requestToPromise(tx.objectStore(STORES.documents).get(id) as IDBRequest<DocumentRecord | undefined>);
    },
    async putRecord(record) {
      const tx = (await db()).transaction(STORES.documents, "readwrite");
      tx.objectStore(STORES.documents).put(record);
      await transactionDone(tx);
    },
    async putBinaryOnce(sha256, bytes) {
      const tx = (await db()).transaction(STORES.binaries, "readwrite");
      const store = tx.objectStore(STORES.binaries);
      const existing = await requestToPromise(store.get(sha256) as IDBRequest<ArrayBuffer | undefined>);
      if (existing) {
        if (existing.byteLength !== bytes.byteLength) {
          tx.abort();
          throw new ImmutableBinaryError(sha256);
        }
        return;
      }
      // Store a private copy so later mutation/transfer of `bytes` cannot affect it.
      store.add(bytes.slice(0), sha256);
      await transactionDone(tx);
    },
    async getBinary(sha256) {
      const tx = (await db()).transaction(STORES.binaries, "readonly");
      return requestToPromise(tx.objectStore(STORES.binaries).get(sha256) as IDBRequest<ArrayBuffer | undefined>);
    },
  };

  const highlights: HighlightRepository = {
    async listByDocument(documentId) {
      const tx = (await db()).transaction(STORES.highlights, "readonly");
      const index = tx.objectStore(STORES.highlights).index("documentId");
      const all = await requestToPromise(index.getAll(documentId) as IDBRequest<Highlight[]>);
      return all.sort((a, b) => a.anchor.pageIndex - b.anchor.pageIndex || (a.anchor.textPosition?.start ?? 0) - (b.anchor.textPosition?.start ?? 0));
    },
    async put(highlight) {
      const tx = (await db()).transaction(STORES.highlights, "readwrite");
      tx.objectStore(STORES.highlights).put(highlight);
      await transactionDone(tx);
    },
    async remove(id) {
      const tx = (await db()).transaction(STORES.highlights, "readwrite");
      tx.objectStore(STORES.highlights).delete(id);
      await transactionDone(tx);
    },
  };

  return { documents, highlights };
}

let browserRepos: ReturnType<typeof createIndexedDbRepositories> | null = null;
export function getRepositories() {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB is not available in this environment.");
  return (browserRepos ??= createIndexedDbRepositories());
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
