import { adminClient, creditGate } from "@/lib/paperflow/cloud/server";
import { creditsForUsage } from "@/lib/paperflow/cloud/plans";
import { sourceHash } from "@/lib/paperflow/translation/prompt-version";
import { foreignOrigin } from "@/lib/paperflow/scholar/server";
import { BRIEF_INSTRUCTIONS, DISCOVER_MODEL, DISCOVER_VERSION, briefSchema, validateBriefs, type PaperBrief } from "@/lib/paperflow/scholar/discover-ai";

export const maxDuration = 60;

/**
 * Korean titles and one-line descriptions for recommended papers. Each paper's brief is cached for
 * everyone (by OpenAlex id), so only papers nobody has opened before cost anything (~0.5 credit each).
 */
export async function POST(request: Request) {
  if (foreignOrigin(request)) return Response.json({ error: "이 사이트에서만 사용할 수 있습니다." }, { status: 403 });
  if (!process.env.OPENAI_API_KEY) return Response.json({ briefs: [] });
  let body: { items?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "잘못된 요청입니다." }, { status: 400 }); }
  const items = (Array.isArray(body.items) ? body.items : []).filter((item): item is { id: string; title: string; abstract?: string } => typeof item?.id === "string" && /^W\d{3,14}$/.test(item.id) && typeof item.title === "string").slice(0, 16)
    .map(item => ({ id: item.id, title: item.title.slice(0, 300), abstract: typeof item.abstract === "string" ? item.abstract.slice(0, 500) : "" }));
  if (!items.length) return Response.json({ briefs: [] });

  const admin = adminClient(), keyOf = (id: string) => sourceHash(`brief|${id}`, DISCOVER_VERSION);
  const keys = new Map(await Promise.all(items.map(async item => [item.id, await keyOf(item.id)] as const)));
  const cached: PaperBrief[] = [];
  if (admin) {
    const { data } = await admin.from("shared_translations").select("source_hash,text").in("source_hash", [...keys.values()]);
    const byKey = new Map((data ?? []).map(row => [row.source_hash as string, row.text as string]));
    for (const item of items) { const text = byKey.get(keys.get(item.id)!); if (text) { try { cached.push(JSON.parse(text)); } catch { /* regenerated below */ } } }
  }
  const missing = items.filter(item => !cached.some(brief => brief.id === item.id));
  if (!missing.length) return Response.json({ briefs: cached, credits: 0 });

  const model = DISCOVER_MODEL();
  const gate = await creditGate(Math.max(1, Math.ceil(missing.length / 2)));
  if (gate instanceof Response) return Response.json({ briefs: cached, error: "크레딧이 부족해 한국어 소개를 만들지 못했습니다." });
  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(50_000)]),
      body: JSON.stringify({ model, store: false, reasoning: { effort: "minimal" }, prompt_cache_key: "paperflow-paper-brief", instructions: BRIEF_INSTRUCTIONS, input: JSON.stringify(missing), text: briefSchema(missing.map(item => item.id)), max_output_tokens: 3000 })
    });
    if (!upstream.ok) return Response.json({ briefs: cached });
    const data = await upstream.json();
    const text = (data.output ?? []).flatMap((item: { content?: { type: string; text?: string }[] }) => item.content ?? []).filter((item: { type: string }) => item.type === "output_text").map((item: { text?: string }) => item.text ?? "").join("");
    const credits = creditsForUsage(typeof data.model === "string" ? data.model : model, { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0, cached: data.usage?.input_tokens_details?.cached_tokens ?? 0 });
    await gate.charge(credits);
    let fresh: PaperBrief[] = [];
    try { fresh = validateBriefs(JSON.parse(text), missing.map(item => item.id)); } catch { /* none this time */ }
    if (admin && fresh.length) { try { await admin.from("shared_translations").upsert(fresh.map(brief => ({ source_hash: keys.get(brief.id)!, prompt_version: DISCOVER_VERSION, text: JSON.stringify(brief) })), { onConflict: "source_hash" }); } catch { /* cache optional */ } }
    return Response.json({ briefs: [...cached, ...fresh], credits });
  } catch { return Response.json({ briefs: cached }); }
}
