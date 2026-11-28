import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getPublicSupabaseEnv } from "@/lib/env";

const PUBLIC_PATHS = ["/login", "/forgot-password", "/auth", "/setup", "/offline", "/api/avatar"];

/**
 * Refreshes the Supabase session cookie on every request and sends signed-out
 * visitors to /login. Role checks happen on the server in each page/action
 * (and in the database via RLS) — never here alone.
 */
export async function proxy(request: NextRequest) {
  const { url, key, configured } = getPublicSupabaseEnv();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!configured) {
    if (isPublic) return NextResponse.next();
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  if (!signedIn && !isPublic && !path.startsWith("/api/")) {
    const login = new URL("/login", request.url);
    if (path !== "/") login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }
  if (signedIn && path === "/login" && !request.nextUrl.searchParams.has("reason")) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|apple-touch-icon.png|manifest.webmanifest|sw.js|robots.txt|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
