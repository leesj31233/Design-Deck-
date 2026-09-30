import { documentRepository } from "../persistence/document-repository";
import { translationRepository } from "../persistence/translation-repository";
import { pdfAdapter } from "../pdf/pdf-adapter";
import { readableError } from "../errors";
import { extractPageForTranslation } from "./extract-page";
import { researchBatchTranslate, ResearchHttpError } from "./research-api";
import type { PdfParagraph } from "./paragraphs";

export interface TranslationJobStatus {
  documentId: string;
  done: number;
  total: number;
  translated: number;
  failed: number;
  running: boolean;
  error?: string;
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

async function translateGroup(documentId: string, pageIndex: number, group: PdfParagraph[], signal: AbortSignal): Promise<{ translated: number; failed: number }> {
  signal.throwIfAborted();
  try {
    const translations = await researchBatchTranslate(group.map(item => item.text), signal);
    if (!translations) throw new Error("번역 서버에 연결하지 못했다.");
    await Promise.all(group.map((item, index) => translationRepository.put(documentId, pageIndex, item.text, translations[index], "OpenAI")));
    window.dispatchEvent(new CustomEvent("paperflow:translations-saved", { detail: { documentId, pageIndex } }));
    return { translated: group.length, failed: 0 };
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof ResearchHttpError && error.status === 429) throw error;
    if (group.length === 1) return { translated: 0, failed: 1 };
    const middle = Math.ceil(group.length / 2);
    const first = await translateGroup(documentId, pageIndex, group.slice(0, middle), signal);
    const second = await translateGroup(documentId, pageIndex, group.slice(middle), signal);
    return { translated: first.translated + second.translated, failed: first.failed + second.failed };
  }
}

export async function startTranslationJob(documentId: string): Promise<TranslationJobStatus> {
  const existing = jobs.get(documentId);
  if (existing?.status.running) return existing.status;
  const controller = new AbortController();
  const record = await documentRepository.getDocument(documentId);
  const blob = await documentRepository.getDocumentBlob(documentId);
  if (!record || !blob) throw new Error("이 브라우저에 저장된 PDF를 찾지 못했다.");
  const status: TranslationJobStatus = { documentId, done: 0, total: record.pageCount, translated: 0, failed: 0, running: true };
  jobs.set(documentId, { status, controller, listeners: existing?.listeners ?? new Set() });
  update(documentId, status);
  let pdf: Awaited<ReturnType<typeof pdfAdapter.open>> | undefined;
  try {
    pdf = await pdfAdapter.open(await blob.arrayBuffer(), controller.signal);
    let next = 0, rateLimited = false;
    const worker = async () => {
      while (next < pdf!.pageCount && !controller.signal.aborted && !rateLimited) {
        const pageIndex = next++;
        let translated = 0, failed = 0;
        try {
          const handle = await pdf!.getPage(pageIndex + 1);
          const targets = await extractPageForTranslation(handle, pageIndex, controller.signal);
          const stored = await Promise.all(targets.map(item => translationRepository.get(documentId, pageIndex, item.text)));
          const missing = targets.filter((_, index) => !stored[index]);
          for (let index = 0; index < missing.length && !controller.signal.aborted;) {
            const group: PdfParagraph[] = []; let chars = 0;
            while (index < missing.length && group.length < 4 && chars + missing[index].text.length <= 4500) {
              const item = missing[index++]; group.push(item); chars += item.text.length;
            }
            if (!group.length) group.push(missing[index++]);
            const result = await translateGroup(documentId, pageIndex, group, controller.signal);
            translated += result.translated; failed += result.failed;
          }
        } catch (error) {
          if (controller.signal.aborted) break;
          if (error instanceof ResearchHttpError && error.status === 429) {
            rateLimited = true;
            update(documentId, { error: "번역 서비스 요청 한도에 도달했다. 저장된 번역은 유지된다. 잠시 후 전체 번역을 다시 누르면 남은 문단부터 진행한다." });
            break;
          }
          failed++;
          update(documentId, { error: `${pageIndex + 1}페이지: ${readableError(error)}` });
        }
        const current = jobs.get(documentId)?.status;
        if (current) update(documentId, { done: current.done + 1, translated: current.translated + translated, failed: current.failed + failed });
      }
    };
    await Promise.all([worker(), worker()]);
  } catch (error) { if (!controller.signal.aborted) update(documentId, { error: readableError(error) }); }
  finally { await pdf?.destroy(); update(documentId, { running: false }); }
  return jobs.get(documentId)!.status;
}
