import Link from "next/link";
import { Activity, Boxes, Clock, Factory, Users } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchEntries, getMachines, getSettings } from "@/lib/data";
import { summarize } from "@/lib/aggregate";
import { datesBetween, factoryNow, formatDisplayDate, formatHourSlot, isValidIsoDate, lastNDays } from "@/lib/time";
import { str, type SearchParams } from "@/lib/params";
import { PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { HorizontalBarChart, QuantityBarChart, TrendLineChart } from "@/components/charts";
import { LiveRefresh } from "@/components/live-refresh";
import { formatQty } from "@/lib/utils";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("supervisor", "admin");
  const supabase = await createClient();
  const settings = await getSettings(supabase);
  const now = factoryNow(settings.timezone);
  const sp = await searchParams;
  const dateParam = str(sp.date);
  const date = dateParam && isValidIsoDate(dateParam) && dateParam <= now.date ? dateParam : now.date;
  const isToday = date === now.date;

  const week = lastNDays(7, date);
  const [machines, { rows, error, truncated }, { data: assignments }] = await Promise.all([
    getMachines(supabase),
    fetchEntries(supabase, { from: week.from, to: week.to }),
    supabase.from("machine_assignments").select("machine_id, operator:profiles!machine_assignments_operator_id_fkey(display_name)").eq("is_active", true),
  ]);

  const dayRows = rows.filter((r) => r.production_date === date);
  const machineOrder = machines.map((m) => ({ code: m.machine_code, name: m.machine_name }));
  const day = summarize(dayRows, { machineOrder });
  const weekSummary = summarize(rows, { dates: datesBetween(week.from, week.to) });

  const operatorsByMachine = new Map<string, string[]>();
  for (const a of (assignments ?? []) as unknown as { machine_id: string; operator: { display_name: string } | null }[]) {
    if (!a.operator) continue;
    operatorsByMachine.set(a.machine_id, [...(operatorsByMachine.get(a.machine_id) ?? []), a.operator.display_name]);
  }

  const lastHourByMachine = new Map<string, number>();
  for (const r of dayRows) {
    if (r.status !== "active") continue;
    lastHourByMachine.set(r.machine_code, Math.max(lastHourByMachine.get(r.machine_code) ?? -1, r.hour_slot));
  }
  const hourData = isToday ? day.byHour.slice(0, now.hour + 1) : day.byHour;

  return (
    <div>
      <PageHeader
        title="Production dashboard"
        description={
          <span className="flex flex-wrap items-center gap-2">
            {formatDisplayDate(date)} · factory time ({settings.timezone}) {isToday && <LiveRefresh />}
          </span>
        }
        actions={
          <form method="get" className="flex items-end gap-2">
            <Input type="date" name="date" defaultValue={date} max={now.date} className="w-40" aria-label="Date" />
            <Button type="submit" variant="navy">Show</Button>
            {!isToday && <Button asChild variant="outline"><Link href="/dashboard">Today</Link></Button>}
          </form>
        }
      />
      {error && <Alert variant="error" className="mb-4">Could not load production data. Check the connection and refresh.</Alert>}
      {truncated && <Alert variant="warning" className="mb-4">Very large data volume — some rows were not included.</Alert>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={isToday ? "Production today" : "Production"} value={formatQty(day.totalQuantity)} sub="pieces" icon={<Boxes className="size-5" />} />
        <StatTile label="Hourly entries" value={formatQty(day.entryCount)} icon={<Clock className="size-5" />} />
        <StatTile label="Active operators" value={String(day.activeOperators)} sub="submitted entries" icon={<Users className="size-5" />} />
        <StatTile
          label="Machines producing"
          value={`${day.byMachine.filter((m) => m.quantity > 0).length} / ${machines.length}`}
          icon={<Factory className="size-5" />}
        />
      </div>

      <h2 className="mb-3 mt-6 text-sm font-bold uppercase tracking-wide text-muted">Machines</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {machines.map((m) => {
          const b = day.byMachine.find((x) => x.key === m.machine_code);
          const last = lastHourByMachine.get(m.machine_code);
          const stale = isToday && (last === undefined || now.hour - last >= 2);
          return (
            <Link key={m.id} href={`/records?machine=${m.machine_code}&from=${date}&to=${date}`}>
              <Card className="h-full p-4 transition-colors hover:border-brand">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-lg font-extrabold italic text-navy-900">{m.machine_code}</p>
                    <p className="text-xs text-muted">{m.machine_name}</p>
                  </div>
                  {isToday &&
                    (stale ? (
                      <Badge variant="warning">{last === undefined ? "No entries" : "Behind"}</Badge>
                    ) : (
                      <Badge variant="success"><Activity className="size-3" /> Logging</Badge>
                    ))}
                </div>
                <p className="mt-3 text-2xl font-bold tabular text-navy-900">{formatQty(b?.quantity ?? 0)}</p>
                <p className="text-xs text-muted">
                  {b?.entries ?? 0} entries{last !== undefined ? ` · last ${formatHourSlot(last)}` : ""}
                </p>
                <p className="mt-2 truncate text-xs text-muted">
                  Operators: {operatorsByMachine.get(m.id)?.join(", ") || "none assigned"}
                </p>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Hourly production</CardTitle>
            <CardDescription>Pieces per hour, all machines</CardDescription>
          </CardHeader>
          <CardContent><QuantityBarChart data={hourData} /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Machine comparison</CardTitle>
            <CardDescription>Pieces per machine</CardDescription>
          </CardHeader>
          <CardContent><QuantityBarChart data={day.byMachine} /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Production by component</CardTitle>
            <CardDescription>Top 10 components</CardDescription>
          </CardHeader>
          <CardContent>
            {day.byComponent.length ? <HorizontalBarChart data={day.byComponent.slice(0, 10)} /> : <p className="py-8 text-center text-sm text-muted">No production recorded.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Last 7 days</CardTitle>
            <CardDescription>Total pieces per day</CardDescription>
          </CardHeader>
          <CardContent><TrendLineChart data={weekSummary.byDate} /></CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>Operators</CardTitle></CardHeader>
        <CardContent>
          {day.byOperator.length === 0 ? (
            <p className="text-sm text-muted">No entries yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {day.byOperator.map((o) => (
                <li key={o.key} className="flex justify-between py-2 text-sm">
                  <span className="font-medium">{o.label}</span>
                  <span className="tabular"><strong>{formatQty(o.quantity)}</strong> <span className="text-muted">· {o.entries} entries</span></span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
