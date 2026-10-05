import type { PdfDocumentHandle, PdfPageHandle, PdfTextItem } from "../pdf/pdf-adapter";
import { letterCount, textHealth } from "../pdf/ocr";
import { openDatabase, requestResult, transactionDone } from "../persistence/indexeddb";
import { analyzePage } from "../layout/page-blocks";
import { classifyBlock, extractKeywords, looksLikeReference, nextSection, pageContext, type BlockRole, type Section } from "../layout/classify";
import type { PageSize, PdfParagraph } from "../layout/types";
import { buildScriptTable, type ScriptTable } from "../typeset/scripts";

export type { BlockRole } from "../layout/classify";
export const EXTRACTOR_VERSION = "layout-v3.17";

export interface ManifestBlock extends PdfParagraph { role: BlockRole; readingOrder: number; columnIndex: number; translatable: boolean; exclusionReason: string | null; unitId?: string }
/** A logical paragraph. Column and page breaks split blocks, never the sentence sent to the translator. */
export interface TranslationUnit { id: string; role: BlockRole; blockIds: string[]; pages: number[]; text: string; pageChars: Record<number, number> }
export interface TranslationManifest {
  documentId: string; version: string; createdAt: string; pageCount: number;
  pages: PageSize[]; blocks: ManifestBlock[]; units: TranslationUnit[]; keywords: string[];
  extractedPages: number; ocrPages: number; ocrCandidates?: number[];
  /** How the paper prints sub/superscripts and citations, for the translated text. */
  scripts?: ScriptTable;
  /** Where the extraction time went (ms), to keep long papers fast. */
  timing?: { text: number; images: number; ocr: number; layout: number; total: number };
}

/** Reads a page from its pixels (scanned pages, unusable embedded fonts). */
export type OcrProvider = (page: PdfPageHandle, signal?: AbortSignal) => Promise<PdfTextItem[]>;

