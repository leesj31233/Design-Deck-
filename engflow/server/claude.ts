import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  AIFormatError, buildEvaluationPrompt, buildExplainPrompt, buildGenerationPrompt, buildRepairPrompt, normalizeAIEvaluation,
  parseGeneratedQuestion, type ExplainKind, type GenerateRequest,
} from "../core/ai";
import { aiEvaluationSchema } from "../core/schema";
import type { Evaluation, Question } from "../core/types";
import { QUESTIONS } from "../content";
import { SKILLS, skillName } from "../content/skills";

/**
 * Server-side Claude access. The API key never leaves the server. Model and
 * effort are configurable; refusals fall back server-side ("fallbacks").
 */

const MODEL = process.env.ENGFLOW_MODEL || "claude-opus-5-5";
/**
 * Answer grading runs once per submit and the learner waits for it, so it uses a
 * fast model by default (ENGFLOW_EVAL_MODEL). Explanations and question
 * generation keep the main model.
 */
const EVAL_MODEL = process.env.ENGFLOW_EVAL_MODEL || "claude-haiku-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;

export function aiAvailable(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function aiModel(): string {
  return MODEL;
}

export function evalModel(): string {
  return EVAL_MODEL;
}

function getClient(): Anthropic {
  if (!client) client = new Anthropic({ timeout: 90_000, maxRetries: 2 });
  return client;
}

function effortFor(depth: "quick" | "default"): "low" | "medium" {
  return depth === "quick" ? "low" : "medium";
}

export class AIRefusalError extends Error {}

/** Structured, grammar-focused grading in one fast pass; one repair attempt if the output fails our schema. */
export async function evaluateWithClaude(q: Question, answer: string, local: Evaluation, depth: "quick" | "default", signal?: AbortSignal): Promise<Evaluation> {
  const prompt = buildEvaluationPrompt(q, answer, local);
  const model = depth === "quick" ? EVAL_MODEL : MODEL;
  const run = async (content: string) => {
    const msg = await getClient().beta.messages.parse(
      {
        model,
        max_tokens: 2000,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        // Effort is tuned for the main model only; the fast grading model runs at its default.
        output_config: model === MODEL ? { effort: effortFor(depth), format: betaZodOutputFormat(aiEvaluationSchema) } : { format: betaZodOutputFormat(aiEvaluationSchema) },
        messages: [{ role: "user", content }],
      },
      { signal, timeout: 20_000, maxRetries: 0 },
    );
    if (msg.stop_reason === "refusal") throw new AIRefusalError("Claude declined this evaluation.");
    return msg.parsed_output;
  };
  const first = await run(prompt);
  try {
    return normalizeAIEvaluation(first, q, answer, local);
  } catch (e) {
    if (!(e instanceof AIFormatError)) throw e;
    const second = await run(`${prompt}\n\nYour previous reply did not match the required JSON shape (${e.message}). Reply again with only the JSON object.`);
    return normalizeAIEvaluation(second, q, answer, local);
  }
}

/** Streams a plain-text Korean explanation. */
export function explainWithClaude(kind: ExplainKind, q: Question, ev: Evaluation, ask: string | undefined, signal?: AbortSignal): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        const stream = getClient().beta.messages.stream(
          {
            model: MODEL,
            max_tokens: 2000,
            betas: [FALLBACK_BETA],
            fallbacks: "default",
            output_config: { effort: "low" },
            messages: [{ role: "user", content: buildExplainPrompt(kind, q, ev, ask) }],
          },
          { signal },
        );
        stream.on("text", (delta) => controller.enqueue(enc.encode(delta)));
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") controller.enqueue(enc.encode("\n(Claude가 이 질문에는 답하지 않았습니다.)"));
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });
}

function extractJson(text: string): unknown {
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fence ? fence[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(body);
}

/** Generate a question, validate it with the same QC as the curated bank, repair once. */
export async function generateWithClaude(req: GenerateRequest, signal?: AbortSignal): Promise<Question> {
  const example = QUESTIONS.find((q) => q.mode === req.mode && q.skills[0] !== req.skill) ?? QUESTIONS[0];
  const { probes: _p, source: _s, ...clean } = example;
  const ctx = { skillIds: new Set(SKILLS.map((s) => s.id)) };
  const ask = async (content: string) => {
    const msg = await getClient().beta.messages.create(
      { model: MODEL, max_tokens: 8000, betas: [FALLBACK_BETA], fallbacks: "default", output_config: { effort: "medium" }, messages: [{ role: "user", content }] },
      { signal },
    );
    if (msg.stop_reason === "refusal") throw new AIRefusalError("Claude declined to generate this question.");
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return extractJson(text);
  };
  const raw = await ask(buildGenerationPrompt(req, skillName(req.skill), clean as Question));
  let r = parseGeneratedQuestion(raw, ctx);
  if (!r.question) r = parseGeneratedQuestion(await ask(buildRepairPrompt(raw, r.problems)), ctx);
  if (!r.question) throw new AIFormatError(`generated question failed validation: ${r.problems.slice(0, 3).join("; ")}`);
  return r.question;
}

export function describeAIError(e: unknown): { status: number; code: string; message: string } {
  if (e instanceof AIRefusalError) return { status: 422, code: "refused", message: "Claude가 이 요청에 답하지 않았습니다." };
  if (e instanceof AIFormatError) return { status: 502, code: "invalid_output", message: "Claude 응답이 형식 검증을 통과하지 못했습니다." };
  if (e instanceof Anthropic.RateLimitError) return { status: 429, code: "rate_limited", message: "AI 요청이 많습니다. 잠시 후 다시 시도하세요." };
  if (e instanceof Anthropic.AuthenticationError) return { status: 503, code: "ai_not_configured", message: "서버의 AI 키가 올바르지 않습니다." };
  if (e instanceof Anthropic.APIConnectionTimeoutError) return { status: 504, code: "timeout", message: "AI 응답 시간이 초과되었습니다." };
  if (e instanceof Anthropic.APIError) return { status: 502, code: "upstream_error", message: `AI 서비스 오류 (${e.status ?? "?"}).` };
  if ((e as Error)?.name === "AbortError") return { status: 499, code: "cancelled", message: "취소했습니다." };
  return { status: 500, code: "internal", message: "AI 처리 중 오류가 발생했습니다." };
}
