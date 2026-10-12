import { createHash } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { AttemptRecord, DiagnosticResultRecord, LearnerState, MistakeRecord, Question, ReviewItem, SkillState } from "../core/types";
import { DEFAULT_SETTINGS, MAX_ATTEMPTS } from "../core/store";
import type { Db } from "./db/client";
import { aiEvaluations, attempts, diagnostics, generatedQuestions, learners, mistakes, reviewItems, skillMastery } from "./db/schema";

/** Learner identity: the browser holds a random 48-hex sync key; the server stores only its hash. */
export function learnerIdFromKey(key: string | null): string | null {
  if (!key || !/^[a-f0-9]{48}$/.test(key)) return null;
  return createHash("sha256").update(`engflow:${key}`).digest("hex").slice(0, 40);
}

const id = z.string().min(1).max(200);
const obj = <T extends z.ZodRawShape>(shape: T) => z.object(shape).passthrough();

/** Incremental sync payload (bounded so one request cannot flood the database). */
export const syncSchema = z.object({
  core: z
    .object({
      profile: z.record(z.string(), z.unknown()),
      settings: z.record(z.string(), z.unknown()),
      daily: z.record(z.string(), z.unknown()),
      seen: z.record(z.string(), z.unknown()),
      updatedAt: z.number(),
    })
    .optional(),
  items: z.array(obj({ id, skill: z.string(), origin: z.string(), due: z.number() })).max(1000).default([]),
  mistakes: z.array(obj({ id, skill: z.string(), category: z.string(), count: z.number() })).max(1000).default([]),
  skills: z.array(obj({ skill: id, status: z.string(), mastery: z.number() })).max(200).default([]),
  attempts: z
    .array(obj({ id, at: z.number(), questionId: z.string(), mode: z.string(), context: z.string(), answer: z.string().max(4000), overall: z.number(), grade: z.number(), hint: z.number(), responseMs: z.number(), evaluator: z.string() }))
    .max(MAX_ATTEMPTS)
    .default([]),
  diagnostics: z.array(obj({ id, at: z.number(), cefrLow: z.string(), cefrHigh: z.string(), cefrPoint: z.string(), confidence: z.string(), theta: z.number(), sd: z.number() })).max(50).default([]),
  generated: z.array(obj({ id, skills: z.array(z.string()).min(1) })).max(100).default([]),
});
export type SyncPayload = z.infer<typeof syncSchema>;

export async function loadState(db: Db, learnerId: string): Promise<LearnerState | null> {
  const [row] = await db.select().from(learners).where(eq(learners.id, learnerId)).limit(1);
  if (!row) return null;
  const [it, mi, sk, di, ge, at] = await Promise.all([
    db.select().from(reviewItems).where(eq(reviewItems.learnerId, learnerId)),
    db.select().from(mistakes).where(eq(mistakes.learnerId, learnerId)),
    db.select().from(skillMastery).where(eq(skillMastery.learnerId, learnerId)),
    db.select().from(diagnostics).where(eq(diagnostics.learnerId, learnerId)).orderBy(asc(diagnostics.at)),
    db.select().from(generatedQuestions).where(eq(generatedQuestions.learnerId, learnerId)),
    db.select().from(attempts).where(eq(attempts.learnerId, learnerId)).orderBy(asc(attempts.at)),
  ]);
  return {
    schema: 1,
    profile: row.profile as LearnerState["profile"],
    settings: { ...DEFAULT_SETTINGS, ...(row.settings as object) },
    daily: (row.daily ?? {}) as LearnerState["daily"],
    seen: (row.seen ?? {}) as LearnerState["seen"],
    items: Object.fromEntries(it.map((r) => [r.id, r.data as ReviewItem])),
    mistakes: Object.fromEntries(mi.map((r) => [r.id, r.data as MistakeRecord])),
    skills: Object.fromEntries(sk.map((r) => [r.skill, r.data as SkillState])),
    diagnostics: di.map((r) => r.data as DiagnosticResultRecord),
    generated: ge.map((r) => r.data as Question),
    attempts: at.slice(-MAX_ATTEMPTS).map((r) => r.data as AttemptRecord),
    updatedAt: row.updatedAt,
  };
}

