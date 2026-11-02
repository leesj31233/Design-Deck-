import { currentUser } from "@/lib/paperflow/cloud/server";
import { foreignOrigin } from "@/lib/paperflow/scholar/server";
import { guardedFetch } from "@/lib/paperflow/intel/fetch-guard";

export const runtime = "nodejs";
export const maxDuration = 60;
const LIMIT = 60 * 1024 * 1024;

/**
 * An open-access PDF from the Intelligence tab, fetched by the server (publishers rarely allow a
 * browser to read their files from another site) and handed to the reader, which imports it like a
 * dropped file. Signed-in readers only; public web addresses only; at most 60 MB; redirects are
 * followed by hand so each hop is checked again.
 */
export async function GET(request: Request) {
  if (foreignOrigin(request)) return Response.json({ error: "이 사이트에서만 사용할 수 있습니다." }, { status: 403 });
  if (!await currentUser()) return Response.json({ error: "로그인하면 원문 PDF를 서재로 가져올 수 있습니다." }, { status: 401 });
  const fetched = await guardedFetch(new URL(request.url).searchParams.get("url") ?? "", { accept: "application/pdf,*/*;q=0.8", timeout: 45_000 });
  if ("error" in fetched) return Response.json({ error: fetched.error }, { status: fetched.status });
  const { response } = fetched;
  if (!response.ok || !response.body) return Response.json({ error: `원문 서버가 PDF를 주지 않았습니다 (${response.status}). 원문 링크에서 직접 내려받아 서재에 끌어다 놓아 주세요.` }, { status: 502 });
  if (Number(response.headers.get("content-length") ?? 0) > LIMIT) return Response.json({ error: "60MB보다 큰 PDF는 직접 내려받아 주세요." }, { status: 413 });
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > LIMIT) { await reader.cancel(); return Response.json({ error: "60MB보다 큰 PDF는 직접 내려받아 주세요." }, { status: 413 }); }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks);
  // A login page or an HTML landing page is not a PDF.
  if (!bytes.subarray(0, 1024).toString("latin1").includes("%PDF-")) return Response.json({ error: "이 링크는 PDF가 아니라 웹페이지입니다. 원문 페이지에서 PDF를 내려받아 서재에 끌어다 놓아 주세요." }, { status: 415 });
  return new Response(bytes, { headers: { "content-type": "application/pdf", "cache-control": "private, no-store" } });
}