async function sha(value: string) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...hash].map(byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export async function stableBlockId(documentId: string, pageIndex: number, role: BlockRole, source: string, bbox: Pick<PdfParagraph, "x" | "y" | "width" | "height">) {
  const normalized = source.normalize("NFKC").replace(/\s+/g, " ").trim();
  const geometry = [bbox.x, bbox.y, bbox.width, bbox.height].map(value => Math.round(value * 1000)).join(":");
  return sha(`${documentId}|${pageIndex}|${role}|${normalized}|${geometry}`);
}

const TRANSLATABLE: ReadonlySet<BlockRole> = new Set(["ABSTRACT", "HEADING", "BODY", "CAPTION"]);
/** Mostly Hangul among the letters (English terms inside Korean prose do not count against it). */
export function isKorean(text: string) {
  const hangul = (text.match(/[가-힣]/g) ?? []).length, others = (text.match(/[A-Za-z぀-ヿ一-鿿]/g) ?? []).length;
  return hangul >= 4 && hangul >= others * .3;
}

export async function buildPageBlocks(documentId: string, pageIndex: number, raw: PdfTextItem[], width: number, height: number, initialSection: Section = "none"): Promise<ManifestBlock[]> {
  const paragraphs = analyzePage(raw, pageIndex, width, height);
  const context = pageContext(paragraphs, pageIndex);
  const blocks: ManifestBlock[] = [];
  let section = initialSection, tableUntil = -1, tableColumn = -2;
  for (const [index, paragraph] of paragraphs.entries()) {
    let { role, reason } = classifyBlock(paragraph, index, context, section);
    const columnIndex = paragraph.x + paragraph.width / 2 < .5 ? 0 : 1;
    // Rows after a table caption stay data until real prose resumes.
    if (role === "CAPTION" && /^table/i.test(paragraph.text)) { tableUntil = paragraph.y + .45; tableColumn = paragraph.width > .6 || Math.abs(paragraph.x + paragraph.width / 2 - .5) < .08 ? -1 : columnIndex; }
    else if (role === "BODY" && paragraph.y < tableUntil && (tableColumn === -1 || tableColumn === columnIndex) && !/[a-z]{3,}[.!?]\s|[\uac00-\ud7a3\u3040-\u30ff\u4e00-\u9fff][.!?。！？]/.test(paragraph.text + " ")) { role = "TABLE"; reason = "table-data"; }
    else if (role === "BODY") tableUntil = -1;
    section = nextSection(role, reason, paragraph.text, section);
    // Text already in Korean is shown as printed: never spend a credit translating Korean into Korean.
    if (reason === null && isKorean(paragraph.text)) reason = "korean-source";
    const translatable = TRANSLATABLE.has(role) && reason === null;
    const id = await stableBlockId(documentId, pageIndex, role, paragraph.text, paragraph);
    blocks.push({ ...paragraph, id, role, readingOrder: blocks.length, columnIndex, translatable, exclusionReason: translatable ? null : reason ?? "not-translated" });
  }
  return blocks;
}

/** A block that can only be a bibliography entry: a DOI or database link, a numbered "12. Name, X." entry, or dense author initials with a year. */
function isEntry(text: string) {
  if (text.length > 1600) return false;
  if (/\[(?:CrossRef|PubMed|Google Scholar)\]|doi\.org\/|\bdoi:\s*10\./i.test(text)) return true;
  // "31. Wahidul, K.B. Life cycle …": the year may be on the entry's next line.
  if (/^\[?\d{1,3}[.\])]\s+[A-Z][A-Za-z'’-]+,?\s+(?:[A-Z]\.|[A-Z][a-z]+,)/.test(text)) return true;
  // "Dubois, L., and Thomas, D. (2018)": an initial before a comma, "and", "&" or the year.
  const initials = (text.match(/\b[A-Z]\.(?:\s?-?[A-Z]\.)*(?:[,;&]|\s(?:\(|and\b|&))/g) ?? []).length;
  return initials >= 2 && initials * 100 >= text.length * .6 && /\b(?:19|20)\d{2}[a-z]?\b/.test(text);
}

/**
 * Reference lists the headings missed (no heading, a heading in another language, a list carried over a
 * page or chapter break): three or more entries in a row, with the short continuation lines between
 * them, are references and are never sent for translation.
 */
export function markReferenceRuns(blocks: ManifestBlock[]) {
  const candidates = blocks.filter(block => block.translatable);
  let start = 0;
  while (start < candidates.length) {
    if (!isEntry(candidates[start].text)) { start++; continue; }
    let end = start, entries = 1;
    for (let next = start + 1; next < candidates.length; next++) {
      if (isEntry(candidates[next].text)) { entries++; end = next; continue; }
      // The tail of an entry ("Publ. 2014, 4, 1–24.", "15 October 2018).") belongs to the list.
      if (candidates[next].text.length < 300 && looksLikeReference(candidates[next].text)) { end = next; continue; }
      // A wrapped entry's tail ("England, 2004; pp 89-160.") sits between two entries.
      if (candidates[next].text.length < 220 && next + 1 < candidates.length && isEntry(candidates[next + 1].text)) continue;
      break;
    }
    if (entries >= 3) for (const block of candidates.slice(start, end + 1)) { block.role = "REFERENCE"; block.translatable = false; block.exclusionReason = "reference-section"; }
    start = end + 1;
  }
}

const SENTENCE_END = /[.!?:。！？](?:["”’)\]]|\[[\d,–−-]+\])*\s*$/;
const MAX_UNIT_CHARS = 6000;

/** Join paragraph fragments split by a column or page break; headings and display equations always end a paragraph. */
export async function buildUnits(documentId: string, blocks: ManifestBlock[]): Promise<TranslationUnit[]> {
  const units: TranslationUnit[] = [];
  let open: { unit: TranslationUnit; last: ManifestBlock } | null = null;
  for (const block of blocks) {
    if (!block.translatable) {
      if (block.role === "EQUATION" || block.role === "TITLE" || block.role === "REFERENCE" || block.role === "AUTHOR") open = null;
      continue;
    }
    const prose = block.role === "BODY" || block.role === "ABSTRACT";
    if (prose && open && !SENTENCE_END.test(open.last.text) && !(block.indent && block.indent > 0) && open.unit.text.length + block.text.length < MAX_UNIT_CHARS && (open.last.pageIndex !== block.pageIndex || open.last.columnIndex !== block.columnIndex || /^[a-z(\d]/.test(block.text))) {
      const hyphen = /[a-z][-‐]$/.test(open.unit.text) && /^[a-z]/.test(block.text);
      open.unit.text = hyphen ? open.unit.text.replace(/[-‐]$/, "") + block.text : `${open.unit.text} ${block.text}`;
      open.unit.blockIds.push(block.id);
      if (!open.unit.pages.includes(block.pageIndex)) open.unit.pages.push(block.pageIndex);
      open.unit.pageChars[block.pageIndex] = (open.unit.pageChars[block.pageIndex] ?? 0) + block.text.length;
      open.last = block;
      continue;
    }
    const unit: TranslationUnit = { id: "", role: block.role, blockIds: [block.id], pages: [block.pageIndex], text: block.text, pageChars: { [block.pageIndex]: block.text.length } };
    units.push(unit);
    open = prose ? { unit, last: block } : block.role === "CAPTION" ? open : null;
  }
  for (const unit of units) unit.id = await sha(`${documentId}|unit|${unit.blockIds.join(",")}`);
  const byBlock = new Map(units.flatMap(unit => unit.blockIds.map(id => [id, unit.id] as const)));
  for (const block of blocks) block.unitId = byBlock.get(block.id);
  return units;
}

export async function buildTranslationManifest(documentId: string, pdf: PdfDocumentHandle, signal?: AbortSignal, onPage?: (completed: number) => void, ocr?: OcrProvider): Promise<TranslationManifest> {
  const blocks: ManifestBlock[] = [], ids = new Set<string>(), ocrCandidates: number[] = [], pages: PageSize[] = [], keywords: string[] = [];
  let ocrPages = 0, section: Section = "none";
  const marks: string[] = [], texts: string[] = [], citations = { raised: 0, total: 0 };
  const timing = { text: 0, images: 0, ocr: 0, layout: 0, total: 0 }, started = performance.now();
  let mark = started;
  const lap = (key: keyof typeof timing) => { const now = performance.now(); timing[key] += now - mark; mark = now; };
  for (let pageIndex = 0; pageIndex < pdf.pageCount; pageIndex++) {
    signal?.throwIfAborted();
    const page = await pdf.getPage(pageIndex + 1);
    pages.push({ width: page.width, height: page.height });
    let raw = await page.getTextItems(signal);
    lap("text");
    // A scanned page (no text, an image) or text without a usable Unicode map is read from its pixels.
    const health = textHealth(raw);
    // A page that is only a figure keeps its picture: OCR runs for unusable fonts, or an image covering most of the page (a scan).
    const scanned = health === "garbled" || (health === "empty" && (await page.getLargestImageShare?.() ?? 0) >= .5);
    lap("images");
    if (scanned) {
      let read: PdfTextItem[] | null = null;
      if (ocr) { try { read = await ocr(page, signal); } catch (error) { if (signal?.aborted) throw error; } }
      if (read && letterCount(read) > letterCount(raw) * 1.2 + 40) { raw = read; ocrPages++; }
      else if (!read) ocrCandidates.push(pageIndex);
      lap("ocr");
    }
    const pageBlocks = await buildPageBlocks(documentId, pageIndex, raw, page.width, page.height, section);
    for (const block of pageBlocks) {
      section = nextSection(block.role, block.exclusionReason, block.text, section);
      if (block.role === "KEYWORDS" && pageIndex < 2) keywords.push(...extractKeywords(block));
      // The same paragraph twice at the same place (text drawn twice): keep the first, never fail the paper.
      if (ids.has(block.id)) continue;
      ids.add(block.id);
      if (block.translatable) {
        marks.push(...block.marks ?? []); texts.push(block.text);
        citations.raised += block.raised ?? 0; citations.total += (block.text.match(/\[\d+(?:\s*[,–-]\s*\d+)*\]/g) ?? []).length;
      }
      blocks.push({ ...block, readingOrder: blocks.length, lineTexts: undefined, marks: undefined, raised: undefined });
    }
    lap("layout");
    onPage?.(pageIndex + 1);
    // Yield so a long extraction never freezes the reader.
    await new Promise(resolve => setTimeout(resolve, 0));
    mark = performance.now();
  }
  markReferenceRuns(blocks);
  const units = await buildUnits(documentId, blocks);
  timing.total = performance.now() - started;
  for (const key of Object.keys(timing) as (keyof typeof timing)[]) timing[key] = Math.round(timing[key]);
  return { documentId, version: EXTRACTOR_VERSION, createdAt: new Date().toISOString(), pageCount: pdf.pageCount, pages, blocks, units, keywords: [...new Set(keywords)], extractedPages: pdf.pageCount, ocrPages, ocrCandidates, scripts: buildScriptTable(marks, texts, citations), timing };
}

const memory = new Map<string, TranslationManifest>();
export const manifestRepository = {
  peek(documentId: string) { return memory.get(documentId) ?? null; },
  async get(documentId: string): Promise<TranslationManifest | null> {
    const cached = memory.get(documentId);
    if (cached) return cached;
    const db = await openDatabase();
    const value = await requestResult<TranslationManifest | undefined>(db.transaction("translationManifests").objectStore("translationManifests").get(documentId));
    if (value?.version !== EXTRACTOR_VERSION) return null;
    memory.set(documentId, value);
    return value;
  },
  async put(value: TranslationManifest) {
    memory.set(value.documentId, value);
    const db = await openDatabase(), tx = db.transaction("translationManifests", "readwrite"), done = transactionDone(tx);
    tx.objectStore("translationManifests").put(value);
    await done;
  }
};

/**
 * One build per document even when the library, reader and export ask at once. The build belongs to
 * everyone waiting for it: one caller giving up (a re-rendered reader, a stopped job) leaves it running
 * for the others, and it is cancelled only when nobody is waiting any more.
 */
type Build = { task: Promise<TranslationManifest>; controller: AbortController; waiters: number; done: number; listeners: Set<(completed: number) => void> };
const building = new Map<string, Build>();
export function ensureManifest(documentId: string, open: (signal: AbortSignal) => Promise<PdfDocumentHandle>, onPage?: (completed: number) => void, signal?: AbortSignal, ocr?: OcrProvider): Promise<TranslationManifest> {
  let build = building.get(documentId);
  if (!build) {
    const controller = new AbortController(), listeners = new Set<(completed: number) => void>();
    const entry: Build = { controller, listeners, waiters: 0, done: 0, task: null! };
    entry.task = (async () => {
      const stored = await manifestRepository.get(documentId);
      if (stored) return stored;
      const pdf = await open(controller.signal);
      try {
        const manifest = await buildTranslationManifest(documentId, pdf, controller.signal, completed => { entry.done = completed; for (const listener of listeners) listener(completed); }, ocr);
        await manifestRepository.put(manifest);
        return manifest;
      } finally { await pdf.destroy(); }
    })().finally(() => { if (building.get(documentId) === entry) building.delete(documentId); });
    building.set(documentId, entry);
    build = entry;
  }
  const current = build;
  current.waiters++;
  if (onPage) { current.listeners.add(onPage); if (current.done) onPage(current.done); }
  return new Promise<TranslationManifest>((resolve, reject) => {
    let settled = false;
    const leave = () => { settled = true; current.waiters--; if (onPage) current.listeners.delete(onPage); signal?.removeEventListener("abort", abort); };
    const abort = () => {
      if (settled) return;
      leave();
      if (current.waiters <= 0) { current.controller.abort(); if (building.get(documentId) === current) building.delete(documentId); }
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener("abort", abort, { once: true });
    current.task.then(value => { if (settled) return; leave(); resolve(value); }, error => { if (settled) return; leave(); reject(error); });
  });
}

export function manifestCounts(manifest: TranslationManifest, translatedIds: Set<string>, failedIds = new Set<string>(), cancelledIds = new Set<string>()) {
  const targets = manifest.units ?? [];
  for (const unit of targets) {
    const states = Number(translatedIds.has(unit.id)) + Number(failedIds.has(unit.id)) + Number(cancelledIds.has(unit.id));
    if (states > 1) throw new Error(`번역 단위 ${unit.id}에 중복 상태가 있습니다.`);
  }
  const translated = targets.filter(unit => translatedIds.has(unit.id)).length;
  const failed = targets.filter(unit => failedIds.has(unit.id)).length;
  const cancelled = targets.filter(unit => cancelledIds.has(unit.id)).length;
  const pending = targets.length - translated - failed - cancelled;
  return { totalBlocks: manifest.blocks.length, translatableBlocks: targets.length, excludedBlocks: manifest.blocks.filter(block => !block.translatable).length, translatedBlocks: translated, failedBlocks: failed, cancelledBlocks: cancelled, pendingBlocks: pending, ocrCandidatePages: manifest.ocrCandidates?.length ?? 0, progressPercent: targets.length ? Math.round(translated / targets.length * 100) : 100, complete: pending === 0 && failed === 0 && cancelled === 0 && !(manifest.ocrCandidates?.length) };
}
