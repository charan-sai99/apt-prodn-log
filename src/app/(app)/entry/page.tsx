import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getComponents, getMachines, getSettings, getShifts } from "@/lib/data";
import { factoryNow, operatorAllowedDates } from "@/lib/time";
import { Alert } from "@/components/ui/alert";
import type { CorrectionRequest, EntryRow, Machine } from "@/lib/types";
import { EntryForm } from "./entry-form";
import { TodayRecords } from "./today-records";

export const metadata: Metadata = { title: "Log production" };
export const dynamic = "force-dynamic";

export default async function EntryPage() {
  const { profile, userId } = await requireSession();
  const supabase = await createClient();
  const isOperator = profile.role === "operator";

  const [settings, shifts, components] = await Promise.all([
    getSettings(supabase),
    getShifts(supabase),
    getComponents(supabase),
  ]);

  // Machines available to this user, plus (for staff) operators to record for.
  let machines: Machine[] = [];
  let operators: { id: string; display_name: string; employee_code: string | null; machineIds: string[] }[] = [];
  if (isOperator) {
    const { data } = await supabase
      .from("machine_assignments")
      .select("machine:machines(*)")
      .eq("operator_id", userId)
      .eq("is_active", true);
    machines = ((data ?? []) as unknown as { machine: Machine | null }[])
      .map((r) => r.machine)
      .filter((m): m is Machine => Boolean(m?.is_active))
      .sort((a, b) => a.sort_order - b.sort_order);
  } else {
    machines = await getMachines(supabase);
    const [{ data: ops }, { data: asg }] = await Promise.all([
      supabase.from("profiles").select("id, display_name, employee_code").eq("role", "operator").eq("is_active", true).order("display_name"),
      supabase.from("machine_assignments").select("operator_id, machine_id").eq("is_active", true),
    ]);
    operators = (ops ?? []).map((o) => ({
      ...(o as { id: string; display_name: string; employee_code: string | null }),
      machineIds: (asg ?? []).filter((a) => a.operator_id === o.id).map((a) => a.machine_id as string),
    }));
  }

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
  const [{ data: recent }, { data: pending }] = await Promise.all([
    recentQuery,
    supabase.from("correction_requests").select("*").eq("requested_by", userId).eq("status", "pending"),
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
        {entries.length > 0 && <TodayRecords entries={entries} pendingByEntry={pendingByEntry} components={components} today={now.date} />}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <EntryForm
        operatorName={profile.display_name}
        operatorCode={profile.employee_code}
        isOperator={isOperator}
        machines={machines.map((m) => ({ id: m.id, code: m.machine_code, name: m.machine_name }))}
        operators={operators}
        components={components.map((c) => ({ id: c.id, component_name: c.component_name, component_code: c.component_code }))}
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
      <TodayRecords entries={entries} pendingByEntry={pendingByEntry} components={components} today={now.date} />
    </div>
  );
}
