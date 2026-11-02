import { createHash } from "node:crypto";
import { adminClient } from "@/lib/paperflow/cloud/server";
import { ingestAuthorized } from "@/lib/paperflow/intel/ingest-auth";
import { NEWS_BUCKET } from "@/lib/paperflow/intel/public-snapshot";

export const runtime = "nodejs";
export const maxDuration = 30;
const TYPES = new Set(["image/webp", "image/jpeg", "image/png"]);

/**
 * A full-quality picture of an item (research routine only): stored once on the CDN under a name made from its
 * content, so it is cached for good and a new picture never collides with the old. Answers its public URL.
 */
export async function POST(request: Request) {
  if (!ingestAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const admin = adminClient();
  if (!admin) return Response.json({ error: "server not configured" }, { status: 503 });
  const url = new URL(request.url), item = url.searchParams.get("item") ?? "", type = request.headers.get("content-type") ?? "";
  if (!/^[\w.:-]{1,120}$/.test(item) || !TYPES.has(type)) return Response.json({ error: "bad request" }, { status: 400 });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length || bytes.length > 3_500_000) return Response.json({ error: "size" }, { status: 413 });
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16), ext = type.split("/")[1].replace("jpeg", "jpg");
  const path = `images/${item.replace(/:/g, "_")}/${hash}.${ext}`;
  const { error } = await admin.storage.from(NEWS_BUCKET).upload(path, new Blob([bytes], { type }), { contentType: type, cacheControl: "31536000", upsert: true });
  if (error) return Response.json({ error: error.message }, { status: 502 });
  return Response.json({ url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${NEWS_BUCKET}/${path}` });
}
