import { adminClient, currentUser, isAdmin } from "@/lib/paperflow/cloud/server";
import { isOwnerEmail } from "@/lib/paperflow/cloud/config";
import { PLANS, creditMonth, isPlanTier, type PlanTier } from "@/lib/paperflow/cloud/plans";

/** Admin only: every account with its plan, storage and this month's credits. */
async function guard(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "이 사이트에서만 사용할 수 있습니다." }, { status: 403 });
  const db = adminClient();
  if (!db) return Response.json({ error: "계정 서버가 설정되지 않았습니다." }, { status: 503 });
  if (!(await isAdmin(await currentUser()))) return Response.json({ error: "관리자만 볼 수 있습니다." }, { status: 403 });
  return db;
}

export async function GET(request: Request) {
  const db = await guard(request);
  if (db instanceof Response) return db;
  const users = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return Response.json({ error: "가입자 목록을 불러오지 못했습니다." }, { status: 502 });
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  const ids = users.map(user => user.id), month = creditMonth();
  const [{ data: profiles }, { data: credits }, { data: files }] = await Promise.all([
    db.from("profiles").select("id, plan").in("id", ids),
    db.from("credit_usage").select("user_id, used").eq("month", month).in("user_id", ids),
    db.from("documents").select("user_id, byte_length").not("storage_path", "is", null).in("user_id", ids)
  ]);
  const planOf = new Map((profiles ?? []).map(row => [row.id as string, row.plan as string]));
  const usedOf = new Map((credits ?? []).map(row => [row.user_id as string, Number(row.used)]));
  const bytesOf = new Map<string, number>();
  for (const row of files ?? []) bytesOf.set(row.user_id as string, (bytesOf.get(row.user_id as string) ?? 0) + Number(row.byte_length));
  const rows = users.map(user => {
    const owner = isOwnerEmail(user.email), stored = planOf.get(user.id), plan: PlanTier = owner ? "admin" : isPlanTier(stored) ? stored : "tester";
    return { id: user.id, email: user.email ?? "", owner, plan, confirmed: Boolean(user.email_confirmed_at), createdAt: user.created_at, lastSignInAt: user.last_sign_in_at ?? null,
      usedBytes: bytesOf.get(user.id) ?? 0, quotaBytes: PLANS[plan].storageBytes, creditsUsed: usedOf.get(user.id) ?? 0, creditsLimit: PLANS[plan].monthlyCredits };
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return Response.json({ users: rows, month });
}

/** Change one account's plan. Administrator e-mails are always Admin and cannot be changed here. */
export async function POST(request: Request) {
  const db = await guard(request);
  if (db instanceof Response) return db;
  let body: { userId?: unknown; plan?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "잘못된 요청입니다." }, { status: 400 }); }
  if (typeof body.userId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.userId) || !isPlanTier(body.plan)) return Response.json({ error: "계정이나 등급이 올바르지 않습니다." }, { status: 400 });
  const { data: target } = await db.auth.admin.getUserById(body.userId);
  if (!target?.user) return Response.json({ error: "계정을 찾지 못했습니다." }, { status: 404 });
  if (isOwnerEmail(target.user.email)) return Response.json({ error: "관리자 이메일의 등급은 바꿀 수 없습니다." }, { status: 400 });
  const { error } = await db.from("profiles").upsert({ id: body.userId, plan: body.plan, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) return Response.json({ error: "등급을 바꾸지 못했습니다." }, { status: 502 });
  return Response.json({ ok: true, plan: body.plan });
}
