import { z } from "zod";
import { aiAvailable, explainWithClaude } from "@/engflow/server/claude";
import { fail, PayloadError, rateLimit, readJson, requireLearner, resolveQuestion } from "@/engflow/server/http";
import type { Evaluation } from "@/engflow/core/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const body = z.object({
  kind: z.enum(["why", "simpler", "example", "compare", "ask"]),
  question: z.unknown(),
  evaluation: z.object({ answer: z.string().max(2000), corrected: z.string().max(2000), errors: z.array(z.object({ text: z.string().max(400), fix: z.string().max(400), category: z.string() })).max(20) }).passthrough(),
  ask: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const who = requireLearner(req);
  if (who instanceof Response) return who;
  if (!aiAvailable()) return fail(503, "ai_not_configured", "서버에 AI 키가 설정되지 않았습니다.");
  if (!rateLimit(`explain:${who.id}`, 20)) return fail(429, "rate_limited", "요청이 많습니다. 잠시 후 다시 시도하세요.");
  let parsed;
  try {
    parsed = body.safeParse(await readJson(req, 200_000));
  } catch (e) {
    return fail(400, "invalid_payload", e instanceof PayloadError ? e.message : "잘못된 요청입니다.");
  }
  if (!parsed.success) return fail(400, "invalid_payload", "요청 형식이 올바르지 않습니다.");
  const r = resolveQuestion(parsed.data.question);
  if ("error" in r) return fail(400, "invalid_question", r.error);
  const stream = explainWithClaude(parsed.data.kind, r.question, parsed.data.evaluation as unknown as Evaluation, parsed.data.ask, req.signal);
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
