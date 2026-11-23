import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/types";
import { getSettings } from "@/lib/data";

export interface SessionContext {
  userId: string;
  email: string | null;
  profile: Profile & { role: Role };
}

/**
 * Loads the signed-in user and their profile from the database. The role
 * always comes from public.profiles — never from the browser.
 * Returns null for signed-out users, inactive accounts and roles without
 * Production Log access (e.g. Stock Portal customers).
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();
  // getClaims() verifies the session token's signature locally (using the
  // project's cached public signing keys) instead of a round trip to Supabase
  // Auth on every page. Projects on legacy shared-secret keys fall back to a
  // server check automatically.
  const { data: claimsData, error } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (error || !userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, employee_code, role, is_active, created_at")
    .eq("id", userId)
    .maybeSingle<Profile>();

  if (!profile || !profile.is_active) return null;
  if (!["operator", "supervisor", "admin"].includes(profile.role)) return null;

  return {
    userId,
    email: typeof claimsData.claims.email === "string" ? claimsData.claims.email : null,
    profile: profile as Profile & { role: Role },
  };
});

export async function requireSession(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect("/login?reason=no-access");
  return session;
}

export async function requireRole(...roles: Role[]): Promise<SessionContext> {
  const session = await requireSession();
  if (!roles.includes(session.profile.role)) redirect("/?denied=1");
  return session;
}

export function homeFor(role: Role): string {
  return role === "operator" ? "/entry" : "/dashboard";
}

export const isStaff = (role: Role) => role === "supervisor" || role === "admin";

/**
 * Everything most pages need first, fetched in parallel: the signed-in user
 * (and role check) and the factory settings. Saves a full database round trip
 * per page compared with doing them one after the other.
 */
export async function pageContext(...roles: Role[]) {
  const supabase = await createClient();
  const [session, settings] = await Promise.all([
    roles.length ? requireRole(...roles) : requireSession(),
    getSettings(supabase),
  ]);
  return { session, settings, supabase };
}
