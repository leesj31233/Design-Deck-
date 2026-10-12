import { evaluateLocal, scoredErrors } from "./evaluate";
import { tokenize, words } from "./text";
import type { Evaluation, Question } from "./types";

/**
 * Fast grading. The learner sees exactly one result, within a small budget
 * (1 s by default) after submitting:
 *
 *  - Clear answers (exact match, or a close answer with no error found) are
 *    graded instantly by the rule-based grader; Claude adds nothing there.
 *  - While the learner types, a pause on a fairly complete sentence starts
 *    Claude grading in the background ("prefetch"). Submitting that same text
 *    shows Claude's grade at once, often with no wait at all.
 *  - Otherwise Claude gets the budget; if it has not answered, the
 *    rule-based grade is shown and the late reply is discarded, so a score
 *    never changes after it appears.
 */

export type GradeVia = "instant" | "prefetched" | "ai" | "local-timeout" | "local-error" | "local-skip" | "local-off";

export interface GradeOutcome {
  evaluation: Evaluation;
  /** Time from submit to result. */
  ms: number;
  via: GradeVia;
  /** Shown under the verdict when the rule-based grade stood in for Claude. */
  noteKo: string | null;
}

export interface GraderOptions {
  /** Claude grading (rejects when unavailable or aborted). */
  evaluate: (q: Question, answer: string, local: Evaluation, signal: AbortSignal) => Promise<Evaluation>;
  aiEnabled: () => boolean;
  /** How long a submit may wait for Claude (ms). */
  budgetMs: () => number;
  /** Background grading requests allowed per question. */
  maxPrefetch?: number;
  clock?: () => number;
}

interface Pending {
  key: string;
  ctl: AbortController;
  promise: Promise<Evaluation | null>;
  done: boolean;
  result: Evaluation | null;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** The rule-based grade is enough: an exact match, or a close answer in which nothing but spelling differs. */
export function ruleBasedIsEnough(local: Evaluation): boolean {
  return local.exact || (local.confidence === "high" && scoredErrors(local.errors).every((e) => e.category === "spelling"));
}

/** Worth grading in the background: at least half the reference's length. */
export function looksComplete(q: Question, text: string): boolean {
  const n = words(tokenize(text)).length;
  return n >= Math.max(2, Math.ceil(words(tokenize(q.reference)).length * 0.5));
}

export function createGrader(opts: GraderOptions) {
  const clock = opts.clock ?? now;
  const maxPrefetch = opts.maxPrefetch ?? 5;
  let pending: Pending | null = null;
  const finished = new Map<string, Evaluation>();
  let prefetches = 0;
  let skipWaiting: (() => void) | null = null;

  // Only spacing and final punctuation may differ ("…has changed" then "…has changed."): error positions stay valid.
  const keyOf = (q: Question, text: string, hint: number) => `${q.id}|${hint}|${text.trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "")}`;
  const asSubmitted = (ev: Evaluation, text: string): Evaluation => (ev.answer === text ? ev : { ...ev, answer: text });

  function start(q: Question, text: string, hint: number, local: Evaluation): Pending {
    pending?.ctl.abort();
    const ctl = new AbortController();
    const p: Pending = { key: keyOf(q, text, hint), ctl, done: false, result: null, promise: Promise.resolve(null) };
    p.promise = opts.evaluate(q, text, local, ctl.signal).then(
      (ev) => {
        p.result = ev;
        p.done = true;
        finished.set(p.key, ev);
        if (finished.size > 4) finished.delete(finished.keys().next().value!);
        return ev;
      },
      () => {
        p.done = true;
        return null;
      },
    );
    pending = p;
    return p;
  }

  /** A result that needs no waiting: rule-based for clear answers, or Claude's prefetched grade. */
  function peek(q: Question, text: string, hint: number, t0 = clock()): GradeOutcome | null {
    const t = text.trim();
    const local = evaluateLocal(q, t, { hintLevel: hint });
    const ms = () => Math.round(clock() - t0);
    if (!opts.aiEnabled()) return { evaluation: local, ms: ms(), via: "local-off", noteKo: null };
    if (ruleBasedIsEnough(local)) return { evaluation: local, ms: ms(), via: "instant", noteKo: null };
    const ready = finished.get(keyOf(q, t, hint));
    return ready ? { evaluation: asSubmitted(ready, t), ms: ms(), via: "prefetched", noteKo: null } : null;
  }

  return {
    peek,

    /** Start grading the current text in the background (returns whether a request was sent). */
    prefetch(q: Question, text: string, hint: number): boolean {
      const t = text.trim();
      if (!t || !opts.aiEnabled() || prefetches >= maxPrefetch || !looksComplete(q, t)) return false;
      const key = keyOf(q, t, hint);
      if (finished.has(key) || (pending && pending.key === key && !pending.done)) return false;
      const local = evaluateLocal(q, t, { hintLevel: hint });
      if (ruleBasedIsEnough(local)) return false;
      prefetches++;
      start(q, t, hint, local);
      return true;
    },

    /** On submit: one result, within the budget. */
    async grade(q: Question, text: string, hint: number): Promise<GradeOutcome> {
      const t0 = clock();
      const quick = peek(q, text, hint, t0);
      if (quick) return quick;
      const t = text.trim();
      const local = evaluateLocal(q, t, { hintLevel: hint });
      const key = keyOf(q, t, hint);
      const p = pending && pending.key === key && !(pending.done && !pending.result) ? pending : start(q, t, hint, local);
      const budget = opts.budgetMs();
      const winner = await new Promise<"ai" | "timeout" | "error" | "skip">((resolve) => {
        const timer = setTimeout(() => resolve("timeout"), Math.max(0, budget - (clock() - t0)));
        skipWaiting = () => resolve("skip");
        p.promise.then((ev) => {
          clearTimeout(timer);
          resolve(ev ? "ai" : "error");
        });
      });
      skipWaiting = null;
      const ms = Math.round(clock() - t0);
      if (winner === "ai" && p.result) return { evaluation: asSubmitted(p.result, t), ms, via: "ai", noteKo: null };
      p.ctl.abort(); // a late reply is discarded: the score shown now is final
      if (pending === p) pending = null;
      const secs = Math.round(budget / 100) / 10;
      const noteKo =
        winner === "timeout"
          ? `${secs}초 안에 Claude 응답이 없어 규칙 기반으로 채점했습니다.`
          : winner === "skip"
            ? "기다리지 않고 규칙 기반으로 채점했습니다."
            : "Claude 채점을 사용할 수 없어 규칙 기반으로 채점했습니다.";
      return { evaluation: local, ms, via: winner === "timeout" ? "local-timeout" : winner === "skip" ? "local-skip" : "local-error", noteKo };
    },

    /** Stop waiting for Claude and take the rule-based grade now. */
    skip(): void {
      skipWaiting?.();
    },

    /** New question: forget background work. */
    reset(): void {
      pending?.ctl.abort();
      pending = null;
      finished.clear();
      prefetches = 0;
      skipWaiting = null;
    },
  };
}

export type Grader = ReturnType<typeof createGrader>;

/** Submit-wait budget for each setting. */
export const GRADE_WAIT_MS = { fast: 1000, balanced: 3000, accurate: 9000 } as const;
