import { openDatabase, requestResult, transactionDone } from "../persistence/indexeddb";
import { emitLocalChange } from "../persistence/changes";
import type { QuickNote } from "./notebook";

/** Notes deleted on this device, kept until the account has heard about it (so they never come back). */
const TOMBSTONES = "paperflow-note-tombstones";
export function noteTombstones(): Record<string, string> { try { return JSON.parse(localStorage.getItem(TOMBSTONES) ?? "{}"); } catch { return {}; } }
export function forgetTombstone(id: string) { try { const all = noteTombstones(); delete all[id]; localStorage.setItem(TOMBSTONES, JSON.stringify(all)); } catch { /* sent again next sync */ } }

/** Notebook notes: kept on this device in the "notes" store and mirrored to the account when signed in. */
export const noteRepository = {
  async list(): Promise<QuickNote[]> { const db = await openDatabase(); return requestResult<QuickNote[]>(db.transaction("notes").objectStore("notes").getAll()); },
  async put(note: QuickNote) { await noteRepository.putRaw(note); emitLocalChange({ kind: "note", id: note.id }); },
  async remove(id: string) {
    await noteRepository.removeRaw(id);
    try { localStorage.setItem(TOMBSTONES, JSON.stringify({ ...noteTombstones(), [id]: new Date().toISOString() })); } catch { /* the push below still tries */ }
    emitLocalChange({ kind: "note", id, deleted: true });
  },
  /** Sync only: write or delete without announcing a local change. */
  async putRaw(note: QuickNote) { const db = await openDatabase(), tx = db.transaction("notes", "readwrite"), done = transactionDone(tx); tx.objectStore("notes").put(note); await done; },
  async removeRaw(id: string) { const db = await openDatabase(), tx = db.transaction("notes", "readwrite"), done = transactionDone(tx); tx.objectStore("notes").delete(id); await done; }
};
