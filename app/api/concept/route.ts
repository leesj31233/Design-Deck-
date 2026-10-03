import { CONCEPT_INSTRUCTIONS, CONCEPT_VERSION, conceptSchema, validateConcept } from "@/lib/paperflow/concept/concept";
import { sourceHash } from "@/lib/paperflow/translation/prompt-version";
import { adminClient } from "@/lib/paperflow/cloud/server";

export const maxDuration = 60;

const recent = new Map<string, number[]>();
function limited(request: Request) {
  const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown", now = Date.now();
  const times = (recent.get(ip) ?? []).filter(time => now - time < 3_600_000);
  if (times.length >= 120) return true;
  recent.set(ip, [...times, now]);
  return false;
}

/**
 * Concept explanation for "선택 개념 공부". Cached for everyone under sha256(version + term + passage),
 * so the same term in the same paragraph is explained once.
 */
export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "서버의 OpenAI 연결이 아직 설정되지 않았다." }, { status: 503 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "이 사이트에서만 사용할 수 있다." }, { status: 403 });
  let body: { term?: unknown; passage?: unknown; neighbors?: unknown; paper?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "잘못된 요청이다." }, { status: 400 }); }
  const term = typeof body.term === "string" ? body.term.trim().slice(0, 120) : "";
  const passage = typeof body.passage === "string" ? body.passage.trim().slice(0, 6000) : "";
  const neighbors = (Array.isArray(body.neighbors) ? body.neighbors : []).filter((item): item is string => typeof item === "string").map(item => item.slice(0, 3000)).slice(0, 2);
  const paper = typeof body.paper === "string" ? body.paper.slice(0, 300) : "";
  if (!term || passage.length < 20) return Response.json({ error: "공부할 용어와 문단이 필요하다." }, { status: 400 });

  const key = await sourceHash(`${term.toLowerCase()}\n${passage}`, CONCEPT_VERSION), admin = adminClient(), context = [passage, ...neighbors].join("\n");
  if (admin) {
    const { data } = await admin.from("shared_translations").select("text").eq("source_hash", key).maybeSingle();
    if (data?.text) { try { const cached = validateConcept(JSON.parse(data.text), context); if (cached) return Response.json({ concept: cached, cached: true }); } catch { /* Regenerate a damaged entry. */ } }
  }
  if (limited(request)) return Response.json({ error: "개념 설명 요청이 많다. 잠시 후 다시 시도해 달라." }, { status: 429 });
  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]),
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4.1-mini", store: false, instructions: CONCEPT_INSTRUCTIONS, prompt_cache_key: "paperflow-concept", input: JSON.stringify({ paper, passage, neighbors, term }), text: conceptSchema(), max_output_tokens: 1200 })
    });
    if (!upstream.ok) return Response.json({ error: upstream.status === 429 ? "OpenAI 사용량 한도에 도달했다. 잠시 후 다시 시도해 달라." : "개념 설명을 만들지 못했다." }, { status: upstream.status === 429 ? 429 : 502 });
    const data = await upstream.json();
    const text = (data.output ?? []).flatMap((item: { content?: { type: string; text?: string }[] }) => item.content ?? []).filter((item: { type: string }) => item.type === "output_text").map((item: { text?: string }) => item.text ?? "").join("");
    let concept = null;
    try { concept = validateConcept(JSON.parse(text), context); } catch { /* Reported below. */ }
    if (!concept) return Response.json({ error: "설명 응답을 읽지 못했다. 다시 시도해 달라." }, { status: 502 });
    const usage = { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0, cached: data.usage?.input_tokens_details?.cached_tokens ?? 0, model: typeof data.model === "string" ? data.model : undefined };
    if (admin) { try { await admin.from("shared_translations").upsert({ source_hash: key, prompt_version: CONCEPT_VERSION, text: JSON.stringify(concept) }, { onConflict: "source_hash" }); } catch { /* The cache is optional. */ } }
    return Response.json({ concept, usage });
  } catch { return Response.json({ error: "연결 시간이 초과되었거나 요청이 취소되었다." }, { status: 504 }); }
}
