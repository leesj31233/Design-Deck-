import type { TranslationManifest } from "../translation/manifest";
import { askCreditEstimate, pickPassages, PASSAGE_CHARS, type AskAnswer, type AskPassage } from "./ask";

/** One searchable passage of the paper: a paragraph, or a slice of a long one, with the page it is on. */
export interface PaperPassage { unitId: string; page: number; text: string }
interface StoredIndex { documentId: string; version: string; passages: PaperPassage[]; vectors: Float32Array[] }

const INDEX_VERSION = "ask-v1";
const ROLES = new Set(["ABSTRACT", "BODY", "CAPTION", "KEYWORDS"]);

/** The paper cut into passages of about a thousand characters at sentence ends, each on its page. */
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

/** Whether the paper is already indexed, and what indexing it would cost, about. */
export async function askStatus(documentId: string, manifest: TranslationManifest | null) {
  const index = await readIndex(documentId);
  const chars = manifest ? passagesOf(manifest).reduce((sum, passage) => sum + passage.text.length, 0) : 0;
  return { indexed: Boolean(index), indexCredits: Math.max(1, Math.ceil(chars / 3.6 * .02 / 1e6 / .0003)), perQuestion: askCreditEstimate() };
}

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

export interface AskResult extends AskAnswer { question: string; indexCredits: number; at: string }

/** Ask the paper one question: the closest passages go with it; the answer's points name exact sentences. */
export async function askPaper(documentId: string, manifest: TranslationManifest, question: string, overview: string, history: { q: string; a: string }[]): Promise<AskResult> {
  const { index, credits: indexCredits } = await ensureIndex(documentId, manifest);
  const { vectors: [vector] } = await embed([question]);
  const picked = pickPassages(question, vector, { passages: index.passages.map((passage, at) => ({ id: `p${at}`, page: passage.page, text: passage.text })), vectors: index.vectors });
  const wire: AskPassage[] = picked;
  const response = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, passages: wire, overview, history }), signal: AbortSignal.timeout(95_000) })
    .catch(() => new Response(JSON.stringify({ error: "연결 시간이 초과되었습니다." }), { status: 504 }));
  const body = await response.json().catch(() => ({ error: "답변을 읽지 못했습니다." }));
  if (!response.ok) throw new Error(body.error || "답변을 만들지 못했습니다.");
  window.dispatchEvent(new Event("paperflow:credits-changed"));
  // Wire ids back to the paper's own paragraphs.
  const points = (body.points as AskAnswer["points"]).map(point => { const passage = index.passages[Number(point.unitId.slice(1))]; return { ...point, unitId: passage.unitId, page: passage.page }; });
  return { ...body, points, question, indexCredits, at: new Date().toISOString() };
}
