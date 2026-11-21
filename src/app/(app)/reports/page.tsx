import { Download, FileSpreadsheet } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchEntries, getSettings } from "@/lib/data";
import { summarize, type Bucket } from "@/lib/aggregate";
import { datesBetween, factoryNow, formatDisplayDate, isValidIsoDate, periodRange, type ReportPeriod } from "@/lib/time";
import { parseRecordFilters, filtersToQuery } from "@/lib/filters";
import { str, type SearchParams } from "@/lib/params";
import { getFilterLookups } from "@/lib/staff-lookups";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { StatTile } from "@/components/stat-tile";
import { Table, TD, TH, THead, EmptyRow } from "@/components/ui/table";
import { QuantityBarChart } from "@/components/charts";
import { formatQty } from "@/lib/utils";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

function BucketTable({ title, buckets, total, nameHeader }: { title: string; buckets: Bucket[]; total: number; nameHeader: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <Table>
        <THead><tr><TH>{nameHeader}</TH><TH className="text-right">Quantity</TH><TH className="text-right">Entries</TH><TH className="text-right">Share</TH></tr></THead>
        <tbody>
          {buckets.length === 0 && <EmptyRow colSpan={4}>No data.</EmptyRow>}
          {buckets.map((b) => (
            <tr key={b.key}>
              <TD className="font-medium">{b.label}</TD>
              <TD className="text-right font-bold tabular">{formatQty(b.quantity)}</TD>
              <TD className="text-right tabular">{b.entries}</TD>
              <TD className="text-right tabular text-muted">{total ? `${((b.quantity / total) * 100).toFixed(1)}%` : "—"}</TD>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("supervisor", "admin");
  const supabase = await createClient();
  const settings = await getSettings(supabase);
  const today = factoryNow(settings.timezone).date;
  const sp = await searchParams;
  const period = (["daily", "weekly", "monthly"].includes(str(sp.period) ?? "") ? str(sp.period) : "daily") as ReportPeriod;
  const anchorRaw = str(sp.anchor);
  const anchor = anchorRaw && isValidIsoDate(anchorRaw) ? anchorRaw : today;
  const range = periodRange(period, anchor);
  const filters = { ...parseRecordFilters({ ...sp, from: range.from, to: range.to }, range), status: "active" as const };

  const [lookups, { rows, error, truncated }] = await Promise.all([getFilterLookups(supabase), fetchEntries(supabase, filters)]);
  const s = summarize(rows, {
    machineOrder: lookups.machines.filter((m) => m.is_active).map((m) => ({ code: m.machine_code, name: m.machine_name })),
    dates: datesBetween(range.from, range.to),
  });
  const qs = filtersToQuery({ machine: filters.machine, operator: filters.operator, component: filters.component, shift: filters.shift }, { period, anchor });

  return (
    <div>
      <PageHeader
        title="Production reports"
        description={`${formatDisplayDate(range.from)}${range.from !== range.to ? ` – ${formatDisplayDate(range.to)}` : ""}`}
        actions={
          <>
            <Button asChild variant="outline"><a href={`/api/export?${qs}&format=csv`}><Download /> CSV</a></Button>
            <Button asChild><a href={`/api/export?${qs}&format=xlsx`}><FileSpreadsheet /> Excel report</a></Button>
          </>
        }
      />
      <Card className="mb-4 p-4">
        <form method="get" className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <div className="space-y-1">
            <Label htmlFor="period">Period</Label>
            <NativeSelect id="period" name="period" defaultValue={period}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly (Mon–Sun)</option>
              <option value="monthly">Monthly</option>
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="anchor">Date in period</Label>
            <Input id="anchor" type="date" name="anchor" defaultValue={anchor} max={today} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="machine">Machine</Label>
            <NativeSelect id="machine" name="machine" defaultValue={filters.machine ?? ""}>
              <option value="">All machines</option>
              {lookups.machines.map((m) => <option key={m.id} value={m.machine_code}>{m.machine_code}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="shift">Shift</Label>
            <NativeSelect id="shift" name="shift" defaultValue={filters.shift ?? ""}>
              <option value="">All shifts</option>
              {lookups.shifts.map((x) => <option key={x.code} value={x.code}>{x.code}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="operator">Operator</Label>
            <NativeSelect id="operator" name="operator" defaultValue={filters.operator ?? ""}>
              <option value="">All operators</option>
              {lookups.operators.map((o) => <option key={o.id} value={o.id}>{o.display_name}</option>)}
            </NativeSelect>
          </div>
          <div className="flex items-end">
            <Button type="submit" variant="navy" className="w-full">Run report</Button>
          </div>
        </form>
      </Card>
      {error && <Alert variant="error" className="mb-4">Could not load data.</Alert>}
      {truncated && <Alert variant="warning" className="mb-4">Report limited to 20,000 records.</Alert>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total quantity" value={formatQty(s.totalQuantity)} sub="pieces" />
        <StatTile label="Hourly entries" value={formatQty(s.entryCount)} />
        <StatTile label="Operators" value={String(s.activeOperators)} />
        <StatTile label="Components" value={String(s.byComponent.length)} />
      </div>

      {period !== "daily" && (
        <Card className="mt-4">
          <CardHeader><CardTitle>Daily totals</CardTitle></CardHeader>
          <CardContent><QuantityBarChart data={s.byDate.map((b) => ({ ...b, label: b.key.slice(5) }))} /></CardContent>
        </Card>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <BucketTable title="Machine-wise" nameHeader="Machine" buckets={s.byMachine} total={s.totalQuantity} />
        <BucketTable title="Operator-wise" nameHeader="Operator" buckets={s.byOperator} total={s.totalQuantity} />
        <BucketTable title="Shift-wise" nameHeader="Shift" buckets={s.byShift} total={s.totalQuantity} />
        <BucketTable title="Component-wise" nameHeader="Component" buckets={s.byComponent} total={s.totalQuantity} />
      </div>
    </div>
  );
}
