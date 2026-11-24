import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasAdminKey } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import type { Profile } from "@/lib/types";
import { UsersManager, type PinStatus } from "./users-manager";

export const metadata = { title: "Users" };
export const dynamic = "force-dynamic";

const COLS = "id, display_name, employee_code, role, is_active, created_at";

export default async function UsersPage() {
  const { userId } = await requireRole("admin");
  const supabase = await createClient();
  const [profilesRes, { data: asg }, pins, photos] = await Promise.all([
    supabase.from("profiles").select(`${COLS}, designation, display_order, show_on_login`)
      .order("is_active", { ascending: false }).order("display_order").order("display_name"),
    supabase.from("machine_assignments").select("operator_id, machine:machines(machine_code)").eq("is_active", true),
    supabase.rpc("profile_pin_status"),
    supabase.rpc("profile_photo_versions"),
  ]);
  // Before migration 0007 the new columns don't exist yet: fall back.
  const migrated = !profilesRes.error;
  const profiles = migrated
    ? profilesRes.data
    : (await supabase.from("profiles").select(COLS).order("is_active", { ascending: false }).order("display_name")).data;

  const machinesByUser: Record<string, string[]> = {};
  for (const a of (asg ?? []) as unknown as { operator_id: string; machine: { machine_code: string } | null }[]) {
    if (a.machine) (machinesByUser[a.operator_id] ??= []).push(a.machine.machine_code);
  }
  const pinByUser: Record<string, PinStatus> = Object.fromEntries(
    ((pins.data ?? []) as (PinStatus & { profile_id: string })[]).map((p) => [p.profile_id, p]),
  );
  const photoByUser: Record<string, number> = Object.fromEntries(
    ((photos.data ?? []) as { profile_id: string; photo_version: number }[]).map((p) => [p.profile_id, Number(p.photo_version)]),
  );
  const users = ((profiles ?? []) as Profile[]).filter((p) => p.role !== "customer");

  return (
    <div>
      <PageHeader
        title="People"
        description="Operators and supervisors sign in by tapping their photo and entering a 4-digit PIN that only you set. Administrators use email and password."
      />
      {!migrated && (
        <Alert variant="warning" className="mb-4" title="Photo + PIN sign-in not set up yet">
          Run migration 0007 in the Supabase SQL Editor to enable photos and PINs.
        </Alert>
      )}
      {!hasAdminKey() && (
        <Alert variant="warning" className="mb-4" title="Server secret key not configured">
          Set SUPABASE_SECRET_KEY in the server environment to create accounts and let people sign in with PINs.
        </Alert>
      )}
      <UsersManager users={users} machinesByUser={machinesByUser} pinByUser={pinByUser} photoByUser={photoByUser} currentUserId={userId} pinsEnabled={migrated} />
    </div>
  );
}
