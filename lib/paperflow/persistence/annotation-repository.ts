import type { Annotation } from "../anchors/types";
import { openDatabase, requestResult, transactionDone } from "./indexeddb";
import type { AnnotationRepository } from "./types";
async function write(annotation: Annotation, method: "add" | "put") {
  const db = await openDatabase(), tx = db.transaction("annotations", "readwrite"), done = transactionDone(tx);
  tx.objectStore("annotations")[method](annotation); await done;
}
export const annotationRepository: AnnotationRepository = {
  create: annotation => write(annotation, "add"), update: annotation => write(annotation, "put"),
  async listByDocument(id) { const db = await openDatabase(); return requestResult<Annotation[]>(db.transaction("annotations").objectStore("annotations").index("documentId").getAll(id)); },
  async listAll() { const db = await openDatabase(); return requestResult<Annotation[]>(db.transaction("annotations").objectStore("annotations").getAll()); },
  async remove(id) { const db = await openDatabase(), tx = db.transaction("annotations", "readwrite"), done = transactionDone(tx); tx.objectStore("annotations").delete(id); await done; }
};
