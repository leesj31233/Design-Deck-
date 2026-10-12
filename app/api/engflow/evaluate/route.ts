import { z } from "zod";
import { evaluateLocal } from "@/engflow/core/evaluate";
import { aiAvailable, aiModel, describeAIError, evaluateWithClaude } from "@/engflow/server/claude";
import { getDb } from "@/engflow/server/db/client";
import { fail, json, PayloadError, rateLimit, readJson, requireLearner, resolveQuestion } from "@/engflow/server/http";
import { logAIEvaluation } from "@/engflow/server/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const body = z.object({ question: z.unknown(), answer: z.string().min(1).max(2000), depth: z.enum(["quick", "default"]).default("default") });

export async function POST(req: Request) {
  const who = requireLearner(req);
  if (who instanceof Response) return who;
  if (!aiAvailable()) return fail(503, "ai_not_configured", "서버에 AI 키가 설정되지 않았습니다.");
  if (!rateLimit(`eval:${who.id}`, 30)) return fail(429, "rate_limited", "AI 평가 요청이 많습니다. 잠시 후 다시 시도하세요.");
  let parsed;
  try {
    parsed = body.safeParse(await readJson(req, 100_000));
  } catch (e) {
    return fail(400, "invalid_payload", e instanceof PayloadError ? e.message : "잘못된 요청입니다.");
  }
  if (!parsed.success) return fail(400, "invalid_payload", "요청 형식이 올바르지 않습니다.");
  const r = resolveQuestion(parsed.data.question);
  if ("error" in r) return fail(400, "invalid_question", r.error);
  const local = evaluateLocal(r.question, parsed.data.answer);
  const started = Date.now();
  const db = await getDb();
  try {
    const evaluation = await evaluateWithClaude(r.question, parsed.data.answer, local, parsed.data.depth, req.signal);
    if (db) await logAIEvaluation(db.db, { learnerId: who.id, questionId: r.question.id, answer: parsed.data.answer, model: aiModel(), overall: evaluation.scores.overall, latencyMs: Date.now() - started, ok: true, result: evaluation }).catch(() => undefined);
    return json({ evaluation });
  } catch (e) {
    const d = describeAIError(e);
    if (db) await logAIEvaluation(db.db, { learnerId: who.id, questionId: r.question.id, answer: parsed.data.answer, model: aiModel(), overall: null, latencyMs: Date.now() - started, ok: false, error: d.code }).catch(() => undefined);
    return fail(d.status, d.code, d.message);
  }
}
