import { BRIEF_INSTRUCTIONS, GUIDE_VERSION, PAGES_INSTRUCTIONS, briefSchema, pagesSchema, type GuideUnit } from "@/lib/paperflow/guide/guide";
import { sourceHash } from "@/lib/paperflow/translation/prompt-version";
import { adminClient, creditGate } from "@/lib/paperflow/cloud/server";
import { creditsForUsage } from "@/lib/paperflow/cloud/plans";
import { guideCreditEstimate, GUIDE_MODEL, GUIDE_PAGE_MODEL } from "@/lib/paperflow/guide/cost";

export const maxDuration = 120;

const recent = new Map<string, number[]>();
/** A guide is a handful of calls per paper: a per-address budget well above that, well below abuse. */
function limited(request: Request) {
  const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown", now = Date.now();
  if (/^(?:127\.|::1|localhost)/.test(ip)) return false;
  const times = (recent.get(ip) ?? []).filter(time => now - time < 3_600_000);
  if (times.length >= 120) return true;
  recent.set(ip, [...times, now]);
  return false;
}

/**
 * The AI reading guide, in parts: mode "brief" reads the whole paper and writes levels 1–11; mode
 * "pages" writes the guide beside a group of pages (levels 12–13). Parts run in parallel from the
 * reader. Each part is cached for everyone under sha256(version + mode + its passages), so the
 * second reader of the same PDF gets it instantly and at no cost.
 */
export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "서버의 OpenAI 연결이 아직 설정되지 않았습니다." }, { status: 503 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "이 사이트에서만 사용할 수 있습니다." }, { status: 403 });
  let body: { units?: unknown; mode?: unknown; pages?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "잘못된 요청입니다." }, { status: 400 }); }
  const mode = body.mode === "pages" ? "pages" : "brief";
  const pages = Array.isArray(body.pages) ? body.pages.filter((page): page is number => Number.isInteger(page) && page > 0 && page < 2000).slice(0, 12) : [];
  const units = (Array.isArray(body.units) ? body.units : []).filter((unit): unit is GuideUnit => typeof unit?.id === "string" && /^u\d{1,4}$/.test(unit.id) && typeof unit.text === "string" && unit.text.trim().length > 0 && typeof unit.role === "string" && Number.isFinite(unit.page)).map(unit => ({ id: unit.id, role: unit.role.slice(0, 12), page: unit.page, text: unit.text.slice(0, 12000) }));
  const chars = units.reduce((sum, unit) => sum + unit.text.length, 0);
  if (!units.length || units.length > 1500 || chars > 140_000 || mode === "brief" && units.length < 3 || mode === "pages" && !pages.length) return Response.json({ error: "가이드를 만들 본문이 올바르지 않습니다." }, { status: 400 });

  const key = await sourceHash(`${mode}|${pages.join(",")}\n${units.map(unit => `${unit.id}:${unit.text}`).join("\n")}`, GUIDE_VERSION), admin = adminClient();
  if (admin) {
    const { data } = await admin.from("shared_translations").select("text").eq("source_hash", key).maybeSingle();
    if (data?.text) { try { return Response.json({ part: JSON.parse(data.text), cached: true, credits: 0 }); } catch { /* Regenerate a damaged entry. */ } }
  }
  const model = mode === "brief" ? GUIDE_MODEL() : GUIDE_PAGE_MODEL();
  const gate = await creditGate(guideCreditEstimate(chars, mode));
  if (gate instanceof Response) return gate;
  if (limited(request)) return Response.json({ error: "가이드 요청이 많습니다. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  // Low reasoning effort: a brief on gpt-5.1 measured ~60 s (medium took ~120 s for little gain).
  const reasoning = /^(?:gpt-5|o\d)/.test(model) ? { reasoning: { effort: "low" } } : { temperature: .2 };
  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(115_000)]),
      body: JSON.stringify({
        model, store: false, ...reasoning, prompt_cache_key: `paperflow-guide-${mode}`,
        instructions: mode === "brief" ? BRIEF_INSTRUCTIONS : PAGES_INSTRUCTIONS,
        input: JSON.stringify(mode === "brief" ? { passages: units } : { pages, passages: units }),
        text: mode === "brief" ? briefSchema(units.map(unit => unit.id)) : pagesSchema(units.map(unit => unit.id)),
        max_output_tokens: mode === "brief" ? 16000 : 12000
      })
    });
    if (!upstream.ok) {
      const detail = await upstream.json().catch(() => null) as { error?: { code?: string } } | null;
      return Response.json({ error: upstream.status === 429 ? (detail?.error?.code === "insufficient_quota" ? "OpenAI 크레딧이 부족합니다. 관리자에게 문의해 주세요." : "OpenAI 사용량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.") : "가이드를 만들지 못했습니다." }, { status: upstream.status === 429 ? 429 : 502 });
    }
    const data = await upstream.json();
    const text = (data.output ?? []).flatMap((item: { content?: { type: string; text?: string }[] }) => item.content ?? []).filter((item: { type: string }) => item.type === "output_text").map((item: { text?: string }) => item.text ?? "").join("");
    const usage = { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0, cached: data.usage?.input_tokens_details?.cached_tokens ?? 0, model: typeof data.model === "string" ? data.model : undefined };
    const credits = creditsForUsage(usage.model ?? model, usage);
    let part: unknown;
    try { part = JSON.parse(text); } catch { await gate.charge(credits); return Response.json({ error: data.status === "incomplete" ? "가이드가 너무 길어 끝맺지 못했습니다. 다시 시도해 주세요." : "가이드 응답을 읽지 못했습니다. 다시 시도해 주세요." }, { status: 502 }); }
    if (admin) { try { await admin.from("shared_translations").upsert({ source_hash: key, prompt_version: GUIDE_VERSION, text: JSON.stringify(part) }, { onConflict: "source_hash" }); } catch { /* The cache is optional. */ } }
    await gate.charge(credits);
    return Response.json({ part, usage, credits, model: usage.model ?? model });
  } catch { return Response.json({ error: "연결 시간이 초과되었거나 요청이 취소되었습니다." }, { status: 504 }); }
}
