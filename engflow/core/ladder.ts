import { DAY_MS } from "./fsrs";
import { situationOf } from "./situations";
import type { SessionItem } from "./session";
import type { LearnerState, Question, Situation } from "./types";

/**
 * "Short to long": one session that climbs from a one-line reply to a long,
 * multi-sentence turn in the same scene (difficulty 1 → the learner's level
 * plus a stretch), so speaking grows step by step.
 */

export interface LadderOptions {
  situation: Situation | "all";
  /** First and last difficulty of the climb. */
  from: number;
  to: number;
  size: number;
  now: number;
  rng?: () => number;
}

/** Evenly spaced difficulties from `from` to `to` (inclusive), never going down. */
export function ladderSteps(from: number, to: number, size: number): number[] {
  const a = Math.max(1, Math.min(10, Math.round(from)));
  const b = Math.max(a, Math.min(10, Math.round(to)));
  if (size <= 1) return [a];
  return Array.from({ length: size }, (_, k) => Math.round(a + (k * (b - a)) / (size - 1)));
}

/** The climb for a learner: start very short, end two steps above their level. */
export function ladderRange(target: number): { from: number; to: number } {
  return { from: 1, to: Math.max(4, Math.min(10, target + 2)) };
}

export function buildLadder(state: Pick<LearnerState, "seen">, bank: Question[], opts: LadderOptions): SessionItem[] {
  const rng = opts.rng ?? Math.random;
  const recent = opts.now - 3 * DAY_MS;
  const pool = bank.filter(
    (q) => !q.variation && !q.id.startsWith("dg-") && !q.scenario && (opts.situation === "all" || situationOf(q) === opts.situation),
  );
  const used = new Set<string>();
  const items: SessionItem[] = [];
  const steps = ladderSteps(opts.from, opts.to, opts.size);
  steps.forEach((d, k) => {
    // Exact difficulty first, then ±1, then ±2; unseen and not-recent questions first.
    for (const spread of [0, 1, 2]) {
      const cands = pool.filter((q) => !used.has(q.id) && Math.abs(q.difficulty - d) <= spread && (spread === 0 || q.difficulty >= (items.length ? 1 : 0)));
      if (!cands.length) continue;
      const score = (q: Question) => {
        const seen = state.seen[q.id];
        return (seen ? (seen.lastAt > recent ? -4 : -1) : 2) - Math.abs(q.difficulty - d) + rng() * 0.5;
      };
      const best = cands.sort((x, y) => score(y) - score(x))[0];
      used.add(best.id);
      items.push({ kind: "new", questionId: best.id, reasonKo: `계단 ${k + 1}/${steps.length} · 난이도 ${best.difficulty}` });
      return;
    }
  });
  // Keep the climb monotone even when a step had to borrow a neighbour.
  return items
    .map((it) => ({ it, d: bank.find((q) => q.id === it.questionId)!.difficulty }))
    .sort((a, b) => a.d - b.d)
    .map(({ it, d }, k) => ({ ...it, reasonKo: `계단 ${k + 1}/${items.length} · 난이도 ${d}` }));
}
