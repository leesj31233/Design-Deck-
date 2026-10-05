import { documentRepository } from "../persistence/document-repository";
import { translationRepository } from "../persistence/translation-repository";
import { ocrPage, releaseOcr } from "../pdf/ocr";
import { pdfAdapter } from "../pdf/pdf-adapter";
import { readableError } from "../errors";
import { ensureManifest, manifestCounts, type TranslationManifest, type TranslationUnit } from "./manifest";
import { researchTranslateBlocks, sharedTranslations, ResearchHttpError } from "./research-api";
import { runTranslationScheduler, type SchedulerState } from "./scheduler";
import { polishKorean } from "./research-style";
import { useTranslationStore } from "./translation-store";
import type { PassageRole } from "./block-contract";
import { paperGlossary } from "./glossary";

export interface TranslationJobStatus {
  documentId: string;
  /** Pages whose every unit is translated. */
  done: number; total: number;
  translated: number; failed: number; pendingBlocks: number; cancelledBlocks: number;
  totalBlocks: number; translatableBlocks: number; excludedBlocks: number;
  extractedPages: number; ocrPages: number; ocrCandidatePages: number;
  requests: number; concurrency: number; rateLimitHits: number; retried: number; inputTokens: number; outputTokens: number;
  extractionMs: number; translationMs: number; firstResultMs: number | null;
  /** Units served by the shared cache (no model call). */
  sharedUnits?: number;
  failedUnits: { unitId: string; page: number; error: string; preview: string }[];
  running: boolean; complete: boolean; error?: string;
}

type Listener = (status: TranslationJobStatus) => void;
const jobs = new Map<string, { status: TranslationJobStatus; controller: AbortController; listeners: Set<Listener>; timer?: ReturnType<typeof setTimeout> }>();
export function translationJobStatus(documentId: string) { return jobs.get(documentId)?.status ?? null; }
export function subscribeTranslationJob(documentId: string, listener: Listener) {
  const job = jobs.get(documentId);
  if (job) { job.listeners.add(listener); listener(job.status); }
  return () => { job?.listeners.delete(listener); };
}

/** Progress is published at most ~6 times a second; the reader must stay smooth while a job runs. */
function update(documentId: string, patch: Partial<TranslationJobStatus>, immediate = false) {
  const job = jobs.get(documentId);
  if (!job) return;
  job.status = { ...job.status, ...patch };
  const flush = () => { job.timer = undefined; job.listeners.forEach(listener => listener(job.status)); window.dispatchEvent(new CustomEvent("paperflow:translation-progress", { detail: job.status })); };
  if (immediate) { if (job.timer) clearTimeout(job.timer); flush(); }
  else job.timer ??= setTimeout(flush, 160);
}
export function cancelTranslationJob(documentId: string) { jobs.get(documentId)?.controller.abort(); }

const roleOf = (unit: TranslationUnit): PassageRole => unit.role === "HEADING" ? "heading" : unit.role === "CAPTION" ? "caption" : "body";

async function openManifest(documentId: string, signal: AbortSignal, onPage?: (page: number) => void): Promise<TranslationManifest> {
  const manifest = await ensureManifest(documentId, async buildSignal => {
    const blob = await documentRepository.getDocumentBlob(documentId);
    if (!blob) throw new Error("이 브라우저에 저장된 PDF를 찾지 못했습니다.");
    return pdfAdapter.open(await blob.arrayBuffer(), buildSignal);
  }, onPage, signal, ocrPage);
  void releaseOcr();
  useTranslationStore.getState().setManifest(manifest);
  return manifest;
}

function pagesDone(manifest: TranslationManifest, translated: ReadonlySet<string>) {
  let done = 0;
  for (let page = 0; page < manifest.pageCount; page++) if (!manifest.ocrCandidates?.includes(page) && manifest.units.filter(unit => unit.pages.includes(page)).every(unit => translated.has(unit.id))) done++;
  return done;
}

/**
 * Translate every missing unit of a paper. Starts from `fromPage` so the page
 * being read appears first, saves each model response in one transaction, and
 * never re-sends a unit that is already stored.
 */
