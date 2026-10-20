import { createHash } from "node:crypto";
import { adminClient } from "@/lib/paperflow/cloud/server";
import { readPack } from "@/lib/paperflow/intel/repository";
import { ingestAuthorized, ownerId } from "@/lib/paperflow/intel/ingest-auth";

export const runtime = "nodejs";
export const maxDuration = 60;
const LIMIT = 8 * 1024 * 1024;

/**
 * The research routine's delivery point: a pack (items, briefings, glossary) is checked field by field
 * and written into the owner's account, where every signed-in device picks it up on its next sync.
 * Only a caller holding INTEL_INGEST_TOKEN (set on the server and in the routine, never in the code)
 * may write; items keep the reader's own decisions (star, folder, memo), which live on the devices.
 */
export async function POST(request: Request) {
  if (!ingestAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const admin = adminClient();
  if (!admin || !process.env.PAPERFLOW_OWNER_EMAILS) return Response.json({ error: "server not configured" }, { status: 503 });
  const body = await request.text();
  if (body.length > LIMIT) return Response.json({ error: "pack too large" }, { status: 413 });
  let pack;
  try { pack = readPack(body); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "invalid pack" }, { status: 400 }); }

  const userId = await ownerId(admin);
  if (userId === "error") return Response.json({ error: "user lookup failed" }, { status: 502 });
  if (!userId) return Response.json({ error: "owner account not found" }, { status: 404 });

  const now = new Date().toISOString();
  // Covers are big and change rarely: each lives on its own row ("intelmedia:<id>"), rewritten only when the
  // picture itself changed, so a text edit never makes every device download the pictures again.
  const mediaIds = pack.items.map(item => `intelmedia:${item.id}`), knownHash = new Map<string, string>();
  for (let at = 0; at < mediaIds.length; at += 200) {
    const { data } = await admin.from("annotations").select("id, data->>hash").eq("user_id", userId).in("id", mediaIds.slice(at, at + 200));
    for (const row of (data ?? []) as { id: string; hash: string | null }[]) knownHash.set(row.id, row.hash ?? "");
  }
  const mediaRows = pack.items.flatMap(item => {
    // A cover judged unrelated or unreadable is withdrawn (the row is marked deleted, so every device drops it).
    if (item.coverOff) return knownHash.has(`intelmedia:${item.id}`) ? [{ user_id: userId, id: `intelmedia:${item.id}`, document_id: "__intel__", data: {}, deleted: true, updated_at: now }] : [];
    if (!item.cover) return [];
    const hash = createHash("sha1").update(item.cover).digest("hex");
    return knownHash.get(`intelmedia:${item.id}`) === hash ? [] : [{ user_id: userId, id: `intelmedia:${item.id}`, document_id: "__intel__", data: { cover: item.cover, hash }, deleted: false, updated_at: now }];
  });
  const rows = [
    ...pack.items.map(({ cover, ...item }) => ({ user_id: userId, id: `intel:${item.id}`, document_id: "__intel__", data: { ...item, hasCover: item.coverOff ? undefined : Boolean(cover) || knownHash.has(`intelmedia:${item.id}`) || item.hasCover || undefined, addedAt: item.addedAt ?? now, updatedAt: now }, deleted: false, updated_at: now })),
    ...mediaRows,
    ...(pack.briefs ?? []).map(brief => ({ user_id: userId, id: `intelbrief:${brief.id}`, document_id: "__intel__", data: { ...brief, updatedAt: now }, deleted: false, updated_at: now }))
  ];
  // A glossary merges with the one already in the account rather than replacing it.
  const glossary = rows.find(row => row.id === "intelbrief:__glossary__");
  if (glossary) {
    const { data } = await admin.from("annotations").select("data").eq("user_id", userId).eq("id", "intelbrief:__glossary__").maybeSingle();
    try { const before = JSON.parse((data?.data as { body?: string } | null)?.body ?? "[]"), after = JSON.parse((glossary.data as { body: string }).body); (glossary.data as { body: string }).body = JSON.stringify([...new Map([...before, ...after].map((term: { term: string }) => [term.term, term])).values()]); } catch { /* the new glossary alone */ }
  }
  for (let at = 0; at < rows.length; at += 200) {
    const { error } = await admin.from("annotations").upsert(rows.slice(at, at + 200), { onConflict: "user_id,id" });
    if (error) return Response.json({ error: "write failed", written: at }, { status: 502 });
  }
  return Response.json({ ok: true, items: pack.items.length, briefs: pack.briefs?.length ?? 0 });
}
