export class ResearchHttpError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterMs = 0, readonly kind: "rate_limit" | "transient" | "malformed" | "configuration" = status === 429 ? "rate_limit" : status >= 500 ? "transient" : "configuration") { super(message); this.name = "ResearchHttpError"; }
}

import { validateTranslationResults, type TranslationPassage, type TranslationResult } from "./block-contract";

export async function researchTranslateBlocks(passages: TranslationPassage[], signal?: AbortSignal): Promise<TranslationResult[]> {
  const response = await fetch("/api/research", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: "translate_blocks", passages }) });
  const body = await response.json().catch(() => ({ error: "번역 서버 응답을 읽을 수 없다." }));
  if (!response.ok) throw new ResearchHttpError(body.error || "문단 번역을 완료하지 못했다.", response.status, Math.max(0, Number(response.headers.get("retry-after")) || 0) * 1000, body.kind);
  return validateTranslationResults(passages, body.translations);
}

export async function researchRequest(task: "translate" | "explain", source: string, selection = "", signal?: AbortSignal) {
  const response = await fetch("/api/research", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task, source, selection }) });
  if ((response.status === 503 || response.status === 404) && task === "translate") return null;
  const body = await response.json().catch(() => ({ error: "OpenAI 서버가 연결되지 않았다." }));
  if (!response.ok) throw new Error(body.error || "연구 서비스에 연결하지 못했다.");
  return body as { text: string; provider: "OpenAI" };
}

/** One server request for several paragraphs avoids per-paragraph rate limits. */
export async function researchBatchTranslate(sources: string[], signal?: AbortSignal): Promise<string[] | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch("/api/research", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: "translate_batch", sources }) });
    if (response.status === 503 || response.status === 404) return null;
    if ((response.status === 429 || response.status === 502 || response.status === 504) && attempt < 2) {
      const seconds = Math.min(30, Number(response.headers.get("retry-after")) || 2 ** attempt * 2);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, seconds * 1000);
        signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
      });
      continue;
    }
    const body = await response.json().catch(() => ({ error: "번역 서버 응답을 읽을 수 없다." }));
    if (!response.ok) throw new ResearchHttpError(body.error || "페이지 번역을 완료하지 못했다.", response.status);
    if (!Array.isArray(body.translations) || body.translations.length !== sources.length) throw new Error("번역 문단 수가 원문과 맞지 않는다.");
    return body.translations as string[];
  }
  throw new Error("번역 요청을 완료하지 못했다.");
}
