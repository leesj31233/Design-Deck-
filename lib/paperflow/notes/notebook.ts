import type { Annotation, AnnotationColor } from "../anchors/types";
import type { StoredDocument } from "../persistence/types";

/**
 * The research notebook: quick notes that cite my own papers. Typing "@" looks up papers, their
 * keywords and the passages I marked; choosing one inserts a citation token that the note renders
 * as a pill linking to the source ("(제목, p.3) '키워드'"). Everything here is pure and local.
 */
export interface QuickNote { id: string; title: string; body: string; pinned: boolean; createdAt: string; updatedAt: string }

/** A citation in a note body: [[label|/reader/…]]. Only reader links are ever rendered as links. */
const TOKEN = /\[\[([^\]|]+)\|(\/reader\/[^\]\s|]+)\]\]/g;
export type NoteSegment = { kind: "text"; text: string } | { kind: "cite"; label: string; href: string };

export function parseNoteBody(body: string): NoteSegment[] {
  const segments: NoteSegment[] = [];
  let last = 0;
  for (const match of body.matchAll(TOKEN)) {
    if (match.index > last) segments.push({ kind: "text", text: body.slice(last, match.index) });
    segments.push({ kind: "cite", label: match[1], href: match[2] });
    last = match.index + match[0].length;
  }
  if (last < body.length) segments.push({ kind: "text", text: body.slice(last) });
  return segments;
}

/** The note body as plain text (for titles, search and previews): citations become their labels. */
export const plainNote = (body: string) => body.replace(TOKEN, (_, label: string) => label);

/** The "@query" being typed at the caret, if any: "@" at the start or after whitespace, one line, up to 40 characters. */
export function activeMention(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret), at = before.lastIndexOf("@");
  if (at < 0 || (at > 0 && !/\s/.test(before[at - 1]))) return null;
  const query = before.slice(at + 1);
  if (query.length > 40 || /\n/.test(query) || /\s{2}/.test(query)) return null;
  return { start: at, query };
}

/** A paper's title, cut short for a citation. */
export function shortTitle(title: string, max = 28) {
  const clean = title.replace(/\.pdf$/i, "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max), space = cut.lastIndexOf(" ");
  return `${(space > max * .5 ? cut.slice(0, space) : cut).replace(/[\s,:;–-]+$/, "")}…`;
}
const safe = (text: string) => text.replace(/[[\]|]/g, " ").replace(/\s+/g, " ").trim();

export interface MentionCandidate { kind: "paper" | "keyword" | "mark"; key: string; documentId: string; label: string; detail: string; page?: number; color?: AnnotationColor; token: string }

/** Papers, keywords and marked passages that match the query, papers first. */
export function mentionCandidates(query: string, docs: StoredDocument[], annotations: Annotation[], limit = 8): MentionCandidate[] {
  const needle = query.trim().toLowerCase(), hit = (text: string) => !needle || text.toLowerCase().includes(needle);
  const papers: MentionCandidate[] = [], keywords: MentionCandidate[] = [], marks: MentionCandidate[] = [];
  const byId = new Map(docs.map(doc => [doc.id, doc]));
  for (const doc of docs) {
    const short = safe(shortTitle(doc.title));
    if (hit(doc.title) || doc.authors?.some(hit)) papers.push({ kind: "paper", key: `p:${doc.id}`, documentId: doc.id, label: doc.title.replace(/\.pdf$/i, ""), detail: [doc.authors?.[0], doc.year].filter(Boolean).join(" · ") || "논문", token: `[[(${short})|/reader/${doc.id}]]` });
    const words = new Set([...(doc.scholar?.keywords ?? []), ...(doc.keywords ?? [])].map(word => word.trim()).filter(Boolean));
    for (const word of words) if (needle && hit(word)) keywords.push({ kind: "keyword", key: `k:${doc.id}:${word}`, documentId: doc.id, label: word, detail: short, token: `[[(${short}) '${safe(word)}'|/reader/${doc.id}]]` });
  }
  for (const mark of annotations) {
    const doc = byId.get(mark.documentId), quote = (mark.anchor?.textQuote || mark.box?.text || "").trim();
    if (!doc || !quote || !(hit(quote) || hit(mark.note ?? ""))) continue;
    const short = safe(shortTitle(doc.title)), page = mark.pageIndex + 1, snippet = safe(quote.length > 40 ? `${quote.slice(0, 40)}…` : quote);
    marks.push({ kind: "mark", key: `m:${mark.id}`, documentId: doc.id, label: quote, detail: `${short} · p.${page}`, page, color: mark.color, token: `[[(${short}, p.${page}) '${snippet}'|/reader/${doc.id}?page=${page}&annotation=${encodeURIComponent(mark.id)}]]` });
  }
  return [...papers.slice(0, 4), ...keywords.slice(0, 3), ...marks].slice(0, limit);
}

/** Replace the "@query" at the caret with the citation; returns the new text and caret. */
export function insertMention(text: string, mention: { start: number; query: string }, token: string) {
  const end = mention.start + 1 + mention.query.length, rest = text.slice(end).replace(/^ /, "");
  return { text: `${text.slice(0, mention.start)}${token} ${rest}`, caret: mention.start + token.length + 1 };
}

/** Pinned notes first, then the most recently edited; a search matches title and body text. */
export function sortNotes(notes: QuickNote[], search = "") {
  const needle = search.trim().toLowerCase();
  return notes.filter(note => !needle || `${note.title} ${plainNote(note.body)}`.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
}
/** A note's display title: its own title, else its first line. */
export const noteTitle = (note: QuickNote) => note.title.trim() || plainNote(note.body).trim().split("\n")[0].slice(0, 40) || "새 노트";

/** Marks and memos grouped by paper, the most recently annotated paper first, marks in page order. */
export function groupByPaper(docs: StoredDocument[], annotations: Annotation[]) {
  const byId = new Map(docs.map(doc => [doc.id, doc])), groups = new Map<string, { doc: StoredDocument; marks: Annotation[]; latest: string }>();
  for (const mark of annotations) {
    const doc = byId.get(mark.documentId);
    if (!doc) continue;
    const group = groups.get(doc.id) ?? { doc, marks: [], latest: "" };
    group.marks.push(mark);
    if (mark.updatedAt > group.latest) group.latest = mark.updatedAt;
    groups.set(doc.id, group);
  }
  return [...groups.values()].sort((a, b) => b.latest.localeCompare(a.latest)).map(group => ({
    ...group,
    marks: group.marks.sort((a, b) => a.pageIndex - b.pageIndex || (a.anchor?.normalizedRects?.[0]?.y ?? 0) - (b.anchor?.normalizedRects?.[0]?.y ?? 0)),
    highlights: group.marks.filter(mark => mark.type === "highlight").length,
    memos: group.marks.filter(mark => mark.type !== "highlight" || Boolean(mark.note?.trim())).length
  }));
}
