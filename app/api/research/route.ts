import { polishKorean, researchTranslationInstructions } from "@/lib/paperflow/translation/research-style";
import { TRANSLATION_PROMPT_VERSION, sourceHash } from "@/lib/paperflow/translation/prompt-version";
import { adminClient, creditGate } from "@/lib/paperflow/cloud/server";
import { partitionTranslationResults, type TranslationPassage } from "@/lib/paperflow/translation/block-contract";

export const maxDuration = 120;

const requestTimes = new Map<string, number[]>();
const LIMIT_PER_MINUTE = 120;
const LIMIT_PER_HOUR = 1200;

function rateLimited(request: Request) {
  // A local run (development, layout QA) is not a public client.
  if (/^(?:localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(request.url).hostname)) return false;
  const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  if (requestTimes.size > 2000) {
    for (const [key, times] of requestTimes) if (!times.some(time => now - time < 3_600_000)) requestTimes.delete(key);
  }
  const times = (requestTimes.get(ip) ?? []).filter(time => now - time < 3_600_000);
  if (times.length >= LIMIT_PER_HOUR || times.filter(time => now - time < 60_000).length >= LIMIT_PER_MINUTE) return true;
  times.push(now);
  requestTimes.set(ip, times);
  return false;
}

const BLOCK_RULES = `Each passage has a role. body: translate the whole paragraph, sentence by sentence, without omitting, merging, summarising or adding anything; keep the sentence order. heading: translate the section title concisely and keep its numbering (e.g. "2.1." stays). caption: keep the leading label such as "Fig. 3." or "Table 2." verbatim, then translate the rest. A passage may start or end mid-sentence because it continues across a column; translate exactly the words given. Keep a leading label such as "ABSTRACT:" verbatim. The input may carry a glossary: the paper's key terms. Every time a glossary term occurs, write it in English exactly as given (Korean particles attach directly: torrefaction은, co-firing을); never transliterate it into Hangul (never 토리팩션, 코파이어링) and never replace it with a Korean word. Use the same rendering for every term on every page. Return every supplied id exactly once.
Symbols and formulas: copy variable names, subscripted symbols, chemical formulas and units character for character as they appear in the source (k_dev written as kdev stays kdev, CO2 stays CO2, m2/kg stays m2/kg); never add LaTeX, underscores, carets, dollar signs or Unicode sub/superscripts, and never expand an abbreviation the source did not expand. Numbers, ranges, signs and decimal separators are copied exactly.
Example (body): "The co-firing ratio of torrefied EFB was increased from 10% to 50%, which reduced NOx emissions at the furnace exit but lowered the boiler efficiency owing to unburned carbon in the fly ash [12]." → "torrefied EFB의 co-firing 비율을 10%에서 50%로 높이자 화로 출구의 NOx 배출은 감소하였으나, fly ash 내 미연탄소로 인해 보일러 효율은 저하되었다 [12]."
Example (body): "The realizable k-ε model was used with the discrete ordinates (DO) radiation model, and the char burnout was predicted with the kinetics/diffusion-limited model." → "realizable k-ε model과 discrete ordinates(DO) radiation model을 사용하였으며, char burnout은 kinetics/diffusion-limited model로 예측하였다."
Example (caption): "Fig. 5. Temperature distribution in the furnace at a 20% co-firing ratio." → "Fig. 5. co-firing 비율 20%에서의 화로 내 온도 분포."
Example (heading): "3.2. Boundary Conditions" → "3.2. 경계 조건"`;

/**
 * Prompt caching: OpenAI bills a repeated prompt prefix of 1024+ tokens at a quarter of the input
 * price. Everything that varies (passages, the paper's glossary) goes in `input`; instructions and
 * the response schema stay byte-identical for every request and every user, so the prefix caches.
 */
const WIRE_IDS = Array.from({ length: 16 }, (_, index) => `p${index}`);
const PROMPT_CACHE_KEY = "paperflow-translate";

function outputText(data: { output?: { content?: { type: string; text?: string }[] }[] }) {
  return (data.output ?? []).flatMap(item => item.content ?? []).filter(item => item.type === "output_text").map(item => item.text ?? "").join("\n");
}

/**
 * Store what the model just produced in the shared cache, keyed by the source paragraph hash.
 * Written here, on the server, so a client can never plant a translation for someone else.
 */
async function shareTranslations(passages: TranslationPassage[], results: { id: string; text: string }[]) {
  const admin = adminClient();
  if (!admin || !results.length) return;
  const byId = new Map(passages.map(passage => [passage.id, passage.text]));
  try {
    const rows = await Promise.all(results.filter(result => byId.has(result.id)).map(async result => ({ source_hash: await sourceHash(byId.get(result.id)!), prompt_version: TRANSLATION_PROMPT_VERSION, text: polishKorean(result.text) })));
    await admin.from("shared_translations").upsert(rows, { onConflict: "source_hash", ignoreDuplicates: true });
  } catch { /* The cache is an optimisation; a failed write never fails the translation. */ }
}

