import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cloudAnonKey, cloudEnabled, cloudUrl, isOwnerEmail, type AccountPlan, type StorageMode } from "./config";
import { PLANS, creditMonth, isPlanTier, type PlanTier } from "./plans";

/** Route-handler client acting as the signed-in user (row level security applies). */
export async function userClient(): Promise<SupabaseClient | null> {
  if (!cloudEnabled) return null;
  const store = await cookies();
  return createServerClient(cloudUrl, cloudAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: items => { try { for (const { name, value, options } of items) store.set(name, value, options); } catch { /* Read-only in some contexts; the browser refreshes the session. */ } }
    }
  });
}

let admin: SupabaseClient | null | undefined;
/** Service-role client for server-only work (quota checks, signed upload URLs, the shared cache). */
export function adminClient(): SupabaseClient | null {
  if (admin !== undefined) return admin;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  admin = cloudEnabled && key ? createClient(cloudUrl, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return admin;
}

export async function currentUser(): Promise<User | null> {
  const supabase = await userClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/**
 * A user's plan. New accounts are Testers; the administrator sets Basic / Pro / Admin on the admin
 * page. Administrator e-mails (PAPERFLOW_OWNER_EMAILS) are always Admin: no storage or credit limit.
 */
export async function accountPlan(user: User): Promise<AccountPlan> {
  const owner = isOwnerEmail(user.email), db = adminClient(), month = creditMonth();
  let usedBytes = 0, creditsUsed = 0, tier: PlanTier = owner ? "admin" : "tester", mode: StorageMode = "cloud";
  if (db) {
    const [{ data: used }, { data: profile }, { data: credit }] = await Promise.all([
      db.rpc("storage_used_bytes", { uid: user.id }),
      db.from("profiles").select("plan, storage_mode").eq("id", user.id).maybeSingle(),
      db.from("credit_usage").select("used").eq("user_id", user.id).eq("month", month).maybeSingle()
    ]);
    usedBytes = Number(used ?? 0); creditsUsed = Number(credit?.used ?? 0);
    if (!owner && isPlanTier(profile?.plan)) tier = profile.plan;
    if (!owner && profile?.storage_mode === "local") mode = "local";
  }
  const spec = PLANS[tier];
  return { tier, mode, quotaBytes: spec.storageBytes, usedBytes, owner: owner || tier === "admin", credits: { used: creditsUsed, limit: spec.monthlyCredits, month } };
}

export async function isAdmin(user: User | null) {
  if (!user) return false;
  if (isOwnerEmail(user.email)) return true;
  const { data } = await adminClient()?.from("profiles").select("plan").eq("id", user.id).maybeSingle() ?? { data: null };
  return data?.plan === "admin";
}

/**
 * Credit gate for an AI request that would cost `amount` credits. Returns a refusal Response when
 * the month's credits would run out, otherwise `charge(spent)` to record what was actually used.
 * Without cloud accounts (local development) nothing is counted.
 */
export async function creditGate(amount: number): Promise<Response | { charge: (spent: number) => Promise<void> }> {
  const free = { charge: async () => undefined };
  if (!cloudEnabled || !adminClient()) return free;
  const user = await currentUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다. 다시 로그인해 주세요.", kind: "auth" }, { status: 401 });
  const plan = await accountPlan(user), { used, limit, month } = plan.credits;
  if (limit !== null && used + amount > limit) return Response.json({ error: `이번 달 번역 크레딧을 모두 사용했습니다 (${used.toLocaleString()} / ${limit.toLocaleString()}문단). 다음 달 1일에 다시 채워집니다.`, kind: "quota", credits: plan.credits }, { status: 402 });
  return { charge: async spent => { if (spent > 0) await adminClient()!.rpc("consume_credits", { uid: user.id, period: month, amount: spent }); } };
}
