import { documentRepository } from "../persistence/document-repository";
import { emitLocalChange } from "../persistence/changes";
import type { StoredDocument } from "../persistence/types";

/**
 * The trash. Deleting a paper only marks it (it syncs, and can be restored); after TRASH_DAYS, or
 * when emptied by hand, it is purged: gone from this device and from the account, everywhere.
 */
export const TRASH_DAYS = 30;
const DAY = 86_400_000;

export const inTrash = (doc: Pick<StoredDocument, "deletedAt">) => Boolean(doc.deletedAt);

/** Whole days left before the automatic purge (0 = purged at the next check). */
export function daysLeft(deletedAt: string, now = Date.now()) {
  return Math.max(0, TRASH_DAYS - Math.floor((now - new Date(deletedAt).getTime()) / DAY));
}
export function expired(doc: Pick<StoredDocument, "deletedAt">, now = Date.now()) {
  return Boolean(doc.deletedAt) && now - new Date(doc.deletedAt!).getTime() >= TRASH_DAYS * DAY;
}

export async function moveToTrash(id: string) { await documentRepository.updateDocument(id, { deletedAt: new Date().toISOString() }); }
// null rather than undefined: the cleared field must reach the account, or other devices keep it trashed.
export async function restoreFromTrash(id: string) { await documentRepository.updateDocument(id, { deletedAt: null }); }

/** Permanent delete. The account copy (PDF, marks, translations) is removed by the cloud sync. */
export async function purgeDocument(doc: StoredDocument) {
  await documentRepository.removeDocument(doc.id);
  emitLocalChange({ kind: "purge", id: doc.id, title: doc.title, filename: doc.filename, byteLength: doc.byteLength, pageCount: doc.pageCount });
}

/** Purge everything that has been in the trash for TRASH_DAYS; returns how many papers went. */
export async function purgeExpired(now = Date.now()) {
  const gone = (await documentRepository.listDocuments()).filter(doc => expired(doc, now));
  for (const doc of gone) await purgeDocument(doc);
  return gone.length;
}
