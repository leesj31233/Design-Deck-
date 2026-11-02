import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Loopback, private, link-local and other non-public addresses: the server never fetches those. */
function privateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const value = address.toLowerCase();
    if (value.startsWith("::ffff:")) return privateAddress(value.slice(7));
    return value === "::1" || value === "::" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb");
  }
  const [a, b] = address.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** A web address the server may fetch: http(s), default ports, no credentials, resolving only to public addresses. */
export async function publicUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || (url.port && !["80", "443"].includes(url.port))) return null;
  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true }).catch(() => []);
  return addresses.length && !addresses.some(entry => privateAddress(entry.address)) ? url : null;
}

/** Fetch a public page, following up to five redirects by hand so every hop is checked again. */
export async function guardedFetch(raw: string, init: { accept: string; timeout: number }) {
  let target = await publicUrl(raw);
  if (!target) return { error: "가져올 수 없는 주소입니다.", status: 400 } as const;
  for (let hop = 0; hop < 5; hop++) {
    const response = await fetch(target, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0 (PAPERFLOW research reader)", accept: init.accept }, signal: AbortSignal.timeout(init.timeout) }).catch(() => null);
    if (!response) return { error: "원문 서버에 연결하지 못했습니다.", status: 502 } as const;
    const next = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
    if (!next) return { response, url: target } as const;
    target = await publicUrl(new URL(next, target).toString());
    if (!target) return { error: "가져올 수 없는 주소로 이동합니다.", status: 400 } as const;
  }
  return { error: "이동이 너무 많습니다.", status: 508 } as const;
}
