import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/types";

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
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, employee_code, role, is_active, created_at")
    .eq("id", userData.user.id)
    .maybeSingle<Profile>();

  if (!profile || !profile.is_active) return null;
  if (!["operator", "supervisor", "admin"].includes(profile.role)) return null;

  return {
    userId: userData.user.id,
    email: userData.user.email ?? null,
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
