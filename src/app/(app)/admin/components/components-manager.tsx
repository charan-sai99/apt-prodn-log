"use client";
import { useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FieldError, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyRow, Table, TD, TH, THead } from "@/components/ui/table";
import { useAction } from "@/components/use-action";
import type { Component } from "@/lib/types";
import { saveComponent, setComponentActive } from "../actions";

export function ComponentsManager({ components }: { components: Component[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("active");
  const [limit, setLimit] = useState(100);
  const shown = useMemo(() => components.filter((c) =>
    (status === "all" || (status === "active") === c.is_active) &&
    `${c.component_name} ${c.raw_material ?? ""} ${c.component_code ?? ""} ${c.zoho_item_id ?? ""}`.toLowerCase().includes(q.toLowerCase())), [components, q, status]);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, material, part code" className="max-w-sm" aria-label="Search components" />
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="w-36" aria-label="Status">
          <option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option>
        </NativeSelect>
        <span className="text-sm text-muted">{shown.length} shown</span>
        <div className="ml-auto"><ComponentDialog /></div>
      </div>
      <Table>
        <THead><tr><TH>Component</TH><TH>Raw material</TH><TH>Part code</TH><TH>Zoho Item ID</TH><TH>Status</TH><TH className="text-right">Actions</TH></tr></THead>
        <tbody>
          {shown.length === 0 && <EmptyRow colSpan={6}>No components match.</EmptyRow>}
          {shown.slice(0, limit).map((c) => <Row key={c.id} c={c} />)}
        </tbody>
      </Table>
      {shown.length > limit && <div className="p-4 text-center"><Button variant="outline" onClick={() => setLimit(limit + 200)}>Show more</Button></div>}
    </Card>
  );
}

function Row({ c }: { c: Component }) {
  const { pending, run } = useAction();
  return (
    <tr className={c.is_active ? undefined : "text-slate-400"}>
      <TD className="min-w-64 font-medium">{c.component_name}</TD>
      <TD className="whitespace-nowrap text-xs font-semibold">{c.raw_material ?? "—"}</TD>
      <TD className="max-w-48 whitespace-pre-line text-xs">{c.component_code ?? "—"}</TD>
      <TD className="font-mono text-xs">{c.zoho_item_id ?? "—"}</TD>
      <TD>{c.is_active ? <Badge variant="success">Active</Badge> : <Badge>Inactive</Badge>}</TD>
      <TD className="text-right"><div className="flex justify-end gap-1">
        <ComponentDialog c={c} />
        <Button size="sm" variant={c.is_active ? "danger-outline" : "outline"} disabled={pending} onClick={() => run(() => setComponentActive(c.id, !c.is_active))}>
          {c.is_active ? "Deactivate" : "Activate"}
        </Button>
      </div></TD>
    </tr>
  );
}

function ComponentDialog({ c }: { c?: Component }) {
  const [open, setOpen] = useState(false);
  const { pending, run, fieldErrors } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{c ? <Button size="sm" variant="ghost" aria-label="Edit"><Pencil /></Button> : <Button><Plus /> Add component</Button>}</DialogTrigger>
      <DialogContent title={c ? "Edit component" : "Add component"}>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          run(() => saveComponent({ ...Object.fromEntries(new FormData(e.currentTarget)), id: c?.id }), () => setOpen(false));
        }}>
          <div className="space-y-1"><Label htmlFor="cn">Name</Label><Input id="cn" name="componentName" defaultValue={c?.component_name} required /><FieldError message={fieldErrors.componentName} /></div>
          <div className="space-y-1"><Label htmlFor="crm">Raw material</Label><Input id="crm" name="rawMaterial" defaultValue={c?.raw_material ?? ""} placeholder="e.g. PC BLACK" /><FieldError message={fieldErrors.rawMaterial} /></div>
          <div className="space-y-1"><Label htmlFor="cc">Part code</Label><Input id="cc" name="componentCode" defaultValue={c?.component_code ?? ""} placeholder="e.g. COM-SPA-00018" /></div>
          <div className="space-y-1"><Label htmlFor="cz">Zoho Item ID <span className="font-normal text-muted">(optional)</span></Label><Input id="cz" name="zohoItemId" defaultValue={c?.zoho_item_id ?? ""} inputMode="numeric" /><FieldError message={fieldErrors.zohoItemId} /></div>
          <div className="space-y-1"><Label htmlFor="cd">Description</Label><Textarea id="cd" name="description" defaultValue={c?.description ?? ""} maxLength={500} /></div>
          <Button type="submit" className="w-full" disabled={pending}>Save</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
