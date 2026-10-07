import { creditGate } from "@/lib/paperflow/cloud/server";
import { creditsForUsage } from "@/lib/paperflow/cloud/plans";
import { ASK_INSTRUCTIONS, ASK_MODEL, askCreditEstimate, askSchema, validateAnswer, type AskPassage } from "@/lib/paperflow/ask/ask";

export const maxDuration = 90;

const recent = new Map<string, number[]>();
function limited(request: Request) {
  const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown", now = Date.now();
  if (/^(?:127\.|::1|localhost)/.test(ip)) return false;
  const times = (recent.get(ip) ?? []).filter(time => now - time < 3_600_000);
  if (times.length >= 200) return true;
  recent.set(ip, [...times, now]);
  return false;
}

/** 질문: one question about the paper, answered from the passages the reader picked, with exact sentences as evidence. */
export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "서버의 OpenAI 연결이 아직 설정되지 않았습니다." }, { status: 503 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "이 사이트에서만 사용할 수 있습니다." }, { status: 403 });
  let body: { question?: unknown; passages?: unknown; overview?: unknown; history?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "잘못된 요청입니다." }, { status: 400 }); }
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 500) : "";
  const passages: AskPassage[] = (Array.isArray(body.passages) ? body.passages : []).filter((item): item is AskPassage => typeof item?.id === "string" && /^p\d{1,4}$/.test(item.id) && typeof item.text === "string" && Number.isFinite(item.page)).slice(0, 14).map(item => ({ id: item.id, page: item.page, text: item.text.slice(0, 1500) }));
  const overview = typeof body.overview === "string" ? body.overview.slice(0, 1200) : "";
  const history = (Array.isArray(body.history) ? body.history : []).filter((item): item is { q: string; a: string } => typeof item?.q === "string" && typeof item?.a === "string").slice(-2).map(item => ({ q: item.q.slice(0, 300), a: item.a.slice(0, 600) }));
  if (question.length < 2 || !passages.length) return Response.json({ error: "질문이나 본문이 비어 있습니다." }, { status: 400 });
  const chars = passages.reduce((sum, passage) => sum + passage.text.length, 0);
  const gate = await creditGate(askCreditEstimate(chars));
  if (gate instanceof Response) return gate;
  if (limited(request)) return Response.json({ error: "질문이 많습니다. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  const model = ASK_MODEL();
  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(85_000)]),
      body: JSON.stringify({
        model, store: false, prompt_cache_key: "paperflow-ask",
        ...(/^(?:gpt-5|o\d)/.test(model) ? { reasoning: { effort: "minimal" } } : { temperature: .2 }),
        instructions: ASK_INSTRUCTIONS,
        input: JSON.stringify({ question, overview, earlier: history, passages }),
        text: askSchema(passages.map(passage => passage.id)),
        max_output_tokens: 1600
      })
    });
    if (!upstream.ok) {
      const detail = await upstream.json().catch(() => null) as { error?: { code?: string } } | null;
      return Response.json({ error: upstream.status === 429 ? (detail?.error?.code === "insufficient_quota" ? "OpenAI 크레딧이 부족합니다. 관리자에게 문의해 주세요." : "OpenAI 사용량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.") : "답변을 만들지 못했습니다." }, { status: upstream.status === 429 ? 429 : 502 });
    }
    const data = await upstream.json();
    const text = (data.output ?? []).flatMap((item: { content?: { type: string; text?: string }[] }) => item.content ?? []).filter((item: { type: string }) => item.type === "output_text").map((item: { text?: string }) => item.text ?? "").join("");
    const usage = { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0, cached: data.usage?.input_tokens_details?.cached_tokens ?? 0 };
    const credits = creditsForUsage(typeof data.model === "string" ? data.model : model, usage);
    await gate.charge(credits);
    let answer: ReturnType<typeof validateAnswer> = null;
    try { answer = validateAnswer(JSON.parse(text), passages); } catch { /* reported below */ }
    if (!answer) return Response.json({ error: "답변을 읽지 못했습니다. 다시 질문해 주세요.", credits }, { status: 502 });
    return Response.json({ ...answer, credits, model: typeof data.model === "string" ? data.model : model });
  } catch { return Response.json({ error: "연결 시간이 초과되었거나 요청이 취소되었습니다." }, { status: 504 }); }
}
