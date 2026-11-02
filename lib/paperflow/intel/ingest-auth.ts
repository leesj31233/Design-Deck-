import { createHash, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const digest = (value: string) => createHash("sha256").update(value).digest();

/** The research routine's bearer token (INTEL_INGEST_TOKEN, set on the server, never in the code). */
export function ingestAuthorized(request: Request) {
  const expected = process.env.INTEL_INGEST_TOKEN, given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  // Compared as hashes so the comparison takes the same time whatever was sent.
  return Boolean(expected && expected.length >= 32 && given && timingSafeEqual(digest(expected), digest(given)));
}

/** The owner's account (the first of PAPERFLOW_OWNER_EMAILS): where intelligence is delivered. */
export async function ownerId(admin: SupabaseClient): Promise<string | null | "error"> {
  const owner = (process.env.PAPERFLOW_OWNER_EMAILS ?? "").split(",")[0]?.trim().toLowerCase();
  if (!owner) return null;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return "error";
    const found = data.users.find(user => user.email?.toLowerCase() === owner);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  return null;
}
