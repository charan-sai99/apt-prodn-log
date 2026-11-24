import "server-only";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";
import type { RosterEntry } from "@/lib/pin-login";

/** People shown on the sign-in screen. Read with the server key (the page is public). */
export async function getLoginRoster(): Promise<{ roster: RosterEntry[]; error?: string }> {
  if (!hasAdminKey()) return { roster: [], error: "not_configured" };
  const { data, error } = await createAdminClient().rpc("login_roster");
  if (error) return { roster: [], error: /login_roster/.test(error.message) ? "not_migrated" : "unavailable" };
  return {
    roster: ((data ?? []) as RosterEntry[]).map((r) => ({ ...r, photo_version: r.photo_version ? Number(r.photo_version) : null })),
  };
}
