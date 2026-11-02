import { adminClient } from "@/lib/paperflow/cloud/server";
import { PAPER_BUCKET, paperPath } from "@/lib/paperflow/cloud/config";
import { ingestAuthorized, ownerId } from "@/lib/paperflow/intel/ingest-auth";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_PDF = 60 * 1024 * 1024;
/** Where the routine's PDFs are filed in the archive, so they don't crowd the reading list. */
const FOLDER = { id: "f-intel-pdf", name: "인텔리전스 PDF", icon: "globe", color: "#1f7a5a", createdAt: "2026-10-16T00:00:00.000Z" };

const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

/**
 * Puts a public PDF from the Intelligence tab into the owner's library, so an item opens straight in
 * the reader. Two steps: "prepare" returns a signed upload URL for the file (named by its SHA-256, the
 * library's own document id), the routine uploads the bytes to storage directly, then "register"
 * lists it as a paper (filed in the "인텔리전스 PDF" archive folder). Only the routine's token may call it;
 * a paper already in the library keeps its reading state.
 */
export async function POST(request: Request) {
  if (!ingestAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const admin = adminClient();
  if (!admin || !process.env.PAPERFLOW_OWNER_EMAILS) return Response.json({ error: "server not configured" }, { status: 503 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }
  const id = typeof body.id === "string" && /^[a-f0-9]{64}$/.test(body.id) ? body.id : null;
  const byteLength = typeof body.byteLength === "number" && Number.isInteger(body.byteLength) && body.byteLength > 0 && body.byteLength <= MAX_PDF ? body.byteLength : null;
  if (!id || !byteLength) return Response.json({ error: "id and byteLength required" }, { status: 400 });
  const userId = await ownerId(admin);
  if (userId === "error") return Response.json({ error: "user lookup failed" }, { status: 502 });
  if (!userId) return Response.json({ error: "owner account not found" }, { status: 404 });
  const path = paperPath(userId, id);
  const { data: existing } = await admin.from("documents").select("id, storage_path").eq("user_id", userId).eq("id", id).maybeSingle();

  if (body.action === "prepare") {
    if (existing?.storage_path) return Response.json({ exists: true });
    const { data, error } = await admin.storage.from(PAPER_BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (error || !data) return Response.json({ error: "upload url failed" }, { status: 502 });
    return Response.json({ signedUrl: data.signedUrl });
  }

  if (body.action === "register") {
    const pageCount = typeof body.pageCount === "number" && Number.isInteger(body.pageCount) && body.pageCount > 0 && body.pageCount < 5000 ? body.pageCount : null;
    const filename = text(body.filename, 120), title = text(body.title, 300);
    if (!pageCount || !/\.pdf$/i.test(filename) || !title) return Response.json({ error: "filename, title and pageCount required" }, { status: 400 });
    // The bytes must be in storage, at the size claimed.
    const { data: listed } = await admin.storage.from(PAPER_BUCKET).list(userId, { search: `${id}.pdf`, limit: 2 });
    const stored = listed?.find(entry => entry.name === `${id}.pdf`);
    if (!stored) return Response.json({ error: "file not uploaded" }, { status: 409 });
    if (existing) {
      if (!existing.storage_path) await admin.from("documents").update({ storage_path: path }).eq("user_id", userId).eq("id", id);
      return Response.json({ ok: true, id, existing: true });
    }
    const cover = typeof body.cover === "string" && /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(body.cover) && body.cover.length < 120_000 ? body.cover : undefined;
    const now = new Date().toISOString();
    const { error } = await admin.from("documents").upsert({
      user_id: userId, id, filename, title, byte_length: byteLength, page_count: pageCount, storage_path: path, archived: true, created_at: now, updated_at: now,
      metadata: { archiveFolder: FOLDER, currentPage: 1, researchPoolIds: [], authors: [], ...(cover ? { cover } : {}), keywords: ["intelligence"] }
    }, { onConflict: "user_id,id" });
    if (error) return Response.json({ error: "write failed" }, { status: 502 });
    return Response.json({ ok: true, id });
  }
  return Response.json({ error: "unknown action" }, { status: 400 });
}
