let connection: Promise<IDBDatabase> | undefined;
export function openDatabase(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("이 브라우저에서는 로컬 저장소를 사용할 수 없습니다.")); return; }
    const request = indexedDB.open("paperflow-v1", 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("documents")) db.createObjectStore("documents", { keyPath: "id" });
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
      if (!db.objectStoreNames.contains("annotations")) { const annotations = db.createObjectStore("annotations", { keyPath: "id" }); annotations.createIndex("documentId", "documentId"); }
      if (!db.objectStoreNames.contains("translations")) db.createObjectStore("translations", { keyPath: "id" });
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
