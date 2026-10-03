import { ResearchHttpError } from "./research-api";
import type { TranslationBatchResult, TranslationPassage, TranslationResult } from "./block-contract";

export interface TranslationBatch { passages: TranslationPassage[]; attempts: number }
export interface SchedulerState { concurrency: number; requests: number; rateLimitHits: number; completed: number; failed: number; retried: number; inputTokens: number; outputTokens: number }
export interface SchedulerOptions { maxPassages: number; maxChars: number; concurrency: number; maxConcurrency: number; firstChars?: number; warmupMs?: number }
/**
 * Larger batches repeat the instructions fewer times (they are most of the input tokens); the first
 * batch stays small so the page being read shows Korean within a few seconds.
 */
export const DEFAULT_SCHEDULER: SchedulerOptions = { maxPassages: 12, maxChars: 5000, concurrency: 8, maxConcurrency: 10, firstChars: 2500, warmupMs: 1200 };

export function makeTranslationBatches(passages: TranslationPassage[], maxPassages = DEFAULT_SCHEDULER.maxPassages, maxChars = DEFAULT_SCHEDULER.maxChars, firstChars = maxChars): TranslationBatch[] {
  const batches: TranslationBatch[] = [];
  let current: TranslationPassage[] = [], chars = 0;
  for (const passage of passages) {
    const limit = batches.length ? maxChars : firstChars;
    if (current.length && (current.length >= maxPassages || chars + passage.text.length > limit)) {
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

type Translate = (group: TranslationPassage[], signal: AbortSignal) => Promise<TranslationBatchResult & { usage?: { input: number; output: number } }>;

/**
 * Bounded adaptive scheduler.
 * - Valid items of a partly bad response are kept; only the missing ones are retried.
 * - A missing passage is retried alone at most twice, then reported as failed with its id.
 * - 429 halves concurrency and pauses the queue; successes slowly restore it.
 */
export async function runTranslationScheduler(passages: TranslationPassage[], signal: AbortSignal, translate: Translate, onResults: (results: TranslationResult[]) => Promise<void>, onFailed: (passage: TranslationPassage, error: Error) => void, onState?: (state: SchedulerState) => void, options: SchedulerOptions = DEFAULT_SCHEDULER): Promise<SchedulerState> {
  const queue = makeTranslationBatches(passages, options.maxPassages, options.maxChars, options.firstChars);
  const state: SchedulerState = { concurrency: options.concurrency, requests: 0, rateLimitHits: 0, completed: 0, failed: 0, retried: 0, inputTokens: 0, outputTokens: 0 };
  let pauseUntil = 0, streak = 0, fatal: Error | null = null, active = 0;
  // The first request goes alone. OpenAI caches the shared prompt prefix as soon as it has read it
  // (well before the answer is written), so the rest follow after a short head start and pay a
  // quarter of the price for those tokens, without waiting a whole translation for it.
  let warm = queue.length <= 1, warming = false;
  const publish = () => onState?.({ ...state });
  const fail = (batch: TranslationBatch, error: Error) => {
    if (batch.passages.length > 1) { queue.unshift(...batch.passages.map(passage => ({ passages: [passage], attempts: batch.attempts + 1 }))); state.retried += batch.passages.length; return; }
    if (batch.attempts < 2) { queue.unshift({ passages: batch.passages, attempts: batch.attempts + 1 }); state.retried++; return; }
    state.failed++; onFailed(batch.passages[0], error);
  };
  const worker = async (slot: number) => {
    while (!signal.aborted && !fatal) {
      if (slot >= state.concurrency) { if (!queue.length && !active) return; await wait(400, signal); continue; }
      if (!warm && slot > 0) { if (!queue.length && !active) return; await wait(100, signal); continue; }
      const pause = pauseUntil - Date.now();
      if (pause > 0) { await wait(Math.min(pause, 1000), signal); continue; }
      const batch = queue.shift();
      if (!batch) { if (!active) return; await wait(250, signal); continue; }
      active++;
      if (!warm && !warming) { warming = true; setTimeout(() => { warm = true; }, options.warmupMs ?? 1200); }
      try {
        state.requests++; publish();
        const response = await translate(batch.passages, signal);
        state.inputTokens += response.usage?.input ?? 0; state.outputTokens += response.usage?.output ?? 0;
        // A storage failure is fatal. Re-translating a valid response would waste quota.
        if (response.results.length) { await onResults(response.results); state.completed += response.results.length; }
        if (response.missing.length) fail({ passages: batch.passages.filter(passage => response.missing.includes(passage.id)), attempts: batch.attempts }, new Error("모델 응답에서 이 문단의 번역이 누락되었다."));
        if (state.concurrency < options.maxConcurrency && ++streak >= 4) { state.concurrency++; streak = 0; }
        publish();
      } catch (reason) {
        if (signal.aborted) throw reason;
        const error = reason instanceof Error ? reason : new Error(String(reason));
        streak = 0;
        if (error instanceof ResearchHttpError && error.status === 429) {
          state.rateLimitHits++; state.concurrency = Math.max(1, Math.floor(state.concurrency / 2));
          if (batch.attempts < 6) { queue.unshift({ ...batch, attempts: batch.attempts + 1 }); pauseUntil = Math.max(pauseUntil, Date.now() + Math.min(60_000, Math.max(error.retryAfterMs, 1500 * 2 ** batch.attempts))); }
          else fatal = error;
        } else if (error instanceof ResearchHttpError && error.kind === "configuration") fatal = error;
        else if (error instanceof ResearchHttpError && error.kind === "malformed") fail(batch, error);
        else if (batch.attempts < 3) { queue.unshift({ ...batch, attempts: batch.attempts + 1 }); pauseUntil = Math.max(pauseUntil, Date.now() + Math.min(20_000, 1000 * 2 ** batch.attempts)); }
        else fail({ ...batch, attempts: 2 }, error);
        publish();
      } finally { active--; warm = true; }
    }
  };
  await Promise.all(Array.from({ length: options.maxConcurrency }, (_, slot) => worker(slot)));
  if (fatal) throw fatal;
  return state;
}