export async function startTranslationJob(documentId: string, options: { fromPage?: number; unitIds?: string[] } = {}): Promise<TranslationJobStatus> {
  const existing = jobs.get(documentId);
  if (existing?.status.running) return existing.status;
  const controller = new AbortController();
  const record = await documentRepository.getDocument(documentId);
  if (!record) throw new Error("이 브라우저에 저장된 PDF를 찾지 못했습니다.");
  const status: TranslationJobStatus = { documentId, done: 0, total: record.pageCount, translated: 0, failed: 0, pendingBlocks: 0, cancelledBlocks: 0, totalBlocks: 0, translatableBlocks: 0, excludedBlocks: 0, extractedPages: 0, ocrPages: 0, ocrCandidatePages: 0, requests: 0, concurrency: 0, rateLimitHits: 0, retried: 0, inputTokens: 0, outputTokens: 0, extractionMs: 0, translationMs: 0, firstResultMs: null, failedUnits: [], running: true, complete: false };
  jobs.set(documentId, { status, controller, listeners: existing?.listeners ?? new Set() });
  update(documentId, status, true);
  const store = useTranslationStore.getState;
  let target: TranslationUnit[] = [];
  try {
    const started = performance.now();
    const manifest = await openManifest(documentId, controller.signal, extractedPages => update(documentId, { extractedPages }));
    update(documentId, { extractionMs: Math.round(performance.now() - started), extractedPages: manifest.pageCount });
    const stored = await translationRepository.unitTexts(documentId);
    if (store().documentId === documentId) store().setTexts(documentId, new Map([...store().texts, ...stored]));
    const translated = new Set(stored.keys()), failed = new Map<string, string>();
    const units = new Map(manifest.units.map(unit => [unit.id, unit]));
    const only = options.unitIds ? new Set(options.unitIds) : null;
    const from = Math.max(0, (options.fromPage ?? 1) - 1);
    target = manifest.units.filter(unit => !translated.has(unit.id) && (!only || only.has(unit.id)))
      .sort((a, b) => Number(Math.max(...a.pages) < from) - Number(Math.max(...b.pages) < from) || manifest.units.indexOf(a) - manifest.units.indexOf(b));
    const refresh = (scheduler?: SchedulerState) => {
      const counts = manifestCounts(manifest, translated, new Set(failed.keys()));
      update(documentId, {
        done: pagesDone(manifest, translated), translated: counts.translatedBlocks, failed: counts.failedBlocks, totalBlocks: counts.totalBlocks, translatableBlocks: counts.translatableBlocks, excludedBlocks: counts.excludedBlocks, pendingBlocks: counts.pendingBlocks, cancelledBlocks: counts.cancelledBlocks,
        ocrPages: manifest.ocrPages, ocrCandidatePages: counts.ocrCandidatePages, complete: counts.complete,
        failedUnits: [...failed].map(([unitId, error]) => { const unit = units.get(unitId)!; return { unitId, page: unit.pages[0] + 1, error, preview: unit.text.slice(0, 90) }; }),
        ...(scheduler ? { requests: scheduler.requests, concurrency: scheduler.concurrency, rateLimitHits: scheduler.rateLimitHits, retried: scheduler.retried, inputTokens: scheduler.inputTokens, outputTokens: scheduler.outputTokens } : {})
      });
    };
    refresh();
    store().setPending(documentId, target.map(unit => unit.id), true);
    const translationStarted = performance.now();
    // Paragraphs already translated by anyone (same text, same prompt) cost nothing and appear at once.
    const shared = await sharedTranslations(target, controller.signal);
    if (shared.size) {
      const entries = [...shared].map(([id, text]) => ({ id, text: polishKorean(text) }));
      await translationRepository.putUnits(documentId, entries.map(entry => { const unit = units.get(entry.id)!; return { unitId: unit.id, pageIndex: unit.pages[0], source: unit.text, text: entry.text }; }));
      for (const entry of entries) translated.add(entry.id);
      store().addTexts(documentId, entries);
      update(documentId, { firstResultMs: Math.round(performance.now() - translationStarted), sharedUnits: entries.length });
      target = target.filter(unit => !shared.has(unit.id));
      refresh();
    }
    if (target.length) await runTranslationScheduler(
      target.map(unit => ({ id: unit.id, text: unit.text, role: roleOf(unit) })), controller.signal, (group, signal) => researchTranslateBlocks(group, signal, paperGlossary(manifest)),
      async results => {
        const entries = results.map(result => ({ id: result.id, text: polishKorean(result.text) }));
        await translationRepository.putUnits(documentId, entries.map(entry => { const unit = units.get(entry.id)!; return { unitId: unit.id, pageIndex: unit.pages[0], source: unit.text, text: entry.text }; }));
        for (const entry of entries) { translated.add(entry.id); failed.delete(entry.id); }
        store().addTexts(documentId, entries);
        if (jobs.get(documentId)!.status.firstResultMs === null) update(documentId, { firstResultMs: Math.round(performance.now() - translationStarted) });
        refresh();
      },
      (passage, error) => { failed.set(passage.id, readableError(error)); store().setFailed(documentId, passage.id, readableError(error)); store().setPending(documentId, [passage.id], false); refresh(); },
      refresh
    );
    update(documentId, { translationMs: Math.round(performance.now() - translationStarted) });
    refresh();
    const final = jobs.get(documentId)!.status;
    if (!final.complete && !controller.signal.aborted && !only) update(documentId, { error: final.ocrCandidatePages ? `${final.ocrCandidatePages}개 이미지 페이지는 OCR이 필요합니다. 나머지 번역은 저장됐습니다.` : final.failed ? `${final.failed}개 문단을 번역하지 못했습니다. ‘실패 문단 재시도’로 그 문단만 다시 요청합니다.` : `${final.pendingBlocks}개 문단이 남았습니다. 다시 시작하면 저장된 번역은 재사용합니다.` });
  } catch (error) {
    if (!controller.signal.aborted) update(documentId, { error: error instanceof ResearchHttpError && error.status === 429 ? "번역 서비스 사용량 제한으로 멈췄습니다. 완료된 문단은 저장됐고, 다시 시작하면 남은 문단부터 진행합니다." : readableError(error) });
  } finally {
    store().setPending(documentId, target.map(unit => unit.id), false);
    update(documentId, { running: false }, true);
  }
  return jobs.get(documentId)!.status;
}

