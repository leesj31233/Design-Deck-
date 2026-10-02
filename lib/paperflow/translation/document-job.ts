import { documentRepository } from "../persistence/document-repository";
import { translationRepository, TRANSLATION_PROMPT_VERSION } from "../persistence/translation-repository";
import { pdfAdapter } from "../pdf/pdf-adapter";
import { readableError } from "../errors";
import { buildTranslationManifest, manifestCounts, manifestRepository, type ManifestBlock, type TranslationManifest } from "./manifest";
import { researchTranslateBlocks, ResearchHttpError } from "./research-api";
import { runTranslationScheduler, type SchedulerState } from "./scheduler";

export interface TranslationJobStatus {
  documentId: string;
  done: number; total: number; translated: number; failed: number;
  totalBlocks: number; translatableBlocks: number; excludedBlocks: number; pendingBlocks: number; cancelledBlocks: number;
  extractedPages: number; ocrPages: number; ocrCandidatePages: number; requests: number; concurrency: number; rateLimitHits: number;
  extractionMs: number; translationMs: number;
  running: boolean; complete: boolean; error?: string;
}

type Listener = (status: TranslationJobStatus) => void;
const jobs = new Map<string, { status: TranslationJobStatus; controller: AbortController; listeners: Set<Listener> }>();
export function translationJobStatus(documentId: string) { return jobs.get(documentId)?.status ?? null; }
export function subscribeTranslationJob(documentId: string, listener: Listener) {
  const job = jobs.get(documentId);
  if (job) { job.listeners.add(listener); listener(job.status); }
  return () => { job?.listeners.delete(listener); };
}
function update(documentId: string, patch: Partial<TranslationJobStatus>) {
  const job = jobs.get(documentId);
  if (!job) return;
  job.status = { ...job.status, ...patch };
  job.listeners.forEach(listener => listener(job.status));
  window.dispatchEvent(new CustomEvent("paperflow:translation-progress", { detail: job.status }));
}
export function cancelTranslationJob(documentId: string) { jobs.get(documentId)?.controller.abort(); }

function countCompletedPages(manifest: TranslationManifest, translatedIds: Set<string>) {
  const pages = new Map<number, ManifestBlock[]>();
  for (const block of manifest.blocks) if (block.translatable) pages.set(block.pageIndex, [...(pages.get(block.pageIndex) ?? []), block]);
  let done = 0;
  for (let index = 0; index < manifest.pageCount; index++) if (!manifest.ocrCandidates?.includes(index) && (pages.get(index) ?? []).every(block => translatedIds.has(block.id))) done++;
  return done;
}

export async function startTranslationJob(documentId: string): Promise<TranslationJobStatus> {
  const existing = jobs.get(documentId);
  if (existing?.status.running) return existing.status;
  const controller = new AbortController();
  const [record, blob] = await Promise.all([documentRepository.getDocument(documentId), documentRepository.getDocumentBlob(documentId)]);
  if (!record || !blob) throw new Error("이 브라우저에 저장된 PDF를 찾지 못했다.");
  const status: TranslationJobStatus = { documentId, done: 0, total: record.pageCount, translated: 0, failed: 0, totalBlocks: 0, translatableBlocks: 0, excludedBlocks: 0, pendingBlocks: 0, cancelledBlocks: 0, extractedPages: 0, ocrPages: 0, ocrCandidatePages: 0, requests: 0, concurrency: 4, rateLimitHits: 0, extractionMs: 0, translationMs: 0, running: true, complete: false };
  jobs.set(documentId, { status, controller, listeners: existing?.listeners ?? new Set() });
  update(documentId, status);
  let pdf: Awaited<ReturnType<typeof pdfAdapter.open>> | undefined;
  try {
    const extractionStarted = performance.now();
    let manifest = await manifestRepository.get(documentId);
    if (!manifest || manifest.pageCount !== record.pageCount) {
      pdf = await pdfAdapter.open(await blob.arrayBuffer(), controller.signal);
      manifest = await buildTranslationManifest(documentId, pdf, controller.signal, extractedPages => update(documentId, { extractedPages }));
      await manifestRepository.put(manifest);
    }
    update(documentId, { extractionMs: Math.round(performance.now() - extractionStarted) });
    controller.signal.throwIfAborted();
    const target = manifest.blocks.filter(block => block.translatable);
    const stored = await translationRepository.listByDocument(documentId);
    const translatedIds = new Set(stored.filter(item => item.blockId && item.promptVersion === TRANSLATION_PROMPT_VERSION && item.text.trim()).map(item => item.blockId!));
    const failedIds = new Set<string>();
    const byId = new Map(target.map(block => [block.id, block]));
    let latestScheduler: SchedulerState | undefined;
    const refresh = (scheduler?: SchedulerState) => {
      if (scheduler) latestScheduler = scheduler;
      const counts = manifestCounts(manifest!, translatedIds, failedIds);
      update(documentId, { done: countCompletedPages(manifest!, translatedIds), translated: counts.translatedBlocks, failed: counts.failedBlocks, totalBlocks: counts.totalBlocks, translatableBlocks: counts.translatableBlocks, excludedBlocks: counts.excludedBlocks, pendingBlocks: counts.pendingBlocks, cancelledBlocks: counts.cancelledBlocks, extractedPages: manifest!.extractedPages, ocrPages: manifest!.ocrPages, ocrCandidatePages: counts.ocrCandidatePages, complete: counts.complete, requests: latestScheduler?.requests ?? 0, concurrency: latestScheduler?.concurrency ?? 4, rateLimitHits: latestScheduler?.rateLimitHits ?? 0 });
    };
    refresh();
    const missing = target.filter(block => !translatedIds.has(block.id)).map(block => ({ id: block.id, text: block.text }));
    const translationStarted = performance.now();
    if (missing.length) await runTranslationScheduler(missing, controller.signal, researchTranslateBlocks, async result => {
      const block = byId.get(result.id);
      if (!block) throw new Error("Manifest에 없는 번역 블록이다.");
      await translationRepository.putBlock(documentId, block.id, block.pageIndex, block.text, result.text);
      translatedIds.add(block.id);
      failedIds.delete(block.id);
      refresh();
      window.dispatchEvent(new CustomEvent("paperflow:translations-saved", { detail: { documentId, pageIndex: block.pageIndex } }));
    }, (passage, error) => { failedIds.add(passage.id); update(documentId, { error: `${(byId.get(passage.id)?.pageIndex ?? 0) + 1}페이지: ${readableError(error)}` }); refresh(); }, refresh);
    update(documentId, { translationMs: Math.round(performance.now() - translationStarted) });
    refresh();
    const final = jobs.get(documentId)!.status;
    if (!final.complete && !controller.signal.aborted && !final.error) update(documentId, { error: final.ocrCandidatePages ? `${final.ocrCandidatePages}개 이미지 기반 페이지에는 OCR이 필요하다. 다른 페이지의 번역은 저장됐다.` : `${final.failed}개 실패, ${final.pendingBlocks}개 대기 중이다. 다시 시도하면 저장된 번역을 재사용한다.` });
  } catch (error) {
    if (!controller.signal.aborted) update(documentId, { error: error instanceof ResearchHttpError && error.status === 429 ? "번역 서비스 사용량 제한으로 일시 중지했다. 완료된 블록은 저장됐다. 나중에 재시도하면 남은 블록부터 진행한다." : readableError(error) });
  } finally {
    await pdf?.destroy();
    update(documentId, { running: false });
  }
  return jobs.get(documentId)!.status;
}
