import type { TranslationBatchResult, TranslationPassage } from "./block-contract";
import { sourceHash } from "./prompt-version";

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

/**
 * Paragraphs someone already translated (same source text, same prompt) come from the shared
 * cache instead of the model. Any failure simply means "nothing cached".
 */
export async function sharedTranslations(passages: { id: string; text: string }[], signal?: AbortSignal): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (!passages.length) return found;
  try {
    const hashes = await Promise.all(passages.map(passage => sourceHash(passage.text)));
    for (let start = 0; start < hashes.length; start += 500) {
      const slice = hashes.slice(start, start + 500);
      const response = await fetch("/api/translations/shared", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hashes: slice }) });
      if (!response.ok) return found;
      const { translations } = await response.json() as { translations?: Record<string, string> };
      slice.forEach((hash, offset) => { const text = translations?.[hash]; if (typeof text === "string" && text.trim()) found.set(passages[start + offset].id, text); });
    }
  } catch { /* Offline or not configured: translate as usual. */ }
  return found;
}
