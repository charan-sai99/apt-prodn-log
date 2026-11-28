import { Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CorrectionDialog } from "@/components/correction-dialog";
import { PersonName } from "@/components/avatar";
import { formatDisplayDate, formatHourSlot } from "@/lib/time";
import type { Component, CorrectionRequest, EntryRow } from "@/lib/types";
import { formatQty } from "@/lib/utils";

export function TodayRecords({
  entries,
  pendingByEntry,
  components,
  today,
  photos = {},
}: {
  entries: EntryRow[];
  pendingByEntry: Record<string, CorrectionRequest>;
  components: Pick<Component, "id" | "component_name" | "component_code" | "raw_material">[];
  today: string;
  photos?: Record<string, number>;
}) {
  const dates = [...new Set(entries.map((e) => e.production_date))].sort().reverse();
  const todayTotal = entries.filter((e) => e.production_date === today && e.status === "active").reduce((s, e) => s + e.quantity, 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Recent submissions</CardTitle>
        <div className="text-right">
          <p className="text-xs text-muted">Today</p>
          <p className="text-lg font-bold text-navy-900 tabular">{formatQty(todayTotal)} pcs</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {entries.length === 0 && (
          <p className="flex items-center gap-2 py-6 text-sm text-muted">
            <Clock className="size-4" /> No entries yet. Your submitted records will appear here.
          </p>
        )}
        {dates.map((d) => (
          <section key={d}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {d === today ? "Today" : formatDisplayDate(d)}
            </h3>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {entries
                .filter((e) => e.production_date === d)
                .map((e) => {
                  const pending = pendingByEntry[e.id];
                  return (
                    <li key={e.id} className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-muted tabular">
                            {formatHourSlot(e.hour_slot)} · {e.machine_code}
                            {e.shift ? ` · Shift ${e.shift}` : ""}
                          </p>
                          <p className="truncate font-semibold text-navy-900">{e.component_name}</p>
                          {e.operator_name && e.entered_by !== e.operator_id && (
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                              Operator:
                              <PersonName id={e.operator_id} name={e.operator_name} version={e.operator_id ? photos[e.operator_id] : null} size={22} />
                            </p>
                          )}
                        </div>
                        <p className={`shrink-0 text-lg font-bold tabular ${e.status === "voided" ? "text-slate-400 line-through" : "text-navy-900"}`}>
                          {formatQty(e.quantity)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {e.status === "voided" ? (
                          <Badge variant="danger">Voided</Badge>
                        ) : (
                          <Badge variant="success">Saved</Badge>
                        )}
                        {pending && <Badge variant="warning">Correction pending</Badge>}
                        {e.status === "active" && !pending && (
                          <CorrectionDialog entry={e} components={components} triggerClassName="ml-auto" />
                        )}
                      </div>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
