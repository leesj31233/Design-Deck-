import { accountPlan, adminClient, currentUser } from "@/lib/paperflow/cloud/server";
import { PAPER_BUCKET, paperPath } from "@/lib/paperflow/cloud/config";

/**
 * A signed upload URL for one PDF, issued only after the quota check. Users have no direct insert
 * permission on the bucket, so this route is the only way a file gets into cloud storage.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "이 사이트에서만 사용할 수 있습니다." }, { status: 403 });
  const user = await currentUser(), admin = adminClient();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!admin) return Response.json({ error: "클라우드 저장소가 아직 설정되지 않았습니다." }, { status: 503 });
  let body: { documentId?: unknown; byteLength?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "잘못된 요청입니다." }, { status: 400 }); }
  const documentId = typeof body.documentId === "string" && /^[a-f0-9]{64}$/.test(body.documentId) ? body.documentId : null;
  const byteLength = typeof body.byteLength === "number" && Number.isFinite(body.byteLength) && body.byteLength > 0 ? body.byteLength : null;
  if (!documentId || !byteLength) return Response.json({ error: "문서 정보가 올바르지 않습니다." }, { status: 400 });
  const plan = await accountPlan(user);
  if (plan.mode === "local") return Response.json({ error: "이 계정은 PDF를 기기에 저장합니다.", mode: "local" }, { status: 409 });
  // A re-upload of the same paper does not count twice.
  const { data: existing } = await admin.from("documents").select("byte_length, storage_path").eq("user_id", user.id).eq("id", documentId).maybeSingle();
  const already = existing?.storage_path ? Number(existing.byte_length) : 0;
  if (plan.quotaBytes !== null && plan.usedBytes - already + byteLength > plan.quotaBytes) {
    return Response.json({ error: `저장 공간이 부족하다 (${Math.round(plan.usedBytes / 1048576)}MB / ${Math.round(plan.quotaBytes / 1048576)}MB).`, plan }, { status: 413 });
  }
  const path = paperPath(user.id, documentId);
  const { data, error } = await admin.storage.from(PAPER_BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error || !data) return Response.json({ error: "업로드 주소를 만들지 못했습니다." }, { status: 502 });
  return Response.json({ path, token: data.token, plan });
}
