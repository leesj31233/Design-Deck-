import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { currentUser } from "@/lib/paperflow/cloud/server";
import { foreignOrigin } from "@/lib/paperflow/scholar/server";

export const runtime = "nodejs";
export const maxDuration = 60;
const LIMIT = 60 * 1024 * 1024;

/** Loopback, private, link-local and other non-public addresses: the server never fetches those. */
function privateAddress(address: string) {
  if (isIP(address) === 6) {
    const value = address.toLowerCase();
    if (value.startsWith("::ffff:")) return privateAddress(value.slice(7));
    return value === "::1" || value === "::" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb");
  }
  const [a, b] = address.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
async function publicUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || (url.port && !["80", "443"].includes(url.port))) return null;
  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true }).catch(() => []);
  return addresses.length && !addresses.some(entry => privateAddress(entry.address)) ? url : null;
}

/**
 * An open-access PDF from the Intelligence tab, fetched by the server (publishers rarely allow a
 * browser to read their files from another site) and handed to the reader, which imports it like a
 * dropped file. Signed-in readers only; public web addresses only; at most 60 MB; redirects are
 * followed by hand so each hop is checked again.
 */
export async function GET(request: Request) {
  if (foreignOrigin(request)) return Response.json({ error: "이 사이트에서만 사용할 수 있습니다." }, { status: 403 });
  if (!await currentUser()) return Response.json({ error: "로그인하면 원문 PDF를 서재로 가져올 수 있습니다." }, { status: 401 });
  let target = await publicUrl(new URL(request.url).searchParams.get("url") ?? "");
  if (!target) return Response.json({ error: "가져올 수 없는 주소입니다." }, { status: 400 });
  let response: Response | null = null;
  for (let hop = 0; hop < 5 && target; hop++) {
    response = await fetch(target, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0 (PAPERFLOW research reader)", accept: "application/pdf,*/*;q=0.8" }, signal: AbortSignal.timeout(45_000) }).catch(() => null);
    if (!response) return Response.json({ error: "원문 서버에 연결하지 못했습니다." }, { status: 502 });
    const next = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
    if (!next) break;
    target = await publicUrl(new URL(next, target).toString());
    if (!target) return Response.json({ error: "가져올 수 없는 주소로 이동합니다." }, { status: 400 });
  }
  if (!response?.ok || !response.body) return Response.json({ error: `원문 서버가 PDF를 주지 않았습니다 (${response?.status ?? "?"}). 원문 링크에서 직접 내려받아 서재에 끌어다 놓아 주세요.` }, { status: 502 });
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
