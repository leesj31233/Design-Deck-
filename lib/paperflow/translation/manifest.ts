import type { PdfDocumentHandle } from "../pdf/pdf-adapter";
import { openDatabase, requestResult, transactionDone } from "../persistence/indexeddb";
import { analyzeNativePage } from "./native-layout";
import type { PdfParagraph } from "./paragraphs";

export const EXTRACTOR_VERSION = "native-layout-v2.4";
export type BlockRole = "TITLE" | "ABSTRACT" | "KEYWORDS" | "HEADING" | "BODY" | "CAPTION" | "TABLE" | "FIGURE_TEXT" | "AUTHOR" | "AFFILIATION" | "CONTACT" | "REFERENCE" | "EQUATION" | "HEADER" | "FOOTER" | "OTHER";
export interface ManifestBlock extends PdfParagraph { role: BlockRole; readingOrder: number; columnIndex: number; translatable: boolean; exclusionReason: string | null }
export interface TranslationManifest { documentId: string; version: string; createdAt: string; pageCount: number; blocks: ManifestBlock[]; extractedPages: number; ocrPages: number; ocrCandidates?: number[] }

export interface OcrProvider { extractPage(documentId: string, pageIndex: number, signal?: AbortSignal): Promise<Awaited<ReturnType<Awaited<ReturnType<PdfDocumentHandle["getPage"]>>["getTextItems"]>>> }

