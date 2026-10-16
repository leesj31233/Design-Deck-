import { adminClient } from "@/lib/paperflow/cloud/server";
import { publicFeed } from "@/lib/paperflow/intel/public-feed";

export const runtime = "nodejs";
export const maxDuration = 60;
/** Items per part: each response stays well under the platform's response size limit as the base grows. */
const PART = 400;

/**
 * NAYSOR News: the intelligence list for anyone (no account), in parts (?part=0,1,…). Part 0 carries the
 * briefings and says how many parts there are. Each part is cached at the edge.
 */
export async function GET(request: Request) {
  const admin = adminClient();
  if (!admin) return Response.json({ error: "server not configured" }, { status: 503 });
  try {
    const url = new URL(request.url), part = Math.max(0, Number(url.searchParams.get("part") ?? 0) || 0);
    const feed = await publicFeed(admin, url.origin);
    if (!feed) return Response.json({ error: "no feed" }, { status: 404 });
    const items = feed.items.slice(part * PART, (part + 1) * PART), ids = new Set(items.map(item => item.id));
    const body = { generatedAt: feed.generatedAt, part, parts: Math.max(1, Math.ceil(feed.items.length / PART)), total: feed.items.length, items,
      briefs: part === 0 ? feed.briefs : [], covers: Object.fromEntries(Object.entries(feed.covers).filter(([id]) => ids.has(id))) };
    return Response.json(body, { headers: { "Cache-Control": "public, max-age=60, s-maxage=1800, stale-while-revalidate=604800", "Access-Control-Allow-Origin": "*" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "feed failed" }, { status: 502 }); }
}
