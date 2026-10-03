import { fixTerminology } from "../translation/research-style";
import { openDatabase, requestResult, transactionDone } from "./indexeddb";
import { emitLocalChange } from "./changes";

export interface StoredTranslation { id: string; documentId: string; pageIndex: number; source: string; text: string; provider: "OpenAI"; createdAt: string; unitId?: string; blockId?: string; promptVersion?: string }
import { TRANSLATION_PROMPT_VERSION } from "../translation/prompt-version";
export { TRANSLATION_PROMPT_VERSION };
const unitKey = (documentId: string, unitId: string) => `unit:${TRANSLATION_PROMPT_VERSION}:${documentId}:${unitId}`;

export const translationRepository = {
  async listByDocument(documentId: string): Promise<StoredTranslation[]> {
    const db = await openDatabase(), store = db.transaction("translations").objectStore("translations");
    return requestResult<StoredTranslation[]>(store.indexNames.contains("documentId") ? store.index("documentId").getAll(documentId) : store.getAll()).then(items => items.filter(item => item.documentId === documentId));
  },
  /** Current-version unit translations only. */
  async unitTexts(documentId: string): Promise<Map<string, string>> {
    const items = await translationRepository.listByDocument(documentId);
    return new Map(items.filter(item => item.unitId && item.promptVersion === TRANSLATION_PROMPT_VERSION && item.text.trim()).map(item => [item.unitId!, fixTerminology(item.text)]));
  },
  /** One transaction per model response, not per paragraph. */
  async putUnits(documentId: string, items: { unitId: string; pageIndex: number; source: string; text: string }[], announce = true) {
    if (!items.length) return;
    const db = await openDatabase(), tx = db.transaction("translations", "readwrite"), done = transactionDone(tx), store = tx.objectStore("translations"), now = new Date().toISOString();
    for (const item of items) store.put({ id: unitKey(documentId, item.unitId), documentId, unitId: item.unitId, promptVersion: TRANSLATION_PROMPT_VERSION, pageIndex: item.pageIndex, source: item.source, text: item.text, provider: "OpenAI", createdAt: now } satisfies StoredTranslation);
    await done;
    if (announce) emitLocalChange({ kind: "translation", documentId, unitIds: items.map(item => item.unitId) });
  },
  async removeUnits(documentId: string, unitIds: string[]) {
    const db = await openDatabase(), tx = db.transaction("translations", "readwrite"), done = transactionDone(tx), store = tx.objectStore("translations");
    for (const unitId of unitIds) store.delete(unitKey(documentId, unitId));
    await done;
  }
};
