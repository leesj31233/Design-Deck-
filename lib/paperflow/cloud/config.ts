/**
 * Cloud library configuration. Everything comes from environment variables; nothing secret is in
 * the source. Without NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY the app runs as
 * before: a local library in this browser, no account.
 */
export const cloudUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const cloudAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const cloudEnabled = Boolean(cloudUrl && cloudAnonKey);

/** Beta quota for PDFs kept in the cloud. */
export const BETA_QUOTA_BYTES = 200 * 1024 * 1024;
export const PAPER_BUCKET = "papers";

export type StorageMode = "cloud" | "local";
/** What an account may store: cloud accounts upload PDFs within a quota, local accounts keep PDFs on the device. */
export interface AccountPlan { mode: StorageMode; quotaBytes: number | null; usedBytes: number; owner: boolean }

/** Owner accounts (PAPERFLOW_OWNER_EMAILS, comma separated, server only): local storage, no quota. */
export function isOwnerEmail(email: string | undefined | null, list = process.env.PAPERFLOW_OWNER_EMAILS ?? "") {
  if (!email) return false;
  return list.split(",").map(item => item.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}

export const paperPath = (userId: string, documentId: string) => `${userId}/${documentId}.pdf`;
