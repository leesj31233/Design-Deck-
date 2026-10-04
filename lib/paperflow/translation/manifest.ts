import type { PdfDocumentHandle, PdfPageHandle, PdfTextItem } from "../pdf/pdf-adapter";
import { letterCount, textHealth } from "../pdf/ocr";
import { openDatabase, requestResult, transactionDone } from "../persistence/indexeddb";
import { analyzePage } from "../layout/page-blocks";
import { classifyBlock, extractKeywords, nextSection, pageContext, type BlockRole, type Section } from "../layout/classify";
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
  for (let pageIndex = 0; pageIndex < pdf.pageCount; pageIndex++) {
    signal?.throwIfAborted();
    const page = await pdf.getPage(pageIndex + 1);
    pages.push({ width: page.width, height: page.height });
    let raw = await page.getTextItems(signal);
    // A scanned page (no text, an image) or text without a usable Unicode map is read from its pixels.
    const health = textHealth(raw);
    if (health === "garbled" || (health === "empty" && (await page.getRasterImageCount?.() ?? 0) > 0)) {
      let read: PdfTextItem[] | null = null;
      if (ocr) { try { read = await ocr(page, signal); } catch (error) { if (signal?.aborted) throw error; } }
      if (read && letterCount(read) > letterCount(raw) * 1.2 + 40) { raw = read; ocrPages++; }
      else if (!read) ocrCandidates.push(pageIndex);
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
    onPage?.(pageIndex + 1);
    // Yield so a long extraction never freezes the reader.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  const units = await buildUnits(documentId, blocks);
  return { documentId, version: EXTRACTOR_VERSION, createdAt: new Date().toISOString(), pageCount: pdf.pageCount, pages, blocks, units, keywords: [...new Set(keywords)], extractedPages: pdf.pageCount, ocrPages, ocrCandidates, scripts: buildScriptTable(marks, texts, citations) };
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

/** One build per document even when the library, reader and export ask at once. */
const building = new Map<string, Promise<TranslationManifest>>();
export function ensureManifest(documentId: string, open: () => Promise<PdfDocumentHandle>, onPage?: (completed: number) => void, signal?: AbortSignal, ocr?: OcrProvider): Promise<TranslationManifest> {
  const running = building.get(documentId);
  if (running) return running;
  const task = (async () => {
    const stored = await manifestRepository.get(documentId);
    if (stored) return stored;
    const pdf = await open();
    try {
      const manifest = await buildTranslationManifest(documentId, pdf, signal, onPage, ocr);
      await manifestRepository.put(manifest);
      return manifest;
    } finally { await pdf.destroy(); }
  })().finally(() => building.delete(documentId));
  building.set(documentId, task);
  return task;
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
