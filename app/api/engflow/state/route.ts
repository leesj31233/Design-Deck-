import { getDb } from "@/engflow/server/db/client";
import { fail, json, PayloadError, readJson, requireLearner } from "@/engflow/server/http";
import { applySync, deleteLearner, loadState, SyncError, syncSchema } from "@/engflow/server/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const who = requireLearner(req);
  if (who instanceof Response) return who;
  const db = await getDb();
  if (!db) return fail(503, "no_database", "서버 데이터베이스가 설정되지 않았습니다.");
  return json({ state: await loadState(db.db, who.id) });
}

export async function POST(req: Request) {
  const who = requireLearner(req);
  if (who instanceof Response) return who;
  const db = await getDb();
  if (!db) return fail(503, "no_database", "서버 데이터베이스가 설정되지 않았습니다.");
  try {
    const parsed = syncSchema.safeParse(await readJson(req, 8_000_000));
    if (!parsed.success) return fail(400, "invalid_payload", `동기화 데이터 형식 오류: ${parsed.error.issues[0]?.path.join(".")}`);
    await applySync(db.db, who.id, parsed.data);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof PayloadError || e instanceof SyncError) return fail(400, "invalid_payload", e.message);
    console.error("EngFlow sync failed", e);
    return fail(500, "sync_failed", "저장하지 못했습니다.");
  }
}

export async function DELETE(req: Request) {
  const who = requireLearner(req);
  if (who instanceof Response) return who;
  const db = await getDb();
  if (!db) return fail(503, "no_database", "서버 데이터베이스가 설정되지 않았습니다.");
  await deleteLearner(db.db, who.id);
  return json({ ok: true });
}
