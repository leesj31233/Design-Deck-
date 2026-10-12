import { z } from "zod";
import { categorySchema, cefrSchema, situationSchema } from "@/engflow/core/schema";
import { SKILL_BY_ID } from "@/engflow/content/skills";
import { aiAvailable, describeAIError, generateWithClaude } from "@/engflow/server/claude";
import { fail, json, PayloadError, rateLimit, readJson, requireLearner } from "@/engflow/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const body = z.object({
  category: categorySchema,
  skill: z.string().refine((s) => !!SKILL_BY_ID[s], "unknown skill"),
  level: cefrSchema,
  mode: z.enum(["sentence", "phrase"]),
  avoidReferences: z.array(z.string().max(400)).max(40).default([]),
  situation: situationSchema.optional(),
  difficulty: z.number().int().min(1).max(10).optional(),
  weakness: z
    .object({
      labelKo: z.string().max(120),
      examples: z.array(z.object({ wrong: z.string().max(400), right: z.string().max(400) })).max(5),
    })
    .optional(),
});

export async function POST(req: Request) {
  const who = requireLearner(req);
  if (who instanceof Response) return who;
  if (!aiAvailable()) return fail(503, "ai_not_configured", "서버에 AI 키가 설정되지 않았습니다.");
  if (!rateLimit(`gen:${who.id}`, 6)) return fail(429, "rate_limited", "문제 생성 요청이 많습니다. 잠시 후 다시 시도하세요.");
  let parsed;
  try {
    parsed = body.safeParse(await readJson(req, 50_000));
  } catch (e) {
    return fail(400, "invalid_payload", e instanceof PayloadError ? e.message : "잘못된 요청입니다.");
  }
  if (!parsed.success) return fail(400, "invalid_payload", "요청 형식이 올바르지 않습니다.");
  try {
    return json({ question: await generateWithClaude(parsed.data, req.signal) });
  } catch (e) {
    const d = describeAIError(e);
    return fail(d.status, d.code, d.message);
  }
}
