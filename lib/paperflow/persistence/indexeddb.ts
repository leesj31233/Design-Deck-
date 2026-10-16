let connection: Promise<IDBDatabase> | undefined;
/** The device database. The public NAYSOR News site keeps its own ("naysor-news-v1"), so a visitor's marks and a
 * signed-in reader's library never share a store, even on the same address. Chosen before anything opens it. */
let databaseName = "paperflow-v1";
export function selectDatabase(name: string) { if (name !== databaseName) { databaseName = name; connection = undefined; } }
export function openDatabase(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("이 브라우저에서는 로컬 저장소를 사용할 수 없습니다.")); return; }
    const request = indexedDB.open(databaseName, 7);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("documents")) db.createObjectStore("documents", { keyPath: "id" });
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
      if (!db.objectStoreNames.contains("annotations")) { const annotations = db.createObjectStore("annotations", { keyPath: "id" }); annotations.createIndex("documentId", "documentId"); }
      const translations = db.objectStoreNames.contains("translations") ? request.transaction!.objectStore("translations") : db.createObjectStore("translations", { keyPath: "id" });
      // v4: read one paper's translations without scanning every paper in the library.
      if (!translations.indexNames.contains("documentId")) translations.createIndex("documentId", "documentId");
      if (!db.objectStoreNames.contains("translationManifests")) db.createObjectStore("translationManifests", { keyPath: "documentId" });
      // v5: the library notebook's quick notes (added only; nothing older changes).
      if (!db.objectStoreNames.contains("notes")) db.createObjectStore("notes", { keyPath: "id" });
      // v6: the Intelligence tab (collected sources, companies, vendors, market data) and its briefings.
      if (!db.objectStoreNames.contains("intel")) db.createObjectStore("intel", { keyPath: "id" });
      if (!db.objectStoreNames.contains("intelBriefs")) db.createObjectStore("intelBriefs", { keyPath: "id" });
      // v7: item covers (big images) apart from the items, so the list loads and syncs without them.
      if (!db.objectStoreNames.contains("intelMedia")) db.createObjectStore("intelMedia", { keyPath: "id" });
    };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); connection = undefined; }; resolve(request.result); };
    request.onerror = () => { connection = undefined; reject(request.error); };
    request.onblocked = () => { connection = undefined; reject(new Error("다른 PAPERFLOW 탭을 닫고 다시 시도해 주세요.")); };
  });
  return connection;
}
export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error ?? new Error("저장을 완료하지 못했습니다.")); transaction.onerror = () => reject(transaction.error); });
}
export async function closeDatabase() { const db = await connection; db?.close(); connection = undefined; }