export async function stableBlockId(documentId: string, pageIndex: number, role: BlockRole, source: string, bbox: Pick<PdfParagraph, "x" | "y" | "width" | "height">) {
  const normalized = source.normalize("NFKC").replace(/\s+/g, " ").trim();
  const geometry = [bbox.x, bbox.y, bbox.width, bbox.height].map(value => Math.round(value * 1000)).join(":");
  const bytes = new TextEncoder().encode(`${documentId}|${pageIndex}|${role}|${normalized}|${geometry}`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...hash].map(byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function classify(block: PdfParagraph): { role: BlockRole; reason: string | null } {
  const value = block.text.trim();
  const words = value.match(/[A-Za-z]{3,}/g) ?? [];
  if (value.length < 100 && /[ÑÅ]{2,}/.test(value)) return { role: "EQUATION", reason: "equation-glyphs" };
  if ((block.lines.length <= 2 && /^[\s([■]*[A-Za-zα-ωΑ-Ωψχσε][A-Za-z0-9,ψχσε_.−-]{0,18}\s*=/.test(value)) || (block.lines.length <= 2 && value.length < 100 && words.length < 5 && (value.match(/[=+−→×∑∫(){}_^]/g) ?? []).length >= 2)) return { role: "EQUATION", reason: "equation" };
  if (/^(?:[^A-Za-z]*)(?:references|author information)\b/i.test(value) || /^\[\d+\]\s+[A-Z]/.test(value)) return { role: "REFERENCE", reason: "reference-or-author-section" };
  if (/\b(?:e-?mail|orcid|correspondence)\b|@/.test(value)) return { role: "CONTACT", reason: "contact" };
  if (/\b(?:university|department|institute|school of)\b/i.test(value) && (block.kind === "skip" || block.pageIndex === 0 && block.y < .4)) return { role: "AFFILIATION", reason: "affiliation" };
  if (block.pageIndex === 0 && block.y < .45 && value.includes(",") && (value.match(/[A-Z][a-z]+(?:-[A-Z][a-z]+)*\s+[A-Z][a-z]+/g) ?? []).length >= 2 && !/[.!?]\s*$/.test(value)) return { role: "AUTHOR", reason: "author" };
  if (/^(?:table of contents|contents)\b/i.test(value) || /\.{3,}\s*\d+\s*$/.test(value)) return { role: "OTHER", reason: "contents" };
  if (block.kind === "skip") return { role: block.y < .075 ? "HEADER" : block.y > .94 ? "FOOTER" : "OTHER", reason: "page-furniture-or-nonprose" };
  if (block.kind === "caption") return { role: "CAPTION", reason: null };
  if (block.kind === "title") return { role: block.pageIndex === 0 && block.y < .25 ? "TITLE" : /^\d+(?:\.\d+)*\s/.test(value) ? "HEADING" : "TITLE", reason: null };
  if (block.kind === "body") return { role: "BODY", reason: null };
  return { role: "OTHER", reason: "page-furniture-or-nonprose" };
}

export async function buildPageBlocks(documentId: string, pageIndex: number, raw: Awaited<ReturnType<Awaited<ReturnType<PdfDocumentHandle["getPage"]>>["getTextItems"]>>, width: number, height: number, initialSection: "none" | "authors" | "references" = "none"): Promise<ManifestBlock[]> {
  const paragraphs = analyzeNativePage(raw, pageIndex, width, height);
  const blocks: ManifestBlock[] = [];
  let section = initialSection;
  let tableBandEnd = -1, tableColumn = -1;
  for (const paragraph of paragraphs) {
    const classified = classify(paragraph);
    const tableCaption = /^table\s*[A-Z]?\d+[a-z]?[.:]/i.test(paragraph.text.trim());
    if (tableCaption) { tableBandEnd = paragraph.y + .13; tableColumn = paragraph.x >= .48 ? 1 : 0; }
    const inTableBand = !tableCaption && paragraph.y > tableBandEnd - .13 && paragraph.y < tableBandEnd && (paragraph.x >= .48 ? 1 : 0) === tableColumn && paragraph.text.length < 150 && !/^[A-Z][a-z]+(?:\s+[a-z]+){4,}[.!?]/.test(paragraph.text);
    if (/^[^A-Za-z]*author information\b/i.test(paragraph.text.trim())) section = "authors";
    if (/^[^A-Za-z]*references\b/i.test(paragraph.text.trim())) section = "references";
    const role = section === "references" ? "REFERENCE" : section === "authors" ? "AUTHOR" : inTableBand ? "TABLE" : classified.role;
    const reason = section === "references" ? "reference-section" : section === "authors" ? "author-section" : inTableBand ? "table-data" : classified.reason;
    const id = await stableBlockId(documentId, pageIndex, role, paragraph.text, paragraph);
    blocks.push({ ...paragraph, id, role, readingOrder: blocks.length, columnIndex: paragraph.x + paragraph.width / 2 < .5 ? 0 : 1, translatable: reason === null, exclusionReason: reason });
  }
  return blocks;
}

export async function buildTranslationManifest(documentId: string, pdf: PdfDocumentHandle, signal?: AbortSignal, onPage?: (completed: number) => void, ocr?: OcrProvider): Promise<TranslationManifest> {
  const blocks: ManifestBlock[] = [], ids = new Set<string>(), ocrCandidates: number[] = [];
  let ocrPages = 0;
  let section: "none" | "authors" | "references" = "none";
  for (let pageIndex = 0; pageIndex < pdf.pageCount; pageIndex++) {
    signal?.throwIfAborted();
    const page = await pdf.getPage(pageIndex + 1);
    let raw = await page.getTextItems(signal);
    const printable = raw.reduce((sum, item) => sum + item.text.replace(/\s/g, "").length, 0);
    const replacement = raw.reduce((sum, item) => sum + (item.text.match(/\uFFFD/g) ?? []).length, 0);
    const raster = printable < 80 || replacement > printable * .05 ? await page.getRasterImageCount?.() ?? 0 : 0;
    if (raster > 0 && (printable < 80 || replacement > printable * .05)) {
      if (ocr) { raw = await ocr.extractPage(documentId, pageIndex, signal); ocrPages++; }
      else ocrCandidates.push(pageIndex);
    }
    const pageBlocks = await buildPageBlocks(documentId, pageIndex, raw, page.width, page.height, section);
    if (pageBlocks.some(block => block.exclusionReason === "reference-section")) section = "references";
    else if (pageBlocks.some(block => block.exclusionReason === "author-section")) section = "authors";
    for (const paragraph of pageBlocks) {
      const id = paragraph.id;
      if (ids.has(id)) throw new Error(`${pageIndex + 1}페이지에 중복된 번역 블록 ID가 있다.`);
      ids.add(id);
      blocks.push({ ...paragraph, readingOrder: blocks.length });
    }
    onPage?.(pageIndex + 1);
  }
  return { documentId, version: EXTRACTOR_VERSION, createdAt: new Date().toISOString(), pageCount: pdf.pageCount, blocks, extractedPages: pdf.pageCount, ocrPages, ocrCandidates };
}

export const manifestRepository = {
  async get(documentId: string): Promise<TranslationManifest | null> {
    const db = await openDatabase();
    const value = await requestResult<TranslationManifest | undefined>(db.transaction("translationManifests").objectStore("translationManifests").get(documentId));
    return value?.version === EXTRACTOR_VERSION ? value : null;
  },
  async put(value: TranslationManifest) {
    const db = await openDatabase(), tx = db.transaction("translationManifests", "readwrite"), done = transactionDone(tx);
    tx.objectStore("translationManifests").put(value);
    await done;
  }
};

export function manifestCounts(manifest: TranslationManifest, translatedIds: Set<string>, failedIds = new Set<string>(), cancelledIds = new Set<string>()) {
  const targets = manifest.blocks.filter(block => block.translatable);
  for (const block of targets) {
    const states = Number(translatedIds.has(block.id)) + Number(failedIds.has(block.id)) + Number(cancelledIds.has(block.id));
    if (states > 1) throw new Error(`번역 블록 ${block.id}에 중복 상태가 있다.`);
  }
  const translated = targets.filter(block => translatedIds.has(block.id)).length;
  const failed = targets.filter(block => failedIds.has(block.id)).length;
  const cancelled = targets.filter(block => cancelledIds.has(block.id)).length;
  const pending = targets.length - translated - failed - cancelled;
  if (translated + failed + cancelled + pending !== targets.length) throw new Error("번역 작업의 블록 수가 일치하지 않는다.");
  return { totalBlocks: manifest.blocks.length, translatableBlocks: targets.length, excludedBlocks: manifest.blocks.length - targets.length, translatedBlocks: translated, failedBlocks: failed, cancelledBlocks: cancelled, pendingBlocks: pending, ocrCandidatePages: manifest.ocrCandidates?.length ?? 0, progressPercent: targets.length ? Math.round(translated / targets.length * 100) : 100, complete: pending === 0 && failed === 0 && cancelled === 0 && !(manifest.ocrCandidates?.length) };
}
