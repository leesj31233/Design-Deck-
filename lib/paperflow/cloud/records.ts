import type { StoredDocument } from "../persistence/types";

/** Reading state and bibliography that travel with a paper; the PDF bytes travel separately. */
const META_KEYS = ["visitedPages", "opens", "keywords", "citationCount", "metadataSource", "metadataCheckedAt", "jif", "currentPage", "lastOpenedAt", "authors", "journal", "year", "doi", "researchPoolIds", "fingerprint"] as const;
export type DocumentRow = { id: string; filename: string; title: string; byte_length: number; page_count: number; storage_path: string | null; metadata: Record<string, unknown>; archived: boolean; created_at: string; updated_at: string };

export function rowOf(userId: string, doc: StoredDocument, storagePath: string | null): DocumentRow & { user_id: string } {
  const metadata: Record<string, unknown> = {};
  for (const key of META_KEYS) if (doc[key] !== undefined) metadata[key] = doc[key];
  return { user_id: userId, id: doc.id, filename: doc.filename, title: doc.title, byte_length: doc.byteLength, page_count: doc.pageCount, storage_path: storagePath, metadata, archived: doc.archived, created_at: doc.createdAt, updated_at: doc.updatedAt };
}
export function recordOf(row: DocumentRow, local?: StoredDocument): StoredDocument {
  const meta = row.metadata ?? {};
  return {
    ...(local ?? {}), ...(meta as Partial<StoredDocument>),
    id: row.id, filename: row.filename, title: row.title, mimeType: "application/pdf", byteLength: Number(row.byte_length), pageCount: row.page_count,
    createdAt: row.created_at, updatedAt: row.updated_at, blobKey: row.id, archived: row.archived,
    currentPage: Number((meta as { currentPage?: number }).currentPage ?? local?.currentPage ?? 1), authors: ((meta as { authors?: string[] }).authors ?? local?.authors ?? []), researchPoolIds: ((meta as { researchPoolIds?: string[] }).researchPoolIds ?? local?.researchPoolIds ?? []),
    storagePath: row.storage_path ?? undefined,
    sourceStatus: local && local.sourceStatus !== "remote" ? (row.storage_path ? "cloud" : "local") : row.storage_path ? "cloud" : "remote"
  };
}

