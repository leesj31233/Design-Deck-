import { NextResponse } from "next/server";
import { userClient } from "@/lib/paperflow/cloud/server";

/** Google sign-in and the email sign-in link return here with a one-time code; exchange it for a session cookie. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  // Only same-site paths: never redirect to an address taken from the query string.
  const next = url.searchParams.get("next") ?? "/library";
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/library";
  const supabase = await userClient();
  if (!code || !supabase) return NextResponse.redirect(new URL("/login?auth=unavailable", url.origin));
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  // A link opened in another browser has no PKCE verifier here: the login page offers the email's code instead.
  return NextResponse.redirect(new URL(error ? `/login?auth=failed&next=${encodeURIComponent(target)}` : target, url.origin));
}
