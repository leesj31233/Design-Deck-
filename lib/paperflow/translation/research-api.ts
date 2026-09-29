export async function researchRequest(task: "translate" | "explain", source: string, selection = "", signal?: AbortSignal) {
  const token = typeof sessionStorage === "undefined" ? "" : sessionStorage.getItem("paperflow-access") ?? "";
  const local = typeof location !== "undefined" && ["localhost", "127.0.0.1"].includes(location.hostname);
  if (!token && !local) return null;
  const response = await fetch("/api/research", { method: "POST", signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ task, source, selection }) });
  if ((response.status === 503 || response.status === 404) && task === "translate") return null;
  const body = await response.json().catch(() => ({ error: "OpenAI 서버가 연결되지 않았다." }));
  if (!response.ok) throw new Error(body.error || "연구 서비스에 연결하지 못했다.");
  return body as { text: string; provider: "OpenAI" };
}
