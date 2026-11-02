/**
 * Cloud library configuration. Everything comes from environment variables; nothing secret is in
 * the source. Without NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY the app runs as
 * before: a local library in this browser, no account.
 */
export const cloudUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const cloudAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const cloudEnabled = Boolean(cloudUrl && cloudAnonKey);
/** Google sign-in shows only once the Google provider is configured in Supabase (NEXT_PUBLIC_PAPERFLOW_GOOGLE=1). */
export const googleEnabled = process.env.NEXT_PUBLIC_PAPERFLOW_GOOGLE === "1";

export const PAPER_BUCKET = "papers";

export type StorageMode = "cloud" | "local";
/** An account's plan: storage (cloud within a quota, or PDFs on the device) and this month's translation credits. */
export interface AccountPlan {
  tier: import("./plans").PlanTier; mode: StorageMode; quotaBytes: number | null; usedBytes: number; owner: boolean;
  credits: { used: number; limit: number | null; month: string };
}

/** Administrator accounts (PAPERFLOW_OWNER_EMAILS, comma separated, server only): no limits, the admin page. */
export function isOwnerEmail(email: string | undefined | null, list = process.env.PAPERFLOW_OWNER_EMAILS ?? "") {
  if (!email) return false;
  return list.split(",").map(item => item.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}

export const paperPath = (userId: string, documentId: string) => `${userId}/${documentId}.pdf`;
