export async function researchRequest(task: "translate" | "explain", source: string, selection = "", signal?: AbortSignal) {
  const response = await fetch("/api/research", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task, source, selection }) });
  if ((response.status === 503 || response.status === 404) && task === "translate") return null;
  const body = await response.json().catch(() => ({ error: "OpenAI 서버가 연결되지 않았다." }));
  if (!response.ok) throw new Error(body.error || "연구 서비스에 연결하지 못했다.");
  return body as { text: string; provider: "OpenAI" };
}

/** One server request for several paragraphs avoids per-paragraph rate limits. */
export async function researchBatchTranslate(sources: string[], signal?: AbortSignal): Promise<string[] | null> {
  const response = await fetch("/api/research", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: "translate_batch", sources }) });
  if (response.status === 503 || response.status === 404) return null;
  const body = await response.json().catch(() => ({ error: "번역 서버 응답을 읽을 수 없다." }));
  if (!response.ok) throw new Error(body.error || "페이지 번역을 완료하지 못했다.");
  if (!Array.isArray(body.translations) || body.translations.length !== sources.length) throw new Error("번역 문단 수가 원문과 맞지 않는다.");
  return body.translations as string[];
}
