import { adminClient } from "@/lib/paperflow/cloud/server";
import { ingestAuthorized } from "@/lib/paperflow/intel/ingest-auth";
import { syncCovers, writeSnapshot } from "@/lib/paperflow/intel/public-snapshot";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Rebuild NAYSOR News' static copy after a delivery (research routine only): ?step=covers uploads missing
 * covers for ~40 s and says how many remain (call again until 0); ?step=build writes the feed and the manifest.
 */
export async function POST(request: Request) {
  if (!ingestAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const admin = adminClient();
  if (!admin) return Response.json({ error: "server not configured" }, { status: 503 });
  const url = new URL(request.url);
  try {
    if (url.searchParams.get("step") === "covers") return Response.json(await syncCovers(admin));
    const manifest = await writeSnapshot(admin, url.origin);
    return Response.json({ version: manifest.version, total: manifest.total, parts: manifest.parts.length });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "snapshot failed" }, { status: 502 }); }
}
