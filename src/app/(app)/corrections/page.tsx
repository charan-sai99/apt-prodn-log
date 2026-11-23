import Link from "next/link";
import { pageContext } from "@/lib/auth";
import { formatHourSlot, formatTimestamp } from "@/lib/time";
import { str, type SearchParams } from "@/lib/params";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { CorrectionStatusBadge } from "@/components/correction-status";
import { LiveRefresh } from "@/components/live-refresh";
import { cn, formatQty } from "@/lib/utils";
import type { CorrectionRequest, EntryRow } from "@/lib/types";
import { ReviewButtons } from "./review-buttons";

export const metadata = { title: "Corrections" };
export const dynamic = "force-dynamic";

export default async function CorrectionsPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase, settings } = await pageContext("supervisor", "admin");
  const tab = str((await searchParams).tab) === "history" ? "history" : "pending";

  let q = supabase.from("correction_requests").select("*").order("created_at", { ascending: tab === "pending" }).limit(300);
  q = tab === "pending" ? q.eq("status", "pending") : q.neq("status", "pending");
  const { data } = await q;
  const reqs = (data ?? []) as CorrectionRequest[];

  const entryIds = [...new Set(reqs.map((r) => r.production_entry_id))];
  const people = [...new Set(reqs.flatMap((r) => [r.requested_by, r.reviewed_by]).filter(Boolean))] as string[];
  const comps = [...new Set(reqs.map((r) => r.proposed_component_id).filter(Boolean))] as string[];
  const [{ data: entries }, { data: profs }, { data: cs }] = await Promise.all([
    entryIds.length ? supabase.from("production_entries_enriched").select("*").in("id", entryIds) : Promise.resolve({ data: [] }),
    people.length ? supabase.from("profiles").select("id, display_name").in("id", people) : Promise.resolve({ data: [] }),
    comps.length ? supabase.from("components").select("id, component_name").in("id", comps) : Promise.resolve({ data: [] }),
  ]);
  const entry = new Map(((entries ?? []) as EntryRow[]).map((e) => [e.id, e]));
  const name = new Map(((profs ?? []) as { id: string; display_name: string }[]).map((p) => [p.id, p.display_name]));
  const comp = new Map(((cs ?? []) as { id: string; component_name: string }[]).map((c) => [c.id, c.component_name]));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Correction requests" description={<span className="flex items-center gap-2">Approving applies the change; every change is kept in the audit log. <LiveRefresh tables={["correction_requests"]} /></span>} />
      <div className="mb-4 flex gap-2" role="tablist">
        {(["pending", "history"] as const).map((t) => (
          <Link key={t} role="tab" aria-selected={tab === t} href={`/corrections?tab=${t}`}
            className={cn("rounded-lg px-4 py-2 text-sm font-semibold", tab === t ? "bg-navy-900 text-white" : "bg-surface text-navy-800 border border-line")}>
            {t === "pending" ? "Pending" : "Reviewed"}
          </Link>
        ))}
      </div>
      {reqs.length === 0 && <p className="py-10 text-center text-muted">{tab === "pending" ? "Nothing waiting for review." : "No reviewed requests yet."}</p>}
      <div className="space-y-3">
        {reqs.map((r) => {
          const e = entry.get(r.production_entry_id);
          return (
            <Card key={r.id} className="grid gap-4 p-4 md:grid-cols-[1fr_280px]">
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2"><CorrectionStatusBadge status={r.status} />
                  <span className="text-xs text-muted">{formatTimestamp(r.created_at, settings.timezone)} · by {name.get(r.requested_by) ?? "—"}</span></div>
                {e && (
                  <p className="font-semibold text-navy-900">
                    {e.machine_code} · {e.production_date} · {formatHourSlot(e.hour_slot)} · {e.operator_name ?? "—"}
                  </p>
                )}
                <p>{e?.component_name} — <strong className="tabular">{e ? formatQty(e.quantity) : "?"} pcs</strong></p>
                <p className="rounded-md bg-canvas px-3 py-2">
                  {r.request_type === "void" ? <span className="font-semibold text-danger">Void (entered by mistake)</span> : (
                    <>
                      {r.proposed_quantity != null && <span className="block">Quantity → <strong className="tabular">{formatQty(r.proposed_quantity)}</strong></span>}
                      {r.proposed_component_id && <span className="block">Component → <strong>{comp.get(r.proposed_component_id) ?? "—"}</strong></span>}
                    </>
                  )}
                </p>
                <p className="text-muted">Reason: {r.reason}</p>
                {r.reviewed_by && (
                  <p className="text-xs text-muted">
                    Reviewed by {name.get(r.reviewed_by) ?? "—"}{r.reviewed_at ? ` · ${formatTimestamp(r.reviewed_at, settings.timezone)}` : ""}{r.review_note ? ` — “${r.review_note}”` : ""}
                  </p>
                )}
              </div>
              {r.status === "pending" && <ReviewButtons requestId={r.id} />}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
