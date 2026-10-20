import { adminClient } from "@/lib/paperflow/cloud/server";
import { publicMedia } from "@/lib/paperflow/intel/public-feed";

export const runtime = "nodejs";

/** One NAYSOR News picture (a cover or a case-file figure). The URL carries a version, so it is cached for good. */
export async function GET(request: Request) {
  const admin = adminClient(), params = new URL(request.url).searchParams;
  if (!admin) return new Response(null, { status: 503 });
  const figure = params.get("fig"), index = figure === null ? null : Number(figure);
  if (index !== null && (!Number.isInteger(index) || index < 0 || index > 40)) return new Response(null, { status: 400 });
  const media = await publicMedia(admin, params.get("item") ?? "", index);
  if (!media) return new Response(null, { status: 404, headers: { "Cache-Control": "public, s-maxage=300" } });
  return new Response(new Uint8Array(media.bytes), { headers: { "Content-Type": media.type, "Cache-Control": "public, max-age=31536000, immutable", "Access-Control-Allow-Origin": "*" } });
}
