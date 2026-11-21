import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMachines } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { AssignmentsManager } from "./assignments-manager";

export const metadata = { title: "Machine assignments" };
export const dynamic = "force-dynamic";

export default async function AssignmentsPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const [machines, { data: ops }, { data: asg }] = await Promise.all([
    getMachines(supabase),
    supabase.from("profiles").select("id, display_name, employee_code").eq("role", "operator").eq("is_active", true).order("display_name"),
    supabase.from("machine_assignments").select("id, operator_id, machine_id, assigned_at").eq("is_active", true),
  ]);
  return (
    <div className="max-w-5xl">
      <PageHeader title="Machine assignments" description="Operators can only log production on machines assigned to them." />
      <AssignmentsManager
        machines={machines.map((m) => ({ id: m.id, code: m.machine_code }))}
        operators={(ops ?? []) as { id: string; display_name: string; employee_code: string | null }[]}
        assignments={(asg ?? []) as { id: string; operator_id: string; machine_id: string }[]}
      />
    </div>
  );
}
