"use client";
import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FieldError, Input, Label, NativeSelect } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Table, TD, TH, THead } from "@/components/ui/table";
import { useAction } from "@/components/use-action";
import type { Machine } from "@/lib/types";
import { saveMachine, setMachineActive } from "../actions";

const TYPES = { vertical_injection: "Vertical injection", horizontal_injection: "Horizontal injection", other: "Other" };

export function MachinesManager({ machines }: { machines: Machine[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex justify-end p-4"><MachineDialog /></div>
      <Table>
        <THead><tr><TH>Code</TH><TH>Name</TH><TH>Type</TH><TH>Order</TH><TH>Status</TH><TH className="text-right">Actions</TH></tr></THead>
        <tbody>{machines.map((m) => <Row key={m.id} m={m} />)}</tbody>
      </Table>
    </Card>
  );
}

function Row({ m }: { m: Machine }) {
  const { pending, run } = useAction();
  return (
    <tr className={m.is_active ? undefined : "text-slate-400"}>
      <TD className="font-bold">{m.machine_code}{m.legacy_code && <span className="block text-xs font-normal text-muted">legacy: {m.legacy_code}</span>}</TD>
      <TD>{m.machine_name}</TD>
      <TD>{TYPES[m.machine_type]}</TD>
      <TD>{m.sort_order}</TD>
      <TD>{m.is_active ? <Badge variant="success">Active</Badge> : <Badge>Inactive</Badge>}</TD>
      <TD className="text-right">
        <div className="flex justify-end gap-1">
          <MachineDialog m={m} />
          <Button size="sm" variant={m.is_active ? "danger-outline" : "outline"} disabled={pending} onClick={() => run(() => setMachineActive(m.id, !m.is_active))}>
            {m.is_active ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </TD>
    </tr>
  );
}

function MachineDialog({ m }: { m?: Machine }) {
  const [open, setOpen] = useState(false);
  const { pending, run, fieldErrors } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{m ? <Button size="sm" variant="ghost" aria-label={`Edit ${m.machine_code}`}><Pencil /></Button> : <Button><Plus /> Add machine</Button>}</DialogTrigger>
      <DialogContent title={m ? `Edit ${m.machine_code}` : "Add machine"}>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget));
          run(() => saveMachine({ ...f, id: m?.id }), () => setOpen(false));
        }}>
          <div className="space-y-1"><Label htmlFor="mc">Code</Label><Input id="mc" name="machineCode" defaultValue={m?.machine_code} required /><FieldError message={fieldErrors.machineCode} /></div>
          <div className="space-y-1"><Label htmlFor="mn">Name</Label><Input id="mn" name="machineName" defaultValue={m?.machine_name} required /><FieldError message={fieldErrors.machineName} /></div>
          <div className="space-y-1"><Label htmlFor="mt">Type</Label>
            <NativeSelect id="mt" name="machineType" defaultValue={m?.machine_type ?? "vertical_injection"}>
              {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </NativeSelect></div>
          <div className="space-y-1"><Label htmlFor="mo">Display order</Label><Input id="mo" name="sortOrder" type="number" min={0} defaultValue={m?.sort_order ?? 10} /></div>
          <Button type="submit" className="w-full" disabled={pending}>Save</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
