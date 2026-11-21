import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/data";
import { formatTimestamp } from "@/lib/time";
import { str, type SearchParams } from "@/lib/params";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { EmptyRow, Table, TD, TH, THead } from "@/components/ui/table";
import type { AuditLog } from "@/lib/types";

export const metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";
const PAGE = 100;
const ENTITIES = ["production_entries", "correction_requests", "machine_assignments", "profiles", "machines", "components", "shifts", "prodlog_settings"];
const HIDDEN = new Set(["created_at", "updated_at", "legacy_raw", "client_request_id"]);

function diff(oldV: Record<string, unknown> | null, newV: Record<string, unknown> | null) {
  const keys = [...new Set([...Object.keys(oldV ?? {}), ...Object.keys(newV ?? {})])].filter((k) => !HIDDEN.has(k));
  return keys
    .filter((k) => JSON.stringify(oldV?.[k]) !== JSON.stringify(newV?.[k]))
    .map((k) => ({ k, from: oldV?.[k], to: newV?.[k] }));
}
const show = (v: unknown) => (v === null || v === undefined ? "∅" : typeof v === "object" ? JSON.stringify(v) : String(v));

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("supervisor", "admin");
  const supabase = await createClient();
  const settings = await getSettings(supabase);
  const sp = await searchParams;
  const entity = ENTITIES.includes(str(sp.entity) ?? "") ? str(sp.entity) : undefined;
  const page = Math.max(1, Number.parseInt(str(sp.page) ?? "1", 10) || 1);

  let q = supabase.from("production_audit_logs").select("*", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (entity) q = q.eq("entity_type", entity);
  const { data, count } = await q;
  const logs = (data ?? []) as AuditLog[];
  const actors = [...new Set(logs.map((l) => l.changed_by).filter(Boolean))] as string[];
  const { data: profs } = actors.length ? await supabase.from("profiles").select("id, display_name").in("id", actors) : { data: [] };
  const name = new Map(((profs ?? []) as { id: string; display_name: string }[]).map((p) => [p.id, p.display_name]));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));

  return (
    <div>
      <PageHeader title="Audit log" description="Append-only record of every change. Entries cannot be edited or deleted." />
      <form method="get" className="mb-4 flex items-end gap-2">
        <NativeSelect name="entity" defaultValue={entity ?? ""} className="w-60" aria-label="Filter by type">
          <option value="">All changes</option>
          {ENTITIES.map((e) => <option key={e} value={e}>{e.replace(/_/g, " ")}</option>)}
        </NativeSelect>
        <Button type="submit" variant="navy">Filter</Button>
      </form>
      <Card className="overflow-hidden">
        <Table>
          <THead><tr><TH>When</TH><TH>Who</TH><TH>What</TH><TH>Action</TH><TH>Changes</TH></tr></THead>
          <tbody>
            {logs.length === 0 && <EmptyRow colSpan={5}>No audit entries.</EmptyRow>}
            {logs.map((l) => {
              const changes = l.action === "update" || l.action === "void" ? diff(l.old_values, l.new_values) : [];
              return (
                <tr key={l.id}>
                  <TD className="whitespace-nowrap text-xs tabular">{formatTimestamp(l.created_at, settings.timezone)}</TD>
                  <TD className="whitespace-nowrap">{l.changed_by ? (name.get(l.changed_by) ?? "User") : <span className="text-muted">System / import</span>}</TD>
                  <TD className="whitespace-nowrap text-xs">{l.entity_type.replace(/_/g, " ")}<span className="block font-mono text-[10px] text-muted">{l.entity_id?.slice(0, 8)}</span></TD>
                  <TD><Badge variant={l.action === "insert" ? "success" : l.action === "void" || l.action === "delete" ? "danger" : "brand"}>{l.action}</Badge></TD>
                  <TD className="min-w-72 text-xs">
                    {changes.length > 0 ? (
                      <ul className="space-y-0.5">{changes.map((c) => <li key={c.k}><span className="font-semibold">{c.k}</span>: <span className="text-muted line-through">{show(c.from)}</span> → {show(c.to)}</li>)}</ul>
                    ) : l.action === "insert" && l.new_values ? (
                      <span className="text-muted">
                        {["quantity", "hour_slot", "production_date", "component_name", "display_name", "machine_code", "status", "request_type", "reason", "role"]
                          .filter((k) => l.new_values![k] !== undefined).map((k) => `${k}: ${show(l.new_values![k])}`).join(" · ")}
                      </span>
                    ) : "—"}
                  </TD>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted">Page {page} of {pages}</span>
          <div className="flex gap-2">
            {page > 1 && <Button asChild variant="outline" size="sm"><Link href={`/audit?${entity ? `entity=${entity}&` : ""}page=${page - 1}`}>Previous</Link></Button>}
            {page < pages && <Button asChild variant="outline" size="sm"><Link href={`/audit?${entity ? `entity=${entity}&` : ""}page=${page + 1}`}>Next</Link></Button>}
          </div>
        </nav>
      )}
    </div>
  );
}
