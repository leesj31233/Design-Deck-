import { adminClient } from "@/lib/paperflow/cloud/server";
import { ingestAuthorized } from "@/lib/paperflow/intel/ingest-auth";
import { feedOwner, rows } from "@/lib/paperflow/intel/public-feed";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * What the research routine needs to know before a run, when it runs away from the owner's computer (a cloud
 * routine): every item in brief (to avoid duplicates and to link to), the organisations' codes, the briefings
 * (title, date; and the body of the routine's instructions, "__guides__"), the glossary terms and the latest
 * price of each series. Research routine only (INTEL_INGEST_TOKEN).
 */
export async function GET(request: Request) {
  if (!ingestAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const admin = adminClient();
  if (!admin) return Response.json({ error: "server not configured" }, { status: 503 });
  try {
    const userId = await feedOwner(admin);
    if (!userId) return Response.json({ error: "owner not found" }, { status: 404 });
    // ?full=<id>,brief:<id>,… : those items and briefings whole (the owner's computer catching up on a cloud run).
    const full = (new URL(request.url).searchParams.get("full") ?? "").split(",").map(id => id.trim()).filter(id => /^(brief:)?[w.:-]{1,120}$/.test(id)).slice(0, 40);
    if (full.length) {
      const wanted = full.map(id => id.startsWith("brief:") ? `intelbrief:${id.slice(6)}` : `intel:${id}`);
      const { data, error } = await admin.from("annotations").select("id, data, updated_at").eq("user_id", userId).eq("document_id", "__intel__").eq("deleted", false).in("id", wanted);
      if (error) throw new Error(error.message);
      return Response.json({ items: (data ?? []).filter(row => row.id.startsWith("intel:")).map(row => row.data), briefs: (data ?? []).filter(row => row.id.startsWith("intelbrief:")).map(row => row.data) });
    }
    const [items, briefs] = await Promise.all([
      rows(admin, userId, "intel:", "id, updated_at, kind:data->>kind, title:data->>title, titleKo:data->>titleKo, url:data->>url, date:data->>date, org:data->>org, classes:data->classes, update:data->update"),
      rows(admin, userId, "intelbrief:")
    ]);
    const brief = (id: string) => briefs.find(row => row.id === `intelbrief:${id}`)?.data as { body?: string } | undefined;
    const json = <T,>(id: string, fallback: T): T => { try { return JSON.parse(brief(id)?.body ?? "") as T; } catch { return fallback; } };
    const registry = json<{ entities?: { code: string; name: string; aliases?: string[]; category?: string; parentCode?: string; canonicalItemId?: string }[] }>("__registry__", {});
    const prices = json<{ series?: { id: string; name?: string; unit?: string; points?: { date: string; value: number }[] }[] }>("__prices__", {});
    return Response.json({
      generatedAt: new Date().toISOString(),
      items: (items as unknown as Record<string, unknown>[]).map(row => ({ ...row, id: String(row.id).slice(6) })),
      entities: (registry.entities ?? []).map(({ code, name, aliases, category, parentCode, canonicalItemId }) => ({ code, name, aliases, category, parentCode, canonicalItemId })),
      briefs: briefs.filter(row => !row.id.startsWith("intelbrief:__")).map(row => { const data = row.data as { id: string; title: string; period?: string; date?: string; classes?: string[] }; return { id: data.id, title: data.title, period: data.period, date: data.date, classes: data.classes, updatedAt: row.updated_at }; }),
      guides: brief("__guides__")?.body ?? null,
      glossary: json<{ term: string }[]>("__glossary__", []).map(term => term.term),
      prices: (prices.series ?? []).map(series => ({ id: series.id, name: series.name, unit: series.unit, last: series.points?.at(-1) }))
    });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "state failed" }, { status: 502 }); }
}
