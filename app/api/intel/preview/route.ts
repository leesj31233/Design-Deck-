import { currentUser } from "@/lib/paperflow/cloud/server";
import { foreignOrigin } from "@/lib/paperflow/scholar/server";
import { guardedFetch } from "@/lib/paperflow/intel/fetch-guard";
import { linkMeta } from "@/lib/paperflow/intel/link-meta";

export const runtime = "nodejs";
export const maxDuration = 20;
const LIMIT = 1_500_000;

/**
 * A link preview for a source in the side panel: the page's own title, publisher, date, summary and
 * lead image (Open Graph / Twitter / standard meta), so a reference can be recognised at a glance
 * before opening it. A PDF is reported as such. Signed-in readers only; public addresses only.
 */
export async function GET(request: Request) {
  if (foreignOrigin(request)) return Response.json({ error: "이 사이트에서만 사용할 수 있습니다." }, { status: 403 });
  if (!await currentUser()) return Response.json({ error: "login" }, { status: 401 });
  const raw = new URL(request.url).searchParams.get("url") ?? "";
  const fetched = await guardedFetch(raw, { accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5", timeout: 12_000 });
  if ("error" in fetched) return Response.json({ error: fetched.error }, { status: fetched.status });
  const { response, url } = fetched, type = response.headers.get("content-type") ?? "";
  const host = url.hostname.replace(/^www\./, "");
  const cache = { "cache-control": "private, max-age=86400" };
  if (/pdf/i.test(type) || /\.pdf($|\?)/i.test(url.pathname)) {
    await response.body?.cancel();
    return Response.json({ kind: "pdf", url: url.toString(), host, title: decodeURIComponent(url.pathname.split("/").pop() ?? "").replace(/\.pdf$/i, "") || host, size: Number(response.headers.get("content-length") ?? 0) || undefined }, { headers: cache });
  }
  if (!response.ok || !/html/i.test(type) || !response.body) { await response.body?.cancel(); return Response.json({ kind: "page", url: url.toString(), host, status: response.status }, { headers: cache }); }
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  // Only the head matters; stop early.
  while (size < LIMIT) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); size += value.byteLength; if (Buffer.concat(chunks).toString("utf8").includes("</head>")) break; }
  await reader.cancel().catch(() => undefined);
  const html = Buffer.concat(chunks).toString("utf8").slice(0, LIMIT);
  return Response.json(linkMeta(html, url), { headers: cache });
}
