import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchEntries, getSettings } from "@/lib/data";
import { factoryNow, formatDisplayDate, formatHourSlot, lastNDays } from "@/lib/time";
import { dateRangeParam, type SearchParams } from "@/lib/params";
import { PageHeader } from "@/components/page-header";
import { DateRangeForm } from "@/components/date-range-form";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { formatQty } from "@/lib/utils";

export const metadata = { title: "My history" };
export const dynamic = "force-dynamic";

export default async function HistoryPage({ searchParams }: { searchParams: SearchParams }) {
  const { userId } = await requireRole("operator");
  const supabase = await createClient();
  const settings = await getSettings(supabase);
  const today = factoryNow(settings.timezone).date;
  const { from, to } = dateRangeParam(await searchParams, lastNDays(14, today));
  const { rows, truncated, error } = await fetchEntries(supabase, { from, to, status: "all", operatorSelf: userId }, 3000);

  const dates = [...new Set(rows.map((r) => r.production_date))];
  const total = rows.filter((r) => r.status === "active").reduce((s, r) => s + r.quantity, 0);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="My production history" description={`${formatQty(total)} pcs in ${rows.filter((r) => r.status === "active").length} entries`} />
      <Card className="mb-4 p-4">
        <DateRangeForm from={from} to={to} />
      </Card>
      {error && <Alert variant="error">Could not load history. Please try again.</Alert>}
      {truncated && <Alert variant="warning">Showing the most recent 3,000 entries. Narrow the date range to see more.</Alert>}
      {rows.length === 0 && !error && <p className="py-10 text-center text-muted">No entries in this period.</p>}
      <div className="space-y-4">
        {dates.map((d) => {
          const dayRows = rows.filter((r) => r.production_date === d);
          const dayTotal = dayRows.filter((r) => r.status === "active").reduce((s, r) => s + r.quantity, 0);
          return (
            <Card key={d} className="overflow-hidden">
              <div className="flex items-center justify-between bg-slate-50 px-4 py-2.5">
                <h2 className="text-sm font-bold text-navy-900">{formatDisplayDate(d)}</h2>
                <span className="text-sm font-bold tabular">{formatQty(dayTotal)} pcs</span>
              </div>
              <ul className="divide-y divide-line">
                {dayRows.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-muted tabular">
                        {formatHourSlot(r.hour_slot)} · {r.machine_code}
                        {r.shift ? ` · Shift ${r.shift}` : ""}
                      </p>
                      <p className="truncate text-sm font-semibold text-navy-900">{r.component_name}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold tabular ${r.status === "voided" ? "text-slate-400 line-through" : ""}`}>{formatQty(r.quantity)}</p>
                      {r.status === "voided" && <Badge variant="danger">Voided</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
