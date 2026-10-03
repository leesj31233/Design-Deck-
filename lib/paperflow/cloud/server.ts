import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { BETA_QUOTA_BYTES, cloudAnonKey, cloudEnabled, cloudUrl, isOwnerEmail, type AccountPlan } from "./config";

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

/** Storage plan of a user: owners keep PDFs locally without a quota; everyone else uploads within the beta quota. */
export async function accountPlan(user: User): Promise<AccountPlan> {
  const owner = isOwnerEmail(user.email);
  const db = adminClient();
  let usedBytes = 0, quotaBytes: number | null = BETA_QUOTA_BYTES, mode: AccountPlan["mode"] = "cloud";
  if (db) {
    const [{ data: used }, { data: profile }] = await Promise.all([db.rpc("storage_used_bytes", { uid: user.id }), db.from("profiles").select("storage_quota_bytes, storage_mode").eq("id", user.id).maybeSingle()]);
    usedBytes = Number(used ?? 0);
    if (profile) { quotaBytes = profile.storage_quota_bytes === null ? null : Number(profile.storage_quota_bytes); mode = profile.storage_mode === "local" ? "local" : "cloud"; }
  }
  return owner ? { mode: "local", quotaBytes: null, usedBytes, owner } : { mode, quotaBytes, usedBytes, owner };
}
