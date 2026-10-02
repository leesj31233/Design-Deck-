import type { TranslationBatchResult, TranslationPassage } from "./block-contract";

export class ResearchHttpError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterMs = 0, readonly kind: "rate_limit" | "transient" | "malformed" | "configuration" = status === 429 ? "rate_limit" : status >= 500 ? "transient" : "configuration") { super(message); this.name = "ResearchHttpError"; }
}

/**
 * Models copy short IDs reliably and 32-character hashes unreliably, so the
 * wire format uses p0…pN and maps back here.
 */
export async function researchTranslateBlocks(passages: TranslationPassage[], signal?: AbortSignal, glossary: string[] = []): Promise<TranslationBatchResult & { usage?: { input: number; output: number } }> {
  const wire = passages.map((passage, index) => ({ id: `p${index}`, text: passage.text, role: passage.role ?? "body" }));
  const response = await fetch("/api/research", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: "translate_blocks", passages: wire, glossary }) });
  const body = await response.json().catch(() => ({ error: "번역 서버 응답을 읽을 수 없다.", kind: "malformed" }));
  if (!response.ok) throw new ResearchHttpError(body.error || "문단 번역을 완료하지 못했다.", response.status, Math.max(0, Number(response.headers.get("retry-after")) || 0) * 1000, body.kind);
  const byWire = new Map(wire.map((item, index) => [item.id, passages[index].id]));
  const results = (Array.isArray(body.translations) ? body.translations : []).flatMap((item: { id?: string; text?: string }) => typeof item?.id === "string" && typeof item.text === "string" && byWire.has(item.id) ? [{ id: byWire.get(item.id)!, text: item.text }] : []);
  const done = new Set(results.map((item: { id: string }) => item.id));
  return { results, missing: passages.map(passage => passage.id).filter(id => !done.has(id)), usage: body.usage };
}

export async function researchRequest(task: "explain", source: string, selection = "", signal?: AbortSignal) {
  const response = await fetch("/api/research", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task, source, selection }) });
  const body = await response.json().catch(() => ({ error: "OpenAI 서버가 연결되지 않았다." }));
  if (!response.ok) throw new Error(body.error || "연구 서비스에 연결하지 못했다.");
  return body as { text: string; provider: "OpenAI" };
}
