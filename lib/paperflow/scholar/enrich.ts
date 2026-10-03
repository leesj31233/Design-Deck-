"use client";
import { documentRepository } from "../persistence/document-repository";
import { manifestRepository } from "../translation/manifest";
import type { StoredDocument } from "../persistence/types";
import type { ScholarAuthorStats, ScholarSourceStats, ScholarWork } from "./openalex";

const STALE = 30 * 24 * 3600_000;
const looksLikeFilename = (title: string) => /\.pdf$|^[\w-]*\d{3,}[\w-]*$|_|^s\d{4,}/i.test(title.trim()) || title.trim().split(/\s+/).length < 4;

/** The paper's own title as printed on page 1, when the manifest has been built. */
async function printedTitle(documentId: string) {
  const manifest = await manifestRepository.get(documentId).catch(() => null);
  return manifest?.blocks.find(block => block.role === "TITLE")?.text;
}

/** Attach OpenAlex metadata to one paper; fills empty bibliography fields, never overwrites the user's. */
export async function enrichDocument(doc: StoredDocument, force = false): Promise<ScholarWork | null> {
  if (!force && doc.scholar && Date.now() - Date.parse(doc.scholar.fetchedAt) < STALE) return doc.scholar;
  let work: ScholarWork | null = null;
  try {
    if (doc.doi) work = (await (await fetch(`/api/scholar/work?doi=${encodeURIComponent(doc.doi)}`)).json()).work ?? null;
    if (!work) {
      const title = looksLikeFilename(doc.title) ? await printedTitle(doc.id) ?? doc.title : doc.title;
      if (!looksLikeFilename(title)) work = (await (await fetch(`/api/scholar/work?title=${encodeURIComponent(title)}`)).json()).work ?? null;
    }
  } catch { return null; }
  if (!work) return null;
  const patch: Partial<StoredDocument> = { scholar: work };
  if (!doc.authors?.length) patch.authors = work.authors.map(author => author.name);
  if (!doc.journal && work.source?.name) patch.journal = work.source.name;
  if (!doc.year && work.year) patch.year = work.year;
  if (!doc.doi && work.doi) patch.doi = work.doi;
  if (looksLikeFilename(doc.title) && work.title) patch.title = work.title;
  if (work.citedBy) patch.citationCount = work.citedBy;
  patch.keywords = [...new Set([...(doc.keywords ?? []), ...work.keywords])].slice(0, 30);
  await documentRepository.updateDocument(doc.id, patch);
  return work;
}

/** Enrich every paper that has no (or stale) OpenAlex record, gently (OpenAlex asks for < 10 req/s). */
export async function enrichLibrary(onProgress?: (done: number, total: number) => void) {
  const docs = (await documentRepository.listDocuments()).filter(doc => !doc.scholar || Date.now() - Date.parse(doc.scholar.fetchedAt) > STALE);
  let done = 0, found = 0;
  for (const doc of docs) {
    if (await enrichDocument(doc)) found++;
    onProgress?.(++done, docs.length);
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  return { checked: docs.length, found };
}

export async function sourceStats(ids: string[]): Promise<ScholarSourceStats[]> {
  if (!ids.length) return [];
  try { return (await (await fetch(`/api/scholar/entity?kind=source&ids=${ids.slice(0, 50).join(",")}`)).json()).items ?? []; } catch { return []; }
}
export async function authorStats(ids: string[]): Promise<ScholarAuthorStats[]> {
  if (!ids.length) return [];
  try { return (await (await fetch(`/api/scholar/entity?kind=author&ids=${ids.slice(0, 50).join(",")}`)).json()).items ?? []; } catch { return []; }
}
