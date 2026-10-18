import type { DiagnosticItem } from "../content/types";
import type { Cefr, DiagnosticResultRecord, DiagnosticSheet } from "./types";
import { CEFR_ORDER } from "./types";

/**
 * Adaptive placement test. Ability θ lives on a logit scale (A2 ≈ -1, B1 ≈ 0,
 * B2 ≈ 1, C1 ≈ 2). The posterior over θ is kept on a grid and updated with a
 * partial-credit logistic likelihood; the next item is the unused item of the
 * current part whose difficulty is closest to the current estimate.
 */

export const DIAGNOSTIC_PLANS = {
  standard: [4, 4, 4, 3, 2],
  extended: [6, 6, 6, 5, 4],
} as const;
export type DiagnosticLength = keyof typeof DIAGNOSTIC_PLANS;

export const PART_NAMES_KO = ["핵심 문법·문장 구성", "짧은 구문 영작", "완전한 문장 구성", "회의 응답", "상황 설명"];

const GRID: number[] = Array.from({ length: 141 }, (_, i) => -3 + i * 0.05);
const PRIOR_MEAN = 0;
const PRIOR_SD = 1.5;

/** CEFR cut points on θ. */
export const CUTS: { level: Cefr; from: number }[] = [
  { level: "A1", from: -Infinity },
  { level: "A2", from: -1.5 },
  { level: "B1", from: -0.5 },
  { level: "B2", from: 0.5 },
  { level: "C1", from: 1.5 },
  { level: "C2", from: 2.5 },
];

export function cefrOf(theta: number): Cefr {
  let l: Cefr = "A1";
  for (const c of CUTS) if (theta >= c.from) l = c.level;
  return l;
}

export interface DiagResponse {
  itemId: string;
  part: number;
  kind: DiagnosticItem["kind"];
  b: number;
  /** 0–1 partial credit. */
  score: number;
  skills: string[];
  responseMs: number;
  firstKeyMs: number | null;
  words: number;
  sub?: { grammar: number; organization: number; terminology: number; meaning: number; comprehensibility: number };
  /** The grading sheet shown on the result page (what was asked, what was answered, how it was graded). */
  sheet?: DiagnosticSheet;
}

export interface DiagnosticSession {
  id: string;
  length: DiagnosticLength;
  startedAt: number;
  responses: DiagResponse[];
  /** Log posterior over GRID. */
  logPost: number[];
}

export function startDiagnostic(length: DiagnosticLength, now: number): DiagnosticSession {
  return {
    id: `dg-${now.toString(36)}`,
    length,
    startedAt: now,
    responses: [],
    logPost: GRID.map((t) => -0.5 * ((t - PRIOR_MEAN) / PRIOR_SD) ** 2),
  };
}

export function posterior(s: DiagnosticSession): { mean: number; sd: number } {
  const max = Math.max(...s.logPost);
  const p = s.logPost.map((l) => Math.exp(l - max));
  const z = p.reduce((a, b) => a + b, 0);
  const mean = GRID.reduce((a, t, i) => a + t * p[i], 0) / z;
  const varr = GRID.reduce((a, t, i) => a + (t - mean) ** 2 * p[i], 0) / z;
  return { mean, sd: Math.sqrt(varr) };
}

function discrimination(kind: DiagnosticItem["kind"]): number {
  return kind === "choice" ? 1.0 : kind === "order" ? 1.2 : 1.35;
}

function pCorrect(theta: number, b: number, kind: DiagnosticItem["kind"]): number {
  const logistic = 1 / (1 + Math.exp(-1.7 * discrimination(kind) * (theta - b)));
  const guess = kind === "choice" ? 0.25 : 0;
  return guess + (1 - guess) * logistic;
}

/** Which part is active, given how many items have been answered. */
export function currentPart(s: DiagnosticSession): number | null {
  const plan = DIAGNOSTIC_PLANS[s.length];
  let n = s.responses.length;
  for (let p = 0; p < plan.length; p++) {
    if (n < plan[p]) return p + 1;
    n -= plan[p];
  }
  return null;
}

export function totalItems(length: DiagnosticLength): number {
  return DIAGNOSTIC_PLANS[length].reduce((a, b) => a + b, 0);
}

/** Deterministic 0–1 hash: the same session and step always pick the same item (stable across re-renders). */
function unitHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h / 4294967296;
}

/** How far from the target difficulty an item may be and still be picked (logits). */
const PICK_WINDOW = 0.35;

/**
 * The next item: one of the unused items of the current part whose difficulty is near the current estimate,
 * picked at random (seeded by the session) so a retake shows different items. Items the learner saw in recent
 * tests (`avoid`) and items on the same grammar point as the previous item are passed over while others remain.
 */
export function nextDiagnosticItem(s: DiagnosticSession, items: DiagnosticItem[], avoid: ReadonlySet<string> = new Set()): DiagnosticItem | null {
  const part = currentPart(s);
  if (part === null) return null;
  const used = new Set(s.responses.map((r) => r.itemId));
  const { mean } = posterior(s);
  const pool = items.filter((i) => i.part === part && !used.has(i.id));
  if (!pool.length) return null;
  // First item of the test starts near B1 (θ = 0) regardless of the prior mean.
  const target = s.responses.length === 0 ? 0 : mean;
  const lastSkill = s.responses[s.responses.length - 1]?.skills[0];
  const fresh = pool.filter((i) => !avoid.has(i.id));
  const varied = (fresh.length ? fresh : pool).filter((i) => i.skills[0] !== lastSkill);
  const candidates = varied.length ? varied : fresh.length ? fresh : pool;
  const nearest = Math.min(...candidates.map((i) => Math.abs(i.b - target)));
  const near = candidates.filter((i) => Math.abs(i.b - target) <= nearest + PICK_WINDOW);
  return near[Math.floor(unitHash(`${s.id}:${s.responses.length}`) * near.length)];
}

