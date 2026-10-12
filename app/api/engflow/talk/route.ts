import { z } from "zod";
import { TALK_TOPIC_BY_ID, TALK_TURNS } from "@/engflow/core/freetalk";
import { aiAvailable, describeAIError, talkWithClaude } from "@/engflow/server/claude";
import { fail, json, PayloadError, rateLimit, readJson, requireLearner } from "@/engflow/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const body = z.object({
  topicId: z.string().refine((id) => !!TALK_TOPIC_BY_ID[id], "unknown topic"),
  lines: z
    .array(z.object({ who: z.enum(["partner", "me"]), en: z.string().min(1).max(1000) }))
    .min(2)
    .max(TALK_TURNS * 2 + 4),
  turn: z.number().int().min(1).max(TALK_TURNS + 2),
});

/** Free talk: grade the learner's latest line and reply as the partner. */
export async function POST(req: Request) {
  const who = requireLearner(req);
  if (who instanceof Response) return who;
  if (!aiAvailable()) return fail(503, "ai_not_configured", "서버에 AI 키가 설정되지 않았습니다.");
  if (!rateLimit(`talk:${who.id}`, 30)) return fail(429, "rate_limited", "대화 요청이 많습니다. 잠시 후 다시 시도하세요.");
  let parsed;
  try {
    parsed = body.safeParse(await readJson(req, 30_000));
  } catch (e) {
    return fail(400, "invalid_payload", e instanceof PayloadError ? e.message : "잘못된 요청입니다.");
  }
  if (!parsed.success) return fail(400, "invalid_payload", "요청 형식이 올바르지 않습니다.");
  try {
    return json({ reply: await talkWithClaude(parsed.data.topicId, parsed.data.lines, parsed.data.turn, req.signal) });
  } catch (e) {
    const d = describeAIError(e);
    return fail(d.status, d.code, d.message);
  }
}