/** Load stored translations and the manifest for the reader; builds the manifest once if needed. */
export async function prepareReader(documentId: string, signal: AbortSignal) {
  const store = useTranslationStore.getState();
  store.open(documentId);
  const [texts] = await Promise.all([translationRepository.unitTexts(documentId), openManifest(documentId, signal)]);
  useTranslationStore.getState().setTexts(documentId, new Map([...texts, ...useTranslationStore.getState().texts]));
}

/** Translate a few units right now (paragraph click, retry) without waiting for a bulk job. */
export async function translateUnitsNow(documentId: string, unitIds: string[]) {
  const store = useTranslationStore.getState;
  const manifest = store().manifest?.documentId === documentId ? store().manifest! : await openManifest(documentId, new AbortController().signal);
  const units = manifest.units.filter(unit => unitIds.includes(unit.id) && !store().texts.has(unit.id));
  if (!units.length) return;
  store().setPending(documentId, units.map(unit => unit.id), true);
  try {
    const shared = await sharedTranslations(units);
    const missingUnits = units.filter(unit => !shared.has(unit.id));
    const response = missingUnits.length ? await researchTranslateBlocks(missingUnits.map(unit => ({ id: unit.id, text: unit.text, role: roleOf(unit) })), undefined, paperGlossary(manifest)) : { results: [], missing: [] as string[] };
    const results = [...[...shared].map(([id, text]) => ({ id, text })), ...response.results], missing = response.missing;
    const entries = results.map(result => ({ id: result.id, text: polishKorean(result.text) }));
    await translationRepository.putUnits(documentId, entries.map(entry => { const unit = units.find(item => item.id === entry.id)!; return { unitId: unit.id, pageIndex: unit.pages[0], source: unit.text, text: entry.text }; }));
    store().addTexts(documentId, entries);
    for (const id of missing) store().setFailed(documentId, id, "모델 응답에서 이 문단의 번역이 누락되었습니다.");
  } catch (error) {
    for (const unit of units) store().setFailed(documentId, unit.id, readableError(error));
    throw error;
  } finally { store().setPending(documentId, units.map(unit => unit.id), false); }
}
