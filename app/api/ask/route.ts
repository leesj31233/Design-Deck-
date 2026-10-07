import { creditGate } from "@/lib/paperflow/cloud/server";
import { creditsForUsage } from "@/lib/paperflow/cloud/plans";
import { ASK_INSTRUCTIONS, ASK_MODEL, WEB_SEARCH_CREDITS, askCreditEstimate, askSchema, termsOf, validateAnswer, type AskPassage, type Literature } from "@/lib/paperflow/ask/ask";

export const maxDuration = 120;

const recent = new Map<string, number[]>();
function limited(request: Request) {
  const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown", now = Date.now();
  if (/^(?:127\.|::1|localhost)/.test(ip)) return false;
  const times = (recent.get(ip) ?? []).filter(time => now - time < 3_600_000);
  if (times.length >= 200) return true;
  recent.set(ip, [...times, now]);
  return false;
}

/** Abstract text from OpenAlex's inverted index. */
function abstractOf(inverted: Record<string, number[]> | null | undefined) {
  if (!inverted) return "";
  const words: string[] = [];
  for (const [word, positions] of Object.entries(inverted)) for (const at of positions) words[at] = word;
  return words.filter(Boolean).join(" ").slice(0, 900);
}

/** Related papers for the question from OpenAlex (free): its English terms, else the paper's own keywords. */
async function relatedPapers(question: string, keywords: string[], exclude: string): Promise<Literature[]> {
  const terms = termsOf(question).filter(term => !/^\d+(?:\.\d+)?$/.test(term) && term.length > 2);
  const query = [...new Set([...terms, ...keywords.slice(0, terms.length >= 2 ? 1 : 3)])].join(" ").slice(0, 200);
  if (!query.trim()) return [];
  try {
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=8&select=id,title,publication_year,doi,cited_by_count,abstract_inverted_index&mailto=paperflow@example.org`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return [];
    const data = await response.json() as { results?: { id: string; title?: string; publication_year?: number; doi?: string; cited_by_count?: number; abstract_inverted_index?: Record<string, number[]> }[] };
    return (data.results ?? []).filter(work => work.title && work.title.toLowerCase() !== exclude.toLowerCase()).slice(0, 5).map((work, at) => ({
      id: `L${at + 1}`, title: work.title!, year: work.publication_year, url: work.doi ?? work.id, cited: work.cited_by_count, abstract: abstractOf(work.abstract_inverted_index)
    }));
  } catch { return []; }
}

/**
 * 질문: one question about the paper, answered from the passages the reader picked (plus related papers
 * and the web when asked), streamed back as NDJSON lines: {t:"status"}, {t:"delta"} with the raw JSON
 * text, and finally {t:"done"} with the checked answer and its credits.
 */
export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "서버의 OpenAI 연결이 아직 설정되지 않았습니다." }, { status: 503 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "이 사이트에서만 사용할 수 있습니다." }, { status: 403 });
  let body: { question?: unknown; passages?: unknown; overview?: unknown; history?: unknown; focus?: unknown; title?: unknown; keywords?: unknown; options?: { speed?: unknown; web?: unknown; literature?: unknown } };
  try { body = await request.json(); } catch { return Response.json({ error: "잘못된 요청입니다." }, { status: 400 }); }
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 600) : "";
  const passages: AskPassage[] = (Array.isArray(body.passages) ? body.passages : []).filter((item): item is AskPassage => typeof item?.id === "string" && /^p\d{1,4}$/.test(item.id) && typeof item.text === "string" && Number.isFinite(item.page)).slice(0, 14).map(item => ({ id: item.id, page: item.page, text: item.text.slice(0, 1500) }));
  const overview = typeof body.overview === "string" ? body.overview.slice(0, 1400) : "";
  const focus = typeof body.focus === "string" ? body.focus.slice(0, 1200) : "";
  const title = typeof body.title === "string" ? body.title.slice(0, 300) : "";
  const keywords = (Array.isArray(body.keywords) ? body.keywords : []).filter((item): item is string => typeof item === "string").map(item => item.slice(0, 60)).slice(0, 8);
  const history = (Array.isArray(body.history) ? body.history : []).filter((item): item is { q: string; a: string } => typeof item?.q === "string" && typeof item?.a === "string").slice(-3).map(item => ({ q: item.q.slice(0, 300), a: item.a.slice(0, 700) }));
  const options = { speed: body.options?.speed === "deep" ? "deep" as const : "fast" as const, web: body.options?.web === true, literature: body.options?.literature === true };
  if (question.length < 2 || !passages.length) return Response.json({ error: "질문이나 본문이 비어 있습니다." }, { status: 400 });
  const chars = passages.reduce((sum, passage) => sum + passage.text.length, 0);
  const gate = await creditGate(askCreditEstimate(options, chars));
  if (gate instanceof Response) return gate;
  if (limited(request)) return Response.json({ error: "질문이 많습니다. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  const model = ASK_MODEL(options.speed);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: object) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      try {
        let literature: Literature[] = [];
        if (options.literature) { send({ t: "status", s: "literature" }); literature = await relatedPapers(question, keywords, title); }
        send({ t: "status", s: "thinking" });
        const upstream = await fetch("https://api.openai.com/v1/responses", {
          method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(110_000)]),
          body: JSON.stringify({
            model, store: false, stream: true, prompt_cache_key: "paperflow-ask",
            ...(/^(?:gpt-5|o\d)/.test(model) ? { reasoning: { effort: options.web || options.speed === "deep" ? "low" : "minimal" } } : { temperature: .2 }),
            // Web search on: at least one search is made (the reader asked for outside sources and pays for it).
            ...(options.web ? { tools: [{ type: "web_search" }], tool_choice: "required" } : {}),
            instructions: ASK_INSTRUCTIONS,
            input: JSON.stringify({ question, focus, paper: { title, keywords, overview }, earlier: history, passages, related_papers: literature }),
            text: askSchema(passages.map(passage => passage.id)),
            max_output_tokens: options.speed === "deep" ? 5000 : 3500
          })
        });
        if (!upstream.ok || !upstream.body) {
          const detail = await upstream.json().catch(() => null) as { error?: { code?: string } } | null;
          send({ t: "error", error: upstream.status === 429 ? (detail?.error?.code === "insufficient_quota" ? "OpenAI 크레딧이 부족합니다. 관리자에게 문의해 주세요." : "OpenAI 사용량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.") : "답변을 만들지 못했습니다." });
          controller.close(); return;
        }
        // Server-sent events from OpenAI → NDJSON lines for the reader.
        const reader = upstream.body.getReader(), decoder = new TextDecoder();
        let buffer = "", text = "", searches = 0, usage = { input: 0, output: 0, cached: 0 }, used = model;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n"); buffer = events.pop() ?? "";
          for (const event of events) {
            const data = event.split("\n").find(line => line.startsWith("data: "))?.slice(6);
            if (!data || data === "[DONE]") continue;
            let parsed: { type?: string; delta?: string; item?: { type?: string }; response?: { model?: string; usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } } } };
            try { parsed = JSON.parse(data); } catch { continue; }
            if (parsed.type === "response.output_text.delta" && parsed.delta) { text += parsed.delta; send({ t: "delta", d: parsed.delta }); }
            else if (parsed.type === "response.output_item.added" && parsed.item?.type === "web_search_call") { searches++; send({ t: "status", s: "web" }); }
            else if (parsed.type === "response.completed" || parsed.type === "response.incomplete") {
              const u = parsed.response?.usage;
              usage = { input: u?.input_tokens ?? 0, output: u?.output_tokens ?? 0, cached: u?.input_tokens_details?.cached_tokens ?? 0 };
              used = parsed.response?.model ?? model;
            }
          }
        }
        const credits = creditsForUsage(used, usage) + searches * WEB_SEARCH_CREDITS;
        await gate.charge(credits);
        let answer: ReturnType<typeof validateAnswer> = null;
        try {
          const raw = JSON.parse(text) as { sources?: { title?: string; url?: string; note?: string }[] };
          // A related paper cited by its id (L2) or title gets its real link.
          raw.sources = (raw.sources ?? []).map(source => { const paper = literature.find(item => source.url?.trim() === item.id || source.title?.trim() === item.title); return paper ? { ...source, url: paper.url } : source; });
          answer = validateAnswer(raw, passages);
        } catch { /* reported below */ }
        if (!answer) send({ t: "error", error: "답변을 끝맺지 못했습니다. 다시 질문해 주세요.", credits });
        else send({ t: "done", result: { ...answer, credits, model: used, searches } });
      } catch { send({ t: "error", error: "연결 시간이 초과되었거나 요청이 취소되었습니다." }); }
      controller.close();
    }
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
