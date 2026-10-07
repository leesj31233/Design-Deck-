import type { TranslationManifest } from "../translation/manifest";
import { askCreditEstimate, partialAnswer, pickPassages, PASSAGE_CHARS, type AskAnswer, type AskOptions, type AskPassage } from "./ask";

/** One searchable passage of the paper: a paragraph or a slice of one, an equation with its lead-in, or a table. */
export interface PaperPassage { unitId: string; page: number; text: string; kind?: "text" | "equation" | "table" }
interface StoredIndex { documentId: string; version: string; passages: PaperPassage[]; vectors: Float32Array[] }

const INDEX_VERSION = "ask-v2";
const ROLES = new Set(["ABSTRACT", "BODY", "CAPTION", "KEYWORDS"]);

/**
 * The paper cut into passages of about a thousand characters at sentence ends, each on its page; plus
 * every display equation with the sentence before and after it (where its symbols are defined), and
 * every table as one passage of its cells, so questions about a formula or a parameter find them.
 */
export function passagesOf(manifest: TranslationManifest): PaperPassage[] {
  const out: PaperPassage[] = [];
  for (const unit of manifest.units) {
    if (!ROLES.has(unit.role) || unit.text.trim().length < 40) continue;
    // Which page a character offset falls on, from the unit's characters per page.
    const spans = unit.pages.map(page => ({ page, chars: unit.pageChars[page] ?? 0 }));
    const pageAt = (offset: number) => { let seen = 0; for (const span of spans) { seen += span.chars; if (offset < seen) return span.page; } return spans.at(-1)?.page ?? unit.pages[0]; };
    const sentences = unit.text.split(/(?<=[.!?])\s+(?=[A-Z0-9(])/);
    let chunk = "", start = 0, offset = 0;
    for (const sentence of sentences) {
      if (chunk && chunk.length + sentence.length > PASSAGE_CHARS - 50) { out.push({ unitId: unit.id, page: pageAt(start) + 1, text: chunk }); chunk = ""; start = offset; }
      chunk = chunk ? `${chunk} ${sentence}` : sentence;
      offset += sentence.length + 1;
    }
    if (chunk) out.push({ unitId: unit.id, page: pageAt(start) + 1, text: chunk });
  }
  const blocks = [...(manifest.blocks ?? [])].sort((a, b) => a.pageIndex - b.pageIndex || a.readingOrder - b.readingOrder);
  blocks.forEach((block, at) => {
    if (block.role !== "EQUATION" || block.text.trim().length < 3) return;
    const before = blocks.slice(0, at).reverse().find(item => item.pageIndex === block.pageIndex && ROLES.has(item.role)), after = blocks.slice(at + 1).find(item => item.pageIndex === block.pageIndex && ROLES.has(item.role));
    const lead = before ? before.text.slice(-260) : "", follow = after ? after.text.slice(0, 340) : "";
    out.push({ unitId: before?.unitId ?? block.id, page: block.pageIndex + 1, kind: "equation", text: `${lead} [Equation] ${block.text.trim()} ${follow}`.trim().slice(0, PASSAGE_CHARS) });
  });
  // Table cells on a page, row by row as printed, joined into one passage per table.
  let table: { page: number; cells: string[]; unitId: string } | null = null;
  const flush = () => { if (table && table.cells.length >= 4) out.push({ unitId: table.unitId, page: table.page + 1, kind: "table", text: `[Table] ${table.cells.join(" | ")}`.slice(0, PASSAGE_CHARS) }); table = null; };
  for (const block of blocks) {
    if (block.role !== "TABLE") { if (table && block.pageIndex !== table.page) flush(); continue; }
    if (!table || table.page !== block.pageIndex) { flush(); table = { page: block.pageIndex, cells: [], unitId: block.unitId ?? block.id }; }
    table.cells.push(block.text.trim());
  }
  flush();
  return out;
}

function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("paperflow-ask", 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("indexes")) request.result.createObjectStore("indexes", { keyPath: "documentId" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function readIndex(documentId: string): Promise<StoredIndex | null> {
  try {
    const db = await database();
    return await new Promise(resolve => { const get = db.transaction("indexes").objectStore("indexes").get(documentId); get.onsuccess = () => resolve(get.result?.version === INDEX_VERSION ? get.result : null); get.onerror = () => resolve(null); });
  } catch { return null; }
}
async function writeIndex(index: StoredIndex) {
  try { const db = await database(); await new Promise(resolve => { const tx = db.transaction("indexes", "readwrite"); tx.objectStore("indexes").put(index); tx.oncomplete = resolve; tx.onerror = resolve; }); } catch { /* Asked again next time: costs one more index. */ }
}

async function embed(texts: string[]): Promise<{ vectors: number[][]; credits: number }> {
  const response = await fetch("/api/embed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texts }), signal: AbortSignal.timeout(60_000) })
    .catch(() => new Response(JSON.stringify({ error: "연결 시간이 초과되었습니다." }), { status: 504 }));
  const body = await response.json().catch(() => ({ error: "응답을 읽지 못했습니다." }));
  if (!response.ok) throw new Error(body.error || "본문을 색인하지 못했습니다.");
  return body;
}

/** Whether the paper is already indexed, and what indexing it and one question would cost, about. */
export async function askStatus(documentId: string, manifest: TranslationManifest | null) {
  const index = await readIndex(documentId);
  const chars = manifest ? passagesOf(manifest).reduce((sum, passage) => sum + passage.text.length, 0) : 0;
  return { indexed: Boolean(index), indexCredits: Math.max(1, Math.ceil(chars / 3.6 * .02 / 1e6 / .0003)) };
}
export const estimateQuestion = (options: AskOptions) => askCreditEstimate(options);

/** The paper's index: from this browser if made before, else embedded now (charged once). */
async function ensureIndex(documentId: string, manifest: TranslationManifest) {
  const saved = await readIndex(documentId);
  if (saved) return { index: saved, credits: 0 };
  const passages = passagesOf(manifest);
  if (!passages.length) throw new Error("질문할 본문을 찾지 못했습니다. 텍스트가 없는 PDF일 수 있습니다.");
  const vectors: Float32Array[] = []; let credits = 0;
  for (let at = 0; at < passages.length; at += 500) {
    const part = await embed(passages.slice(at, at + 500).map(passage => passage.text));
    vectors.push(...part.vectors.map(vector => Float32Array.from(vector))); credits += part.credits;
  }
  const index: StoredIndex = { documentId, version: INDEX_VERSION, passages, vectors };
  await writeIndex(index);
  return { index, credits };
}

export interface AskResult extends AskAnswer { question: string; focus?: { text: string; page: number }; options: AskOptions; indexCredits: number; searches?: number; at: string }
export type AskStage = "index" | "search" | "literature" | "web" | "thinking" | "writing";
export interface AskInput { question: string; focus?: { text: string; page: number }; overview: string; title: string; keywords: string[]; history: { q: string; a: string }[]; options: AskOptions }

/**
 * Ask the paper one question. The closest passages (and the one the reader selected) go with it; the
 * answer streams in (onText) and arrives checked: its points name exact sentences on real pages.
 */
export async function askPaper(documentId: string, manifest: TranslationManifest, input: AskInput, onStage: (stage: AskStage) => void, onText: (text: string) => void, signal?: AbortSignal): Promise<AskResult> {
  onStage("index");
  const { index, credits: indexCredits } = await ensureIndex(documentId, manifest);
  onStage("search");
  const { vectors: [vector] } = await embed([input.focus ? `${input.question}\n${input.focus.text}` : input.question]);
  const wireAll: AskPassage[] = index.passages.map((passage, at) => ({ id: `p${at}`, page: passage.page, text: passage.text }));
  // The passage the reader selected text in is always sent.
  const squash = (text: string) => text.toLowerCase().replace(/\s+/g, "");
  const focusKey = input.focus ? squash(input.focus.text).slice(0, 60) : "";
  const pinned = focusKey ? wireAll.filter(passage => squash(passage.text).includes(focusKey)).map(passage => passage.id).slice(0, 2) : [];
  const passages = pickPassages(input.question, vector, { passages: wireAll, vectors: index.vectors }, 10, pinned);
  const response = await fetch("/api/ask", {
    method: "POST", headers: { "Content-Type": "application/json" }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(130_000)]) : AbortSignal.timeout(130_000),
    body: JSON.stringify({ question: input.question, focus: input.focus?.text ?? "", passages, overview: input.overview, title: input.title, keywords: input.keywords, history: input.history, options: input.options })
  }).catch(error => { if (signal?.aborted) throw error; return new Response(JSON.stringify({ error: "연결 시간이 초과되었습니다." }), { status: 504 }); });
  if (!response.ok || !response.body) { const body = await response.json().catch(() => ({ error: "답변을 읽지 못했습니다." })); throw new Error(body.error || "답변을 만들지 못했습니다."); }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", raw = "", result: (AskAnswer & { searches?: number }) | null = null, failure = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let event: { t: string; s?: AskStage; d?: string; result?: AskAnswer & { searches?: number }; error?: string };
      try { event = JSON.parse(line); } catch { continue; }
      if (event.t === "status" && event.s) onStage(event.s);
      else if (event.t === "delta" && event.d) { if (!raw) onStage("writing"); raw += event.d; onText(partialAnswer(raw)); }
      else if (event.t === "done" && event.result) result = event.result;
      else if (event.t === "error") failure = event.error ?? "답변을 만들지 못했습니다.";
    }
  }
  window.dispatchEvent(new Event("paperflow:credits-changed"));
  if (!result) throw new Error(failure || "답변을 만들지 못했습니다.");
  // Wire ids back to the paper's own paragraphs.
  const points = result.points.map(point => { const passage = index.passages[Number(point.unitId.slice(1))]; return { ...point, unitId: passage.unitId, page: passage.page }; });
  return { ...result, points, question: input.question, focus: input.focus, options: input.options, indexCredits, at: new Date().toISOString() };
}
