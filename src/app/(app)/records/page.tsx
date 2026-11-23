import Link from "next/link";
import { Download, FileSpreadsheet } from "lucide-react";
import { pageContext } from "@/lib/auth";
import { fetchEntries } from "@/lib/data";
import { summarize } from "@/lib/aggregate";
import { factoryNow, formatHourSlot, formatTimestamp } from "@/lib/time";
import { parseRecordFilters, filtersToQuery } from "@/lib/filters";
import { str, type SearchParams } from "@/lib/params";
import { getFilterLookups } from "@/lib/staff-lookups";
import { PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/filter-bar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyRow, Table, TD, TH, THead } from "@/components/ui/table";
import { CorrectionDialog } from "@/components/correction-dialog";
import { formatQty } from "@/lib/utils";

export const metadata = { title: "Production records" };
export const dynamic = "force-dynamic";
const PAGE = 100;

export default async function RecordsPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase, settings } = await pageContext("supervisor", "admin");
  const today = factoryNow(settings.timezone).date;
  const sp = await searchParams;
  const filters = parseRecordFilters(sp, { from: today, to: today });
  const page = Math.max(1, Number.parseInt(str(sp.page) ?? "1", 10) || 1);

  const [lookups, { rows, truncated, error }] = await Promise.all([getFilterLookups(supabase), fetchEntries(supabase, filters)]);
  const summary = summarize(rows);
  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const qs = filtersToQuery(filters);

  return (
    <div>
      <PageHeader
        title="Production records"
        description={`${formatQty(rows.length)} records · ${formatQty(summary.totalQuantity)} pcs (active only)`}
        actions={
          <>
            <Button asChild variant="outline"><a href={`/api/export?${qs}&format=csv`}><Download /> CSV</a></Button>
            <Button asChild><a href={`/api/export?${qs}&format=xlsx`}><FileSpreadsheet /> Excel</a></Button>
          </>
        }
      />
      <Card className="mb-4 p-4">
        <FilterBar filters={filters} resetHref="/records" {...lookups} />
      </Card>
      {error && <Alert variant="error" className="mb-4">Could not load records. Please try again.</Alert>}
      {truncated && <Alert variant="warning" className="mb-4">Only the first 20,000 matching records are shown and exported. Narrow the filters.</Alert>}

      <Card className="overflow-hidden">
        <Table>
          <THead>
            <tr>
              <TH>Date</TH><TH>Hour</TH><TH>Shift</TH><TH>Machine</TH><TH>Component</TH>
              <TH className="text-right">Qty</TH><TH>Operator</TH><TH>Recorded</TH><TH>Status</TH><TH><span className="sr-only">Actions</span></TH>
            </tr>
          </THead>
          <tbody>
            {pageRows.length === 0 && <EmptyRow colSpan={10}>No records match these filters.</EmptyRow>}
            {pageRows.map((r) => (
              <tr key={r.id} className={r.status === "voided" ? "text-slate-400" : undefined}>
                <TD className="whitespace-nowrap tabular">{r.production_date}</TD>
                <TD className="whitespace-nowrap tabular">{formatHourSlot(r.hour_slot)}</TD>
                <TD>{r.shift ?? "—"}</TD>
                <TD className="font-semibold">{r.machine_code}</TD>
                <TD className="min-w-56">
                  <span className="font-medium">{r.component_name}</span>
                  {(r.raw_material || r.component_code) && (
                    <span className="block text-xs text-muted">{[r.raw_material, r.component_code].filter(Boolean).join(" · ")}</span>
                  )}
                </TD>
                <TD className={`text-right font-bold tabular ${r.status === "voided" ? "line-through" : ""}`}>{formatQty(r.quantity)}</TD>
                <TD className="whitespace-nowrap">
                  {r.operator_name ?? "—"}
                  {r.entered_by_name && r.entered_by !== r.operator_id && <span className="block text-xs text-muted">by {r.entered_by_name}</span>}
                  {r.source === "legacy_import" && <span className="block text-xs text-muted">legacy import</span>}
                </TD>
                <TD className="whitespace-nowrap text-xs text-muted">{formatTimestamp(r.created_at, settings.timezone)}</TD>
                <TD>{r.status === "voided" ? <Badge variant="danger">Voided</Badge> : <Badge variant="success">Active</Badge>}</TD>
                <TD>{r.status === "active" && <CorrectionDialog entry={r} components={lookups.components.filter((c) => c.is_active).map((c) => ({ ...c, component_code: null }))} />}</TD>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
          <span className="text-muted">Page {page} of {pages}</span>
          <div className="flex gap-2">
            {page > 1 && <Button asChild variant="outline" size="sm"><Link href={`/records?${qs}&page=${page - 1}`}>Previous</Link></Button>}
            {page < pages && <Button asChild variant="outline" size="sm"><Link href={`/records?${qs}&page=${page + 1}`}>Next</Link></Button>}
          </div>
        </nav>
      )}
    </div>
  );
}
