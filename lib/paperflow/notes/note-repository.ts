import { openDatabase, requestResult, transactionDone } from "../persistence/indexeddb";
import type { QuickNote } from "./notebook";

/** Notebook notes, kept on this device in the "notes" store. */
export const noteRepository = {
  async list(): Promise<QuickNote[]> { const db = await openDatabase(); return requestResult<QuickNote[]>(db.transaction("notes").objectStore("notes").getAll()); },
  async put(note: QuickNote) { const db = await openDatabase(), tx = db.transaction("notes", "readwrite"), done = transactionDone(tx); tx.objectStore("notes").put(note); await done; },
  async remove(id: string) { const db = await openDatabase(), tx = db.transaction("notes", "readwrite"), done = transactionDone(tx); tx.objectStore("notes").delete(id); await done; }
};
