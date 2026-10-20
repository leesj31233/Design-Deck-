import type { ArchiveFolder, StoredDocument } from "../persistence/types";

/** Icons and tints an archive folder can wear (lucide icon names, rendered by the folder tiles). */
export const FOLDER_ICONS = ["folder", "flask", "atom", "leaf", "flame", "cpu", "camera", "book", "star", "lightbulb", "globe", "factory"] as const;
export const FOLDER_COLORS = ["#1f7a5a", "#2f6fdb", "#7b5cd6", "#d0533f", "#d98a1c", "#3a8f96", "#c24f8a", "#59626b"] as const;

const KEY = "paperflow-archive-folders";
const EVENT = "paperflow:archive-folders";

function read(): ArchiveFolder[] {
  try { const value = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(value) ? value.filter(item => item && typeof item.id === "string" && typeof item.name === "string") : []; } catch { return []; }
}
function write(folders: ArchiveFolder[]) {
  try { localStorage.setItem(KEY, JSON.stringify(folders)); } catch { /* private mode: folders still travel with their papers */ }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Folders this device knows, plus every folder a paper is filed in: a paper carries its folder with
 * it (synced with the paper), so another device sees the same folders without a separate table.
 * Only an empty folder lives on this device alone.
 */
export function archiveFolders(docs: StoredDocument[]): ArchiveFolder[] {
  const byId = new Map(read().map(folder => [folder.id, folder]));
  for (const doc of docs) if (doc.archiveFolder && !doc.deletedAt) {
    // A sub-folder brings its parents along (the intelligence tree: 인텔리전스 PDF › Class › kind).
    for (let folder: ArchiveFolder | undefined = doc.archiveFolder; folder; folder = folder.parent) {
      const known = byId.get(folder.id), { parent: _parent, ...plain } = folder;
      void _parent;
      // The newest edit of a folder wins (a rename on another device).
      if (!known || (folder.updatedAt ?? "") > (known.updatedAt ?? "")) byId.set(folder.id, plain);
    }
  }
  return [...byId.values()].filter(folder => !folder.removed).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** A folder and the folders above it, nearest first. */
export function folderChain(id: string | undefined, folders: ArchiveFolder[]) {
  const byId = new Map(folders.map(folder => [folder.id, folder])), chain: ArchiveFolder[] = [];
  for (let folder = id ? byId.get(id) : undefined; folder && chain.length < 8; folder = folder.parentId ? byId.get(folder.parentId) : undefined) chain.push(folder);
  return chain;
}

export function newFolder(name: string, icon: string, color: string): ArchiveFolder {
  const now = new Date().toISOString();
  return { id: `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: name.trim().slice(0, 40), icon, color, createdAt: now, updatedAt: now };
}

export function saveFolder(folder: ArchiveFolder) {
  const folders = read().filter(item => item.id !== folder.id);
  write([...folders, { ...folder, updatedAt: new Date().toISOString() }]);
}

export function forgetFolder(id: string) { write(read().filter(item => item.id !== id)); }

export function onFoldersChange(listener: () => void) {
  window.addEventListener(EVENT, listener);
  const storage = (event: StorageEvent) => { if (event.key === KEY) listener(); };
  window.addEventListener("storage", storage);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener("storage", storage); };
}
