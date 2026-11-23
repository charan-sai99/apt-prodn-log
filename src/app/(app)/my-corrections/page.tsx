import { pageContext } from "@/lib/auth";
import { formatHourSlot, formatTimestamp } from "@/lib/time";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { CorrectionStatusBadge } from "@/components/correction-status";
import type { CorrectionRequest, EntryRow } from "@/lib/types";
import { formatQty } from "@/lib/utils";
import { CancelButton } from "./cancel-button";

export const metadata = { title: "My corrections" };
export const dynamic = "force-dynamic";

export default async function MyCorrectionsPage() {
  const { session: { userId }, supabase, settings } = await pageContext();
  const { data } = await supabase
    .from("correction_requests")
    .select("*")
    .eq("requested_by", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  const requests = (data ?? []) as CorrectionRequest[];
  const entryIds = [...new Set(requests.map((r) => r.production_entry_id))];
  const componentIds = [...new Set(requests.map((r) => r.proposed_component_id).filter(Boolean))] as string[];
  const [{ data: entries }, { data: comps }] = await Promise.all([
    entryIds.length ? supabase.from("production_entries_enriched").select("*").in("id", entryIds) : Promise.resolve({ data: [] }),
    componentIds.length ? supabase.from("components").select("id, component_name").in("id", componentIds) : Promise.resolve({ data: [] }),
  ]);
  const entryById = new Map(((entries ?? []) as EntryRow[]).map((e) => [e.id, e]));
  const compName = new Map(((comps ?? []) as { id: string; component_name: string }[]).map((c) => [c.id, c.component_name]));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="My correction requests" description="Requests stay pending until a supervisor approves or rejects them." />
      {requests.length === 0 && <p className="py-10 text-center text-muted">You have not requested any corrections.</p>}
      <div className="space-y-3">
        {requests.map((r) => {
          const e = entryById.get(r.production_entry_id);
          return (
            <Card key={r.id} className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {e && (
                    <p className="text-xs font-semibold text-muted">
                      {e.production_date} · {formatHourSlot(e.hour_slot)} · {e.machine_code}
                    </p>
                  )}
                  <p className="font-semibold text-navy-900">{e?.component_name ?? "Record"}</p>
                </div>
                <CorrectionStatusBadge status={r.status} />
              </div>
              <p className="text-sm">
                {r.request_type === "void" ? (
                  <span className="font-semibold text-danger">Remove this record</span>
                ) : (
                  <>
                    {r.proposed_quantity != null && (
                      <span>
                        Quantity {e ? formatQty(e.quantity) : "?"} → <strong>{formatQty(r.proposed_quantity)}</strong>
                      </span>
                    )}
                    {r.proposed_component_id && (
                      <span className="block">Component → <strong>{compName.get(r.proposed_component_id) ?? "—"}</strong></span>
                    )}
                  </>
                )}
              </p>
              <p className="text-sm text-muted">Reason: {r.reason}</p>
              {r.review_note && <p className="text-sm text-muted">Supervisor note: {r.review_note}</p>}
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Requested {formatTimestamp(r.created_at, settings.timezone)}</span>
                {r.status === "pending" && <CancelButton requestId={r.id} />}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
