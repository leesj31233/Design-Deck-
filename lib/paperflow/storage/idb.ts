/** Minimal promise wrapper around IndexedDB (no dependency needed for three stores). */

export const DB_NAME = "paperflow";
export const DB_VERSION = 1;

export const STORES = {
  documents: "documents",
  binaries: "binaries",
  highlights: "highlights",
} as const;

export function openDatabase(factory: IDBFactory = indexedDB, name = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.documents)) db.createObjectStore(STORES.documents, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORES.binaries)) db.createObjectStore(STORES.binaries);
      if (!db.objectStoreNames.contains(STORES.highlights)) {
        const store = db.createObjectStore(STORES.highlights, { keyPath: "id" });
        store.createIndex("documentId", "documentId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB upgrade blocked by another tab."));
  });
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });
}
