import { shortTitle, type QuickNote } from "./notebook";
import { noteRepository } from "./note-repository";
import { documentRepository } from "../persistence/document-repository";

/** "(짧은 제목, p.N) '선택 문장 앞 40자…'" linking to the page, as a notebook citation token. */
export function selectionCitation(documentId: string, title: string, pageIndex: number, quote: string) {
  const clean = (text: string) => text.replace(/[[\]|]/g, " ").replace(/\s+/g, " ").trim();
  const text = clean(quote), snippet = text.length > 40 ? `${text.slice(0, 40).trimEnd()}…` : text, page = pageIndex + 1;
  return `[[(${clean(shortTitle(title))}, p.${page}) '${snippet}'|/reader/${documentId}?page=${page}]]`;
}

/** The citation added to the most recently edited note on its own line, or a new note when there is none. */
export function appendCitation(notes: QuickNote[], token: string, now: string, newId: () => string): { note: QuickNote; created: boolean } {
  const latest = [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!latest) return { note: { id: newId(), title: "", body: token, pinned: false, createdAt: now, updatedAt: now }, created: true };
  const body = latest.body.trimEnd();
  return { note: { ...latest, body: body ? `${body}\n${token}` : token, updatedAt: now }, created: false };
}

/** 노트에 인용: save the selected passage into the notebook. */
export async function citeSelection(documentId: string, pageIndex: number, quote: string) {
  const doc = await documentRepository.getDocument(documentId);
  const token = selectionCitation(documentId, doc?.title ?? "논문", pageIndex, quote);
  const result = appendCitation(await noteRepository.list(), token, new Date().toISOString(), () => crypto.randomUUID());
  await noteRepository.put(result.note);
  return result;
}
