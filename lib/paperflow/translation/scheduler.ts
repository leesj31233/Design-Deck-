import { ResearchHttpError } from "./research-api";
import type { TranslationPassage, TranslationResult } from "./block-contract";

export interface TranslationBatch { passages: TranslationPassage[]; attempts: number }
export interface SchedulerState { concurrency: number; requests: number; rateLimitHits: number; completed: number; failed: number }

export function makeTranslationBatches(passages: TranslationPassage[], maxPassages = 10, maxChars = 12000): TranslationBatch[] {
  const batches: TranslationBatch[] = [];
  let current: TranslationPassage[] = [], chars = 0;
  for (const passage of passages) {
    if (current.length && (current.length >= maxPassages || chars + passage.text.length > maxChars)) {
      batches.push({ passages: current, attempts: 0 }); current = []; chars = 0;
    }
    current.push(passage); chars += passage.text.length;
  }
  if (current.length) batches.push({ passages: current, attempts: 0 });
  return batches;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** Adaptive bounded scheduler. 429 pauses the whole queue; only invalid non-429 batches are split. */
export async function runTranslationScheduler(passages: TranslationPassage[], signal: AbortSignal, translate: (group: TranslationPassage[], signal: AbortSignal) => Promise<TranslationResult[]>, onResult: (result: TranslationResult) => Promise<void>, onFailed: (passage: TranslationPassage, error: Error) => void, onState?: (state: SchedulerState) => void): Promise<SchedulerState> {
  const queue = makeTranslationBatches(passages);
  const state: SchedulerState = { concurrency: 4, requests: 0, rateLimitHits: 0, completed: 0, failed: 0 };
  let pauseUntil = 0, successesAtLowConcurrency = 0, fatal: Error | null = null;
  const publish = () => onState?.({ ...state });
  const worker = async (slot: number) => {
    while (!signal.aborted && !fatal) {
      if (slot >= state.concurrency) { if (!queue.length) return; await wait(500, signal); continue; }
      const pause = pauseUntil - Date.now();
      if (pause > 0) { await wait(Math.min(pause, 1000), signal); continue; }
      const batch = queue.shift();
      if (!batch) return;
      let result: TranslationResult[];
      try {
        state.requests++; publish();
        result = await translate(batch.passages, signal);
        if (result.length !== batch.passages.length) throw new Error("번역 결과 블록 수가 맞지 않는다.");
      } catch (reason) {
        if (signal.aborted) throw reason;
        const error = reason instanceof Error ? reason : new Error(String(reason));
        if (error instanceof ResearchHttpError && error.status === 429) {
          state.rateLimitHits++; state.concurrency = Math.max(1, Math.floor(state.concurrency / 2)); successesAtLowConcurrency = 0;
          if (batch.attempts < 5) {
            queue.unshift({ ...batch, attempts: batch.attempts + 1 });
            pauseUntil = Math.max(pauseUntil, Date.now() + Math.min(120000, Math.max(error.retryAfterMs, 2000 * 2 ** batch.attempts)));
            publish(); continue;
          }
          // Preserve the pending blocks for a later retry; a quota cannot be repaired by splitting.
          fatal = error;
          break;
        }
        if (error instanceof ResearchHttpError && error.kind === "configuration") { fatal = error; break; }
        if ((error instanceof ResearchHttpError && error.kind === "transient") || error instanceof TypeError) {
          if (batch.attempts < 3) {
            queue.unshift({ ...batch, attempts: batch.attempts + 1 });
            pauseUntil = Math.max(pauseUntil, Date.now() + Math.min(30000, Math.max(error instanceof ResearchHttpError ? error.retryAfterMs : 0, 1000 * 2 ** batch.attempts)));
            publish(); continue;
          }
          fatal = error;
          break;
        }
        if (batch.passages.length > 1) {
          const middle = Math.ceil(batch.passages.length / 2);
          queue.unshift({ passages: batch.passages.slice(middle), attempts: 0 }, { passages: batch.passages.slice(0, middle), attempts: 0 });
        } else {
          state.failed++; onFailed(batch.passages[0], error); publish();
        }
        continue;
      }
      // A storage failure is fatal. Re-translating a valid response would waste quota and duplicate work.
      for (const item of result) { await onResult(item); state.completed++; publish(); }
      if (state.concurrency < 4 && ++successesAtLowConcurrency >= 3) { state.concurrency++; successesAtLowConcurrency = 0; publish(); }
    }
  };
  await Promise.all(Array.from({ length: 4 }, (_, slot) => worker(slot)));
  if (fatal) throw fatal;
  return state;
}
