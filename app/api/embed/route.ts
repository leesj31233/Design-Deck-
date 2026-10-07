import { creditGate } from "@/lib/paperflow/cloud/server";
import { creditsForUsage } from "@/lib/paperflow/cloud/plans";
import { EMBED_DIMENSIONS, EMBED_MODEL } from "@/lib/paperflow/ask/ask";

export const maxDuration = 60;

const recent = new Map<string, number[]>();
function limited(request: Request) {
  const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown", now = Date.now();
  if (/^(?:127\.|::1|localhost)/.test(ip)) return false;
  const times = (recent.get(ip) ?? []).filter(time => now - time < 3_600_000);
  if (times.length >= 300) return true;
  recent.set(ip, [...times, now]);
  return false;
}

/**
 * Embeddings for 질문: a paper's passages once (charged, about 1–3 credits a paper), or one question
 * (a few dozen tokens, not charged). Vectors are 256-dimensional and rounded to keep them small.
 */
export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "서버의 OpenAI 연결이 아직 설정되지 않았습니다." }, { status: 503 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "이 사이트에서만 사용할 수 있습니다." }, { status: 403 });
  let body: { texts?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "잘못된 요청입니다." }, { status: 400 }); }
  const texts = (Array.isArray(body.texts) ? body.texts : []).filter((text): text is string => typeof text === "string" && text.trim().length > 0).map(text => text.slice(0, 4000));
  const chars = texts.reduce((sum, text) => sum + text.length, 0);
  if (!texts.length || texts.length > 600 || chars > 240_000) return Response.json({ error: "질문할 본문이 올바르지 않습니다." }, { status: 400 });
  const paper = texts.length > 1;
  const gate = await creditGate(paper ? creditsForUsage(EMBED_MODEL, { input: Math.ceil(chars / 3.6), output: 0 }) : 0);
  if (gate instanceof Response) return gate;
  if (limited(request)) return Response.json({ error: "요청이 많습니다. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  try {
    const upstream = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(55_000)]),
      body: JSON.stringify({ model: EMBED_MODEL, input: texts, dimensions: EMBED_DIMENSIONS })
    });
    if (!upstream.ok) return Response.json({ error: upstream.status === 429 ? "OpenAI 사용량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요." : "본문을 색인하지 못했습니다." }, { status: upstream.status === 429 ? 429 : 502 });
    const data = await upstream.json() as { data?: { index: number; embedding: number[] }[]; usage?: { prompt_tokens?: number } };
    const vectors = (data.data ?? []).sort((a, b) => a.index - b.index).map(item => item.embedding.map(value => Math.round(value * 1e4) / 1e4));
    const credits = paper ? creditsForUsage(EMBED_MODEL, { input: data.usage?.prompt_tokens ?? Math.ceil(chars / 3.6), output: 0 }) : 0;
    await gate.charge(credits);
    return Response.json({ vectors, credits });
  } catch { return Response.json({ error: "연결 시간이 초과되었거나 요청이 취소되었습니다." }, { status: 504 }); }
}