/** Apply an incremental sync in one transaction. Every write is keyed by learnerId. */
export async function applySync(db: Db, learnerId: string, p: SyncPayload): Promise<void> {
  await db.transaction(async (tx) => {
    const [exists] = await tx.select({ id: learners.id }).from(learners).where(eq(learners.id, learnerId)).limit(1);
    if (p.core) {
      const v = { profile: p.core.profile, settings: p.core.settings, daily: p.core.daily, seen: p.core.seen, updatedAt: p.core.updatedAt };
      await tx.insert(learners).values({ id: learnerId, ...v }).onConflictDoUpdate({ target: learners.id, set: v });
    } else if (!exists) {
      throw new SyncError("first sync must include core");
    }
    for (const it of p.items) {
      const v = { skill: it.skill, origin: it.origin, due: it.due, data: it };
      await tx.insert(reviewItems).values({ learnerId, id: it.id, ...v }).onConflictDoUpdate({ target: [reviewItems.learnerId, reviewItems.id], set: v });
    }
    for (const m of p.mistakes) {
      const v = { skill: m.skill, category: m.category, count: m.count, data: m };
      await tx.insert(mistakes).values({ learnerId, id: m.id, ...v }).onConflictDoUpdate({ target: [mistakes.learnerId, mistakes.id], set: v });
    }
    for (const s of p.skills) {
      const v = { status: s.status, mastery: s.mastery, data: s };
      await tx.insert(skillMastery).values({ learnerId, skill: s.skill, ...v }).onConflictDoUpdate({ target: [skillMastery.learnerId, skillMastery.skill], set: v });
    }
    for (const a of p.attempts) {
      await tx
        .insert(attempts)
        .values({
          learnerId, id: a.id, at: a.at, questionId: a.questionId, mode: a.mode, context: a.context, answer: a.answer, overall: Math.round(a.overall),
          grade: Math.round(a.grade), hint: Math.round(a.hint), responseMs: Math.round(a.responseMs), evaluator: a.evaluator, skipped: !!a.skipped,
          reviewItemId: typeof a.reviewItemId === "string" ? a.reviewItemId : null, data: a,
        })
        .onConflictDoNothing();
    }
    for (const d of p.diagnostics) {
      await tx
        .insert(diagnostics)
        .values({ learnerId, id: d.id, at: d.at, cefrLow: d.cefrLow, cefrHigh: d.cefrHigh, cefrPoint: d.cefrPoint, confidence: d.confidence, theta: d.theta, sd: d.sd, data: d })
        .onConflictDoNothing();
    }
    for (const g of p.generated) {
      await tx.insert(generatedQuestions).values({ learnerId, id: g.id, skill: g.skills[0], data: g }).onConflictDoNothing();
    }
  });
}

export async function deleteLearner(db: Db, learnerId: string): Promise<void> {
  await db.delete(learners).where(eq(learners.id, learnerId));
  await db.delete(aiEvaluations).where(eq(aiEvaluations.learnerId, learnerId));
}

export async function logAIEvaluation(
  db: Db,
  row: { learnerId: string; questionId: string; answer: string; model: string; overall: number | null; latencyMs: number; ok: boolean; error?: string; result?: unknown },
): Promise<void> {
  await db.insert(aiEvaluations).values({ id: `${row.learnerId.slice(0, 8)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, ...row, error: row.error ?? null, result: row.result ?? null });
}

export async function countRows(db: Db, learnerId: string): Promise<Record<string, number>> {
  const q = async (t: typeof attempts | typeof reviewItems | typeof mistakes) => (await db.select({ n: sql<number>`count(*)` }).from(t).where(and(eq(t.learnerId, learnerId))))[0]?.n ?? 0;
  return { attempts: Number(await q(attempts)), items: Number(await q(reviewItems)), mistakes: Number(await q(mistakes)) };
}

export class SyncError extends Error {}
