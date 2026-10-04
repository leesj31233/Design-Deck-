import { GUIDE_INSTRUCTIONS, GUIDE_VERSION, guideSchema, type GuideUnit } from "@/lib/paperflow/guide/guide";
import { sourceHash } from "@/lib/paperflow/translation/prompt-version";
import { adminClient } from "@/lib/paperflow/cloud/server";

export const maxDuration = 120;

const recent = new Map<string, number[]>();
/** Guides read a whole paper: a tighter per-address budget than paragraph translation. */
function limited(request: Request) {
  const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown", now = Date.now();
  const times = (recent.get(ip) ?? []).filter(time => now - time < 3_600_000);
  if (times.length >= 30) return true;
  recent.set(ip, [...times, now]);
  return false;
}

/**
 * One study guide per paper. Cached for everyone under sha256(guide version + the paper's text),
 * so the second reader of the same PDF gets it instantly and at no cost.
 */
export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "서버의 OpenAI 연결이 아직 설정되지 않았습니다." }, { status: 503 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "이 사이트에서만 사용할 수 있습니다." }, { status: 403 });
  let body: { units?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "잘못된 요청입니다." }, { status: 400 }); }
  const units = (Array.isArray(body.units) ? body.units : []).filter((unit): unit is GuideUnit => typeof unit?.id === "string" && /^u\d{1,4}$/.test(unit.id) && typeof unit.text === "string" && unit.text.trim().length > 0 && typeof unit.role === "string" && Number.isFinite(unit.page)).map(unit => ({ id: unit.id, role: unit.role.slice(0, 12), page: unit.page, text: unit.text.slice(0, 12000) }));
  const chars = units.reduce((sum, unit) => sum + unit.text.length, 0);
  if (units.length < 3 || units.length > 1500 || chars > 140_000) return Response.json({ error: "가이드를 만들 본문이 올바르지 않습니다." }, { status: 400 });

  const key = await sourceHash(units.map(unit => unit.text).join("\n"), GUIDE_VERSION), admin = adminClient();
  if (admin) {
    const { data } = await admin.from("shared_translations").select("text").eq("source_hash", key).maybeSingle();
    if (data?.text) { try { return Response.json({ guide: JSON.parse(data.text), cached: true }); } catch { /* Regenerate a damaged entry. */ } }
  }
  if (limited(request)) return Response.json({ error: "가이드 요청이 많습니다. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(110_000)]),
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4.1-mini", store: false, instructions: GUIDE_INSTRUCTIONS, prompt_cache_key: "paperflow-guide", input: JSON.stringify({ passages: units }), text: guideSchema(units.map(unit => unit.id)), max_output_tokens: 5000 })
    });
    if (!upstream.ok) return Response.json({ error: upstream.status === 429 ? "OpenAI 사용량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요." : "가이드를 만들지 못했습니다." }, { status: upstream.status === 429 ? 429 : 502 });
    const data = await upstream.json();
    const text = (data.output ?? []).flatMap((item: { content?: { type: string; text?: string }[] }) => item.content ?? []).filter((item: { type: string }) => item.type === "output_text").map((item: { text?: string }) => item.text ?? "").join("");
    let guide: unknown;
    try { guide = JSON.parse(text); } catch { return Response.json({ error: "가이드 응답을 읽지 못했습니다. 다시 시도해 주세요." }, { status: 502 }); }
    const usage = { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0, cached: data.usage?.input_tokens_details?.cached_tokens ?? 0, model: typeof data.model === "string" ? data.model : undefined };
    if (admin) { try { await admin.from("shared_translations").upsert({ source_hash: key, prompt_version: GUIDE_VERSION, text: JSON.stringify(guide) }, { onConflict: "source_hash" }); } catch { /* The cache is optional. */ } }
    return Response.json({ guide, usage });
  } catch { return Response.json({ error: "연결 시간이 초과되었거나 요청이 취소되었습니다." }, { status: 504 }); }
}
