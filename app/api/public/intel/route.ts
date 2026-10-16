import { adminClient } from "@/lib/paperflow/cloud/server";
import { publicFeed } from "@/lib/paperflow/intel/public-feed";

export const runtime = "nodejs";
export const maxDuration = 60;

/** NAYSOR News: the intelligence list for anyone (no account). Cached at the edge for a few minutes. */
export async function GET(request: Request) {
  const admin = adminClient();
  if (!admin) return Response.json({ error: "server not configured" }, { status: 503 });
  try {
    const feed = await publicFeed(admin, new URL(request.url).origin);
    if (!feed) return Response.json({ error: "no feed" }, { status: 404 });
    return Response.json(feed, { headers: { "Cache-Control": "public, max-age=60, s-maxage=1800, stale-while-revalidate=604800", "Access-Control-Allow-Origin": "*" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "feed failed" }, { status: 502 }); }
}
