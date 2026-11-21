import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMachines } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { MachinesManager } from "./machines-manager";

export const metadata = { title: "Machines" };
export const dynamic = "force-dynamic";

export default async function MachinesPage() {
  await requireRole("admin");
  const machines = await getMachines(await createClient(), true);
  return (
    <div className="max-w-4xl">
      <PageHeader title="Machines" description="Deactivate a machine instead of deleting it — its history stays intact." />
      <MachinesManager machines={machines} />
    </div>
  );
}
