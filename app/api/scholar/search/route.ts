import { creditGate } from "@/lib/paperflow/cloud/server";
import { creditsForUsage } from "@/lib/paperflow/cloud/plans";
import { normalizeWork } from "@/lib/paperflow/scholar/openalex";
import { foreignOrigin, openAlex } from "@/lib/paperflow/scholar/server";
import { DISCOVER_MODEL, PLAN_INSTRUCTIONS, planParams, planSchema, validatePlan } from "@/lib/paperflow/scholar/discover-ai";

export const maxDuration = 60;
const FIELDS = "id,title,display_name,doi,publication_year,type,cited_by_count,open_access,authorships,primary_location,topics,keywords,abstract_inverted_index";

function abstractOf(index: Record<string, number[]> | null | undefined) {
  if (!index) return undefined;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) for (const position of positions) words[position] = word;
  const text = words.filter(Boolean).join(" ");
  return text.length > 420 ? `${text.slice(0, 420).replace(/\s\S*$/, "")}…` : text;
}

/**
 * AI search for 추천 논문: the request in plain words → a search plan (small model, about 1 credit)
 * → OpenAlex works, excluding papers already in the library.
 */
export async function POST(request: Request) {
  if (foreignOrigin(request)) return Response.json({ error: "이 사이트에서만 사용할 수 있습니다." }, { status: 403 });
  let body: { query?: unknown; owned?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "잘못된 요청입니다." }, { status: 400 }); }
  const query = typeof body.query === "string" ? body.query.trim().slice(0, 300) : "";
  const owned = new Set((Array.isArray(body.owned) ? body.owned : []).filter((id): id is string => typeof id === "string"));
  if (query.length < 2) return Response.json({ error: "찾고 싶은 논문을 적어 주세요." }, { status: 400 });

  let plan = validatePlan(null, query), credits = 0;
  // Plain English keywords need no model; anything else is turned into a plan.
  const needsPlan = /[^\x00-\x7F]/.test(query) || query.split(/\s+/).length > 6;
  if (needsPlan && process.env.OPENAI_API_KEY) {
    const gate = await creditGate(2);
    if (gate instanceof Response) return gate;
    try {
      const model = DISCOVER_MODEL();
      const upstream = await fetch("https://api.openai.com/v1/responses", {
        method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
        body: JSON.stringify({ model, store: false, reasoning: { effort: "minimal" }, prompt_cache_key: "paperflow-search-plan", instructions: PLAN_INSTRUCTIONS, input: query, text: planSchema, max_output_tokens: 600 })
      });
      if (upstream.ok) {
        const data = await upstream.json();
        const text = (data.output ?? []).flatMap((item: { content?: { type: string; text?: string }[] }) => item.content ?? []).filter((item: { type: string }) => item.type === "output_text").map((item: { text?: string }) => item.text ?? "").join("");
        credits = creditsForUsage(typeof data.model === "string" ? data.model : model, { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0, cached: data.usage?.input_tokens_details?.cached_tokens ?? 0 });
        await gate.charge(credits);
        try { plan = validatePlan(JSON.parse(text), query); } catch { /* the request itself is the search */ }
      }
    } catch { /* the request itself is the search */ }
  }
  const data = await openAlex<{ results?: unknown[]; meta?: { count?: number } }>("works", { ...planParams(plan), select: FIELDS });
  if (!data) return Response.json({ error: "논문 검색 서비스(OpenAlex)에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  /* eslint-disable @typescript-eslint/no-explicit-any -- OpenAlex JSON */
  const items = (data.results ?? []).flatMap((raw: any) => {
    const work = normalizeWork(raw);
    if (!work.title || owned.has(work.openalexId)) return [];
    return [{ ...work, abstract: abstractOf(raw.abstract_inverted_index), why: raw.topics?.[0]?.display_name ? `검색 · ${raw.topics[0].display_name}` : "검색" }];
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return Response.json({ plan, items, total: data.meta?.count ?? items.length, credits });
}