export async function GET() { return Response.json({ available: Boolean(process.env.OPENAI_API_KEY), provider: "OpenAI" }); }

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "서버의 OpenAI 연결이 아직 설정되지 않았습니다.", kind: "configuration" }, { status: 503 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "이 사이트에서만 사용할 수 있습니다.", kind: "configuration" }, { status: 403 });
  if (rateLimited(request)) return Response.json({ error: "번역 요청이 일시적으로 많습니다. 잠시 후 다시 시도해 주세요.", kind: "rate_limit" }, { status: 429, headers: { "Retry-After": "20" } });
  let body: { passages?: unknown; task?: unknown; glossary?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "잘못된 요청입니다.", kind: "configuration" }, { status: 400 }); }
  const blocks = body.task === "translate_blocks";
  const passages = blocks && Array.isArray(body.passages) ? (body.passages as TranslationPassage[]).map(item => ({ id: item?.id, text: item?.text, role: item?.role === "heading" || item?.role === "caption" ? item.role : "body" })) as TranslationPassage[] : [];
  const validBlocks = passages.length >= 1 && passages.length <= 16 && passages.every(item => typeof item.id === "string" && /^[a-z0-9_-]{1,40}$/i.test(item.id) && typeof item.text === "string" && item.text.trim() && item.text.length <= 12000) && new Set(passages.map(item => item.id)).size === passages.length && passages.reduce((sum, item) => sum + item.text.length, 0) <= 20000;
  if (!blocks || !validBlocks) return Response.json({ error: "유효한 원문과 작업이 필요합니다.", kind: "configuration" }, { status: 400 });

  // 1 credit per paragraph; refused before the model is asked when the month's credits would run out.
  const gate = await creditGate(passages.length);
  if (gate instanceof Response) return gate;
  const chars = passages.reduce((sum, item) => sum + item.text.length, 0);
  // Paper-specific keywords stay in English on every page (passed as data, length-bounded).
  const glossary = Array.isArray(body.glossary) ? body.glossary.filter((term): term is string => typeof term === "string" && /^[\w\s.,+/()-]{2,40}$/.test(term)).slice(0, 30) : [];
  const instructions = `${researchTranslationInstructions} ${BLOCK_RULES}`;
  const schema = { format: { type: "json_schema", name: "translation_blocks", strict: true, schema: { type: "object", properties: { translations: { type: "array", items: { type: "object", properties: { id: { type: "string", enum: passages.every(item => WIRE_IDS.includes(item.id)) ? WIRE_IDS : passages.map(item => item.id) }, text: { type: "string" } }, required: ["id", "text"], additionalProperties: false } } }, required: ["translations"], additionalProperties: false } } };
  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(100_000)]),
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4.1-mini", store: false, temperature: .2, instructions, prompt_cache_key: PROMPT_CACHE_KEY, input: JSON.stringify(glossary.length ? { glossary, passages } : { passages }), text: schema, max_output_tokens: Math.min(16000, Math.ceil(chars * 1.4) + 600) })
    });
    // An exhausted OpenAI balance is not a passing rate limit: say so instead of promising a retry.
    if (upstream.status === 429) {
      const detail = await upstream.clone().json().catch(() => null) as { error?: { type?: string; code?: string } } | null;
      if (detail?.error?.type === "insufficient_quota") return Response.json({ error: "번역 서비스의 사용 한도가 소진되어 잠시 번역할 수 없습니다. 관리자가 충전하면 이어서 번역할 수 있습니다.", kind: "configuration" }, { status: 503 });
    }
    if (!upstream.ok) return Response.json({ error: upstream.status === 429 ? "OpenAI 사용량 또는 요청 한도에 도달했습니다. 잠시 후 자동으로 다시 시도합니다." : "OpenAI 요청을 완료하지 못했습니다.", kind: upstream.status === 429 ? "rate_limit" : upstream.status >= 500 ? "transient" : "configuration" }, { status: upstream.status === 429 ? 429 : upstream.status >= 500 ? 503 : 502, headers: { "Retry-After": upstream.headers.get("retry-after") || "20" } });
    const data = await upstream.json();
    const text = outputText(data);
    // Cached prompt tokens are billed at a discount; the model name lets cost reports use the right price.
    const usage = { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0, cached: data.usage?.input_tokens_details?.cached_tokens ?? 0, model: typeof data.model === "string" ? data.model : undefined };
    let parsed: { translations?: unknown } = {};
    // An incomplete response can still carry complete items; keep those and report the rest.
    try { parsed = JSON.parse(text); } catch { parsed = { translations: [...text.matchAll(/\{"id":"([^"]+)","text":"((?:[^"\\]|\\.)*)"\}/g)].map(match => ({ id: match[1], text: JSON.parse(`"${match[2]}"`) })) }; }
    // A batch is held to the term and length checks; a passage retried on its own cannot borrow from a
    // neighbour, and is accepted rather than retried again (no cost spiral, no paragraph left in English).
    const { results, missing } = partitionTranslationResults(passages, parsed.translations, glossary, passages.length > 1);
    if (!results.length) return Response.json({ error: "번역 결과를 확인할 수 없어 더 작은 묶음으로 다시 시도합니다.", kind: "malformed", usage }, { status: 502 });
    await Promise.all([shareTranslations(passages, results), gate.charge(results.length)]);
    return Response.json({ translations: results, missing, provider: "OpenAI", usage, incomplete: data.status === "incomplete" });
  } catch { return Response.json({ error: "연결 시간이 초과되었거나 요청이 취소되었습니다.", kind: "transient" }, { status: 504 }); }
}
