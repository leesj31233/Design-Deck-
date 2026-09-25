import { openDatabase, requestResult, transactionDone } from "./indexeddb";

export interface StoredTranslation { id: string; documentId: string; pageIndex: number; source: string; text: string; provider: "device" | "MyMemory"; createdAt: string }
const idFor = (documentId: string, pageIndex: number, source: string) => `${documentId}:${pageIndex}:${source.replace(/\s+/g, " ").trim()}`;
export const translationRepository = {
  async get(documentId: string, pageIndex: number, source: string) {
    const db = await openDatabase();
    return (await requestResult<StoredTranslation | undefined>(db.transaction("translations").objectStore("translations").get(idFor(documentId, pageIndex, source)))) ?? null;
  },
  async put(documentId: string, pageIndex: number, source: string, text: string, provider: StoredTranslation["provider"]) {
    const db = await openDatabase(), tx = db.transaction("translations", "readwrite"), done = transactionDone(tx);
    tx.objectStore("translations").put({ id: idFor(documentId, pageIndex, source), documentId, pageIndex, source, text, provider, createdAt: new Date().toISOString() } satisfies StoredTranslation);
    await done;
  }
};
