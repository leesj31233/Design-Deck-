import { QUESTION_BY_ID } from "../content";
import { SKILLS } from "../content/skills";
import { SEEDS } from "../content/seeds";
import { questionSchema } from "../core/schema";
import { validateQuestion } from "../core/validate";
import type { Question } from "../core/types";
import { learnerIdFromKey } from "./repo";

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

export function fail(status: number, code: string, error: string): Response {
  return json({ code, error }, status);
}

/** Resolve the learner from the sync-key header, or a 401 response. */
export function requireLearner(req: Request): { id: string } | Response {
  const id = learnerIdFromKey(req.headers.get("x-engflow-learner"));
  return id ? { id } : fail(401, "no_learner", "학습자 키가 없거나 올바르지 않습니다.");
}

/** Simple per-process token bucket for AI endpoints. */
const buckets = new Map<string, { tokens: number; at: number }>();
export function rateLimit(key: string, perMinute: number): boolean {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: perMinute, at: now };
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60000) * perMinute);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return true;
}

export async function readJson(req: Request, maxBytes = 2_000_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new PayloadError("요청이 너무 큽니다.");
  try {
    return JSON.parse(text);
  } catch {
    throw new PayloadError("JSON 형식이 아닙니다.");
  }
}

export class PayloadError extends Error {}

/**
 * Resolve a question sent by the client. Curated questions always use the
 * server's copy (the client cannot rewrite the prompt); generated questions
 * must pass the same QC as the curated bank.
 */
export function resolveQuestion(raw: unknown): { question: Question } | { error: string } {
  const parsed = questionSchema.safeParse(raw);
  if (!parsed.success) return { error: "문항 형식이 올바르지 않습니다." };
  const curated = QUESTION_BY_ID[parsed.data.id];
  if (curated) return { question: curated };
  const q = parsed.data as Question;
  if (JSON.stringify(q).length > 20_000) return { error: "문항이 너무 큽니다." };
  const issues = validateQuestion(q, { skillIds: new Set(SKILLS.map((s) => s.id)), seedIds: new Set(SEEDS.map((s) => s.id)) }).filter((i) => i.level === "error");
  return issues.length ? { error: `문항 검증 실패: ${issues[0].message}` } : { question: q };
}
