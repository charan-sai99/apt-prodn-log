import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getComponents, getMachines, getSettings, getShifts } from "@/lib/data";
import { factoryNow, operatorAllowedDates } from "@/lib/time";
import { Alert } from "@/components/ui/alert";
import type { CorrectionRequest, EntryRow, Machine } from "@/lib/types";
import { EntryForm } from "./entry-form";
import { TodayRecords } from "./today-records";
import { getPhotoVersions } from "@/lib/photo-versions";

export const metadata: Metadata = { title: "Log production" };
export const dynamic = "force-dynamic";

export default async function EntryPage() {
  const supabase = await createClient();
  // Two parallel rounds instead of four sequential ones (each round crosses
  // from the server to the database, so this is most of the page's time).
  const [{ profile, userId }, settings, shifts, components] = await Promise.all([
    requireSession(),
    getSettings(supabase),
    getShifts(supabase),
    getComponents(supabase),
  ]);
  const isOperator = profile.role === "operator";

  const now = factoryNow(settings.timezone);
  const allowedDates = isOperator
    ? operatorAllowedDates(settings.operator_backdate_days, settings.timezone)
    : operatorAllowedDates(Math.max(settings.operator_backdate_days, 6), settings.timezone);

  let recentQuery = supabase
    .from("production_entries_enriched")
    .select("*")
    .gte("production_date", allowedDates[allowedDates.length - 1]!)
    .order("production_date", { ascending: false })
    .order("hour_slot", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);
  recentQuery = isOperator ? recentQuery.eq("operator_id", userId) : recentQuery.eq("entered_by", userId);

  // Machines available to this user, plus (for staff) operators to record for.
  const loadMachines = async (): Promise<{
    machines: Machine[];
    operators: { id: string; display_name: string; employee_code: string | null; machineIds: string[] }[];
  }> => {
    if (isOperator) {
      const { data } = await supabase
        .from("machine_assignments")
        .select("machine:machines(*)")
        .eq("operator_id", userId)
        .eq("is_active", true);
      const machines = ((data ?? []) as unknown as { machine: Machine | null }[])
        .map((r) => r.machine)
        .filter((m): m is Machine => Boolean(m?.is_active))
        .sort((a, b) => a.sort_order - b.sort_order);
      return { machines, operators: [] };
    }
    const [machines, { data: ops }, { data: asg }] = await Promise.all([
      getMachines(supabase),
      supabase.from("profiles").select("id, display_name, employee_code").eq("role", "operator").eq("is_active", true).order("display_name"),
      supabase.from("machine_assignments").select("operator_id, machine_id").eq("is_active", true),
    ]);
    const operators = (ops ?? []).map((o) => ({
      ...(o as { id: string; display_name: string; employee_code: string | null }),
      machineIds: (asg ?? []).filter((a) => a.operator_id === o.id).map((a) => a.machine_id as string),
    }));
    return { machines, operators };
  };

  const [{ machines, operators }, { data: recent }, { data: pending }, photos] = await Promise.all([
    loadMachines(),
    recentQuery,
    supabase.from("correction_requests").select("*").eq("requested_by", userId).eq("status", "pending"),
    getPhotoVersions(),
  ]);
  const entries = (recent ?? []) as EntryRow[];
  const pendingByEntry = Object.fromEntries(
    ((pending ?? []) as CorrectionRequest[]).map((p) => [p.production_entry_id, p]),
  );

  if (machines.length === 0) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-2xl font-bold text-navy-900">Log production</h1>
        <Alert variant="warning" title="No machine assigned">
          {isOperator
            ? "You are not assigned to any machine yet. Ask your administrator to assign you before logging production."
            : "There are no active machines. Add or activate machines under Admin → Machines."}
        </Alert>
        {entries.length > 0 && <TodayRecords entries={entries} pendingByEntry={pendingByEntry} components={components} today={now.date} photos={photos} />}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <EntryForm
        operatorId={userId}
        photos={photos}
        operatorName={profile.display_name}
        operatorCode={profile.employee_code}
        isOperator={isOperator}
        machines={machines.map((m) => ({ id: m.id, code: m.machine_code, name: m.machine_name }))}
        operators={operators}
        components={components.map((c) => ({ id: c.id, component_name: c.component_name, component_code: c.component_code, raw_material: c.raw_material }))}
        shifts={shifts}
        allowedDates={allowedDates}
        timezone={settings.timezone}
        maxQuantity={settings.max_quantity_per_entry}
        existing={entries.map((e) => ({
          machineId: e.machine_id,
          componentId: e.component_id,
          date: e.production_date,
          hour: e.hour_slot,
          status: e.status,
          quantity: e.quantity,
          operatorId: e.operator_id,
        }))}
      />
      <TodayRecords entries={entries} pendingByEntry={pendingByEntry} components={components} today={now.date} photos={photos} />
    </div>
  );
}