/** Map an evaluation's overall score (0–100) to partial credit. */
export function creditFromOverall(overall: number): number {
  return Math.max(0, Math.min(1, (overall - 40) / 55));
}

/** Partial credit that also reflects error severity (one major error should not still earn full credit). */
export function creditFromEvaluation(ev: { scores: { overall: number }; errors: { severity: string }[] }): number {
  const majors = ev.errors.filter((e) => e.severity === "major").length;
  const criticals = ev.errors.filter((e) => e.severity === "critical").length;
  return Math.max(0, Math.min(1, creditFromOverall(ev.scores.overall) - 0.2 * majors - 0.4 * criticals));
}

/** Credit for an ordering item: share of adjacent chunk pairs kept in the right order. */
export function creditFromOrder(correct: string[], answer: string[]): number {
  if (answer.length !== correct.length) return 0;
  if (answer.every((c, i) => c === correct[i])) return 1;
  let pairs = 0;
  for (let i = 0; i < answer.length - 1; i++) {
    const a = correct.indexOf(answer[i]);
    const b = correct.indexOf(answer[i + 1]);
    if (b === a + 1) pairs++;
  }
  return (pairs / (correct.length - 1)) * 0.8;
}

export function recordDiagnosticResponse(s: DiagnosticSession, r: DiagResponse): DiagnosticSession {
  const logPost = s.logPost.map((lp, i) => {
    const p = Math.min(0.999, Math.max(0.001, pCorrect(GRID[i], r.b, r.kind)));
    return lp + r.score * Math.log(p) + (1 - r.score) * Math.log(1 - p);
  });
  return { ...s, responses: [...s.responses, r], logPost };
}

function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

export function finishDiagnostic(s: DiagnosticSession, now: number): DiagnosticResultRecord {
  const { mean, sd } = posterior(s);
  const n = s.responses.length;
  const confidence: DiagnosticResultRecord["confidence"] = sd < 0.38 && n >= 15 ? "high" : sd < 0.55 && n >= 10 ? "medium" : "low";
  const produce = s.responses.filter((r) => r.kind === "produce" && r.sub);
  const grammarChoice = s.responses.filter((r) => r.kind === "choice").map((r) => r.score * 100);
  const orderScores = s.responses.filter((r) => r.kind === "order").map((r) => r.score * 100);
  const sub = {
    grammar: Math.round(avg([...produce.map((r) => r.sub!.grammar), ...grammarChoice]) || 0),
    construction: Math.round(avg([...produce.map((r) => r.sub!.organization), ...orderScores]) || 0),
    vocabulary: Math.round(avg(produce.map((r) => r.sub!.terminology)) || 0),
    clarity: Math.round(avg(produce.map((r) => r.sub!.comprehensibility)) || 0),
  };
  const timed = produce.filter((r) => r.responseMs > 2000 && r.words >= 2);
  const fluency =
    timed.length >= 3
      ? {
          medianWpm: Math.round(median(timed.map((r) => r.words / (r.responseMs / 60000)))),
          medianFirstKeySec: Math.round(median(timed.filter((r) => r.firstKeyMs !== null).map((r) => (r.firstKeyMs ?? 0) / 1000)) * 10) / 10,
        }
      : null;

  const bySkill = new Map<string, number[]>();
  for (const r of s.responses) for (const k of r.skills) bySkill.set(k, [...(bySkill.get(k) ?? []), r.score]);
  const skillAvg = [...bySkill.entries()].map(([k, v]) => ({ k, v: avg(v), n: v.length }));
  const strengths = skillAvg.filter((x) => x.v >= 0.75).sort((a, b) => b.v - a.v || b.n - a.n).slice(0, 4).map((x) => x.k);
  const weaknesses = skillAvg.filter((x) => x.v <= 0.6).sort((a, b) => a.v - b.v || b.n - a.n).slice(0, 4).map((x) => x.k);

  const low = cefrOf(mean - sd);
  const high = cefrOf(mean + sd);
  const point = cefrOf(mean);
  // Avoid over-placing: with low confidence start at the lower end of the range.
  const recommended = confidence === "low" ? low : point;
  const partScores: Record<string, number> = {};
  for (let p = 1; p <= 5; p++) {
    const xs = s.responses.filter((r) => r.part === p).map((r) => r.score * 100);
    if (xs.length) partScores[String(p)] = Math.round(avg(xs));
  }
  return {
    id: s.id,
    at: now,
    length: s.length,
    items: n,
    theta: Math.round(mean * 100) / 100,
    sd: Math.round(sd * 100) / 100,
    cefrLow: CEFR_ORDER.indexOf(low) < CEFR_ORDER.indexOf(point) ? low : point,
    cefrHigh: CEFR_ORDER.indexOf(high) > CEFR_ORDER.indexOf(point) ? high : point,
    cefrPoint: point,
    confidence,
    sub,
    fluency,
    strengths,
    weaknesses,
    recommendedLevel: recommended === "A1" ? "A2" : recommended === "C2" ? "C1" : recommended,
    partScores,
    sheets: s.responses.flatMap((r) => (r.sheet ? [r.sheet] : [])),
  };
}

/** Position of θ within the CEFR scale for drawing (0–1 across A1…C2). */
export function thetaToScale(theta: number): number {
  return Math.max(0, Math.min(1, (theta + 2.5) / 6));
}
