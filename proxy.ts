import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * The account gate. With cloud accounts configured, the library and reader open only after sign-in:
 * everyone else lands on /login, and a signed-in visitor to /login goes straight to the library.
 * The session cookie is refreshed here on the way through. Without cloud config nothing is gated.
 */
export async function proxy(request: NextRequest) {
  if (!url || !anonKey) return NextResponse.next();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: items => {
        for (const { name, value } of items) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of items) response.cookies.set(name, value, options);
      }
    }
  });
  // Verifies the session token (locally when the project signs with asymmetric keys).
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub), path = request.nextUrl.pathname;
  const redirect = (to: URL) => { const next = NextResponse.redirect(to); for (const cookie of response.cookies.getAll()) next.cookies.set(cookie); return next; };
  if (path === "/login") {
    if (!signedIn) return response;
    const next = request.nextUrl.searchParams.get("next") ?? "/library";
    return redirect(new URL(next.startsWith("/") && !next.startsWith("//") && next !== "/login" ? next : "/library", request.url));
  }
  if (!signedIn) {
    const login = new URL("/login", request.url);
    if (path !== "/" && path !== "/library") login.searchParams.set("next", path + request.nextUrl.search);
    return redirect(login);
  }
  return response;
}

export const config = { matcher: ["/", "/login", "/library", "/reader/:path*"] };
