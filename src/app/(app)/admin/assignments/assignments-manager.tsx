"use client";
import { Card } from "@/components/ui/card";
import { EmptyRow, Table, TD, TH, THead } from "@/components/ui/table";
import { useAction } from "@/components/use-action";
import { Avatar } from "@/components/avatar";
import { cn } from "@/lib/utils";
import { assignMachine, unassignMachine } from "../actions";

export function AssignmentsManager({
  machines, operators, assignments, photoByUser = {},
}: {
  machines: { id: string; code: string }[];
  operators: { id: string; display_name: string; employee_code: string | null }[];
  assignments: { id: string; operator_id: string; machine_id: string }[];
  photoByUser?: Record<string, number>;
}) {
  const { pending, run } = useAction();
  return (
    <Card className="overflow-hidden">
      <Table>
        <THead><tr><TH>Operator</TH>{machines.map((m) => <TH key={m.id} className="text-center">{m.code}</TH>)}</tr></THead>
        <tbody>
          {operators.length === 0 && <EmptyRow colSpan={machines.length + 1}>No active operators. Create operator accounts under Users first.</EmptyRow>}
          {operators.map((o) => (
            <tr key={o.id}>
              <TD className="whitespace-nowrap font-semibold">
                <div className="flex items-center gap-3">
                  <Avatar id={o.id} name={o.display_name} version={photoByUser[o.id]} size={40} />
                  <span>{o.display_name}<span className="block text-xs font-normal text-muted">{o.employee_code}</span></span>
                </div>
              </TD>
              {machines.map((m) => {
                const a = assignments.find((x) => x.operator_id === o.id && x.machine_id === m.id);
                return (
                  <TD key={m.id} className="text-center">
                    <button
                      type="button"
                      disabled={pending}
                      aria-pressed={Boolean(a)}
                      aria-label={`${a ? "Unassign" : "Assign"} ${o.display_name} ${a ? "from" : "to"} ${m.code}`}
                      onClick={() => run(() => (a ? unassignMachine(a.id) : assignMachine(o.id, m.id)))}
                      className={cn("h-10 w-16 rounded-lg border text-xs font-bold", a ? "border-brand bg-brand text-white" : "border-line bg-surface text-muted hover:border-brand")}
                    >
                      {a ? "Assigned" : "—"}
                    </button>
                  </TD>
                );
              })}
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
