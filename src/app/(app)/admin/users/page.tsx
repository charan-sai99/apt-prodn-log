import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasAdminKey } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import type { Profile } from "@/lib/types";
import { UsersManager } from "./users-manager";

export const metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const { userId } = await requireRole("admin");
  const supabase = await createClient();
  const [{ data: profiles }, { data: asg }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, employee_code, role, is_active, created_at").order("is_active", { ascending: false }).order("display_name"),
    supabase.from("machine_assignments").select("operator_id, machine:machines(machine_code)").eq("is_active", true),
  ]);
  const machinesByUser: Record<string, string[]> = {};
  for (const a of (asg ?? []) as unknown as { operator_id: string; machine: { machine_code: string } | null }[]) {
    if (a.machine) (machinesByUser[a.operator_id] ??= []).push(a.machine.machine_code);
  }
  const users = ((profiles ?? []) as Profile[]).filter((p) => p.role !== "customer");

  return (
    <div>
      <PageHeader title="Users" description="Create individual accounts, set roles and deactivate leavers. Records are never deleted." />
      {!hasAdminKey() && (
        <Alert variant="warning" className="mb-4" title="Server secret key not configured">
          Set SUPABASE_SECRET_KEY in the server environment to create accounts, reset passwords and block sign-in for deactivated users.
        </Alert>
      )}
      <UsersManager users={users} machinesByUser={machinesByUser} currentUserId={userId} />
    </div>
  );
}
