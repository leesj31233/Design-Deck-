import { adminClient } from "@/lib/paperflow/cloud/server";

/**
 * Shared translation cache lookup. The client sends sha256(prompt version + source paragraph);
 * a paragraph someone already translated comes back without another model call. Only hashes and
 * translations are stored, never PDFs, and only the server writes them (after the model answered).
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "이 사이트에서만 사용할 수 있다." }, { status: 403 });
  const admin = adminClient();
  if (!admin) return Response.json({ translations: {} }, { status: 200 });
  let body: { hashes?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "잘못된 요청이다." }, { status: 400 }); }
  const hashes = Array.isArray(body.hashes) ? [...new Set(body.hashes.filter((hash): hash is string => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash)))].slice(0, 500) : [];
  if (!hashes.length) return Response.json({ translations: {} });
  const { data, error } = await admin.from("shared_translations").select("source_hash, text").in("source_hash", hashes);
  if (error) return Response.json({ translations: {} });
  return Response.json({ translations: Object.fromEntries((data ?? []).map(row => [row.source_hash, row.text])) });
}
