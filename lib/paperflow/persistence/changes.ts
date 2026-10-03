/**
 * Local change notifications. The repositories announce what they wrote; the cloud sync (when an
 * account is signed in) listens and mirrors it. The persistence layer never imports cloud code.
 */
export type LocalChange =
  | { kind: "document"; id: string }
  | { kind: "annotation"; id: string; documentId: string; deleted?: boolean }
  | { kind: "translation"; documentId: string; unitIds: string[] };

const listeners = new Set<(change: LocalChange) => void>();
export function onLocalChange(listener: (change: LocalChange) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function emitLocalChange(change: LocalChange) { for (const listener of listeners) { try { listener(change); } catch { /* A listener must never break a local write. */ } } }

/** A PDF missing on this device can be fetched from the account's cloud storage, when there is one. */
let remoteBlob: ((documentId: string) => Promise<Blob | null>) | null = null;
export function setRemoteBlobLoader(loader: typeof remoteBlob) { remoteBlob = loader; }
export function loadRemoteBlob(documentId: string) { return remoteBlob ? remoteBlob(documentId) : Promise.resolve(null); }
