import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseEnv } from "@/lib/env";

/**
 * Privileged client using the SECRET key. Server-only; used exclusively for
 * Supabase Auth admin operations (create user, ban/unban, set password) after
 * the caller has been verified as an active admin.
 */
export function createAdminClient() {
  const { url } = getPublicSupabaseEnv();
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error("SUPABASE_SECRET_KEY is not configured on the server.");
  }
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function hasAdminKey(): boolean {
  return Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
}
