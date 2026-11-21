"use client";
import { useState } from "react";
import { KeyRound, Pencil, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FieldError, Input, Label, NativeSelect } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyRow, Table, TD, TH, THead } from "@/components/ui/table";
import { useAction } from "@/components/use-action";
import type { Profile } from "@/lib/types";
import { changeRole, createUser, resetUserPassword, setUserActive, updateUserDetails } from "../actions";

const ROLE_LABEL: Record<string, string> = { operator: "Operator", supervisor: "Supervisor", admin: "Administrator" };

export function UsersManager({ users, machinesByUser, currentUserId }: { users: Profile[]; machinesByUser: Record<string, string[]>; currentUserId: string }) {
  const [filter, setFilter] = useState("");
  const shown = users.filter((u) => `${u.display_name} ${u.employee_code ?? ""} ${u.role}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search users" className="max-w-xs" aria-label="Search users" />
        <CreateUserDialog />
      </div>
      <Table>
        <THead><tr><TH>Name</TH><TH>Employee code</TH><TH>Role</TH><TH>Machines</TH><TH>Status</TH><TH className="text-right">Actions</TH></tr></THead>
        <tbody>
          {shown.length === 0 && <EmptyRow colSpan={6}>No users.</EmptyRow>}
          {shown.map((u) => <UserRow key={u.id} u={u} machines={machinesByUser[u.id] ?? []} self={u.id === currentUserId} />)}
        </tbody>
      </Table>
    </Card>
  );
}

function UserRow({ u, machines, self }: { u: Profile; machines: string[]; self: boolean }) {
  const { pending, run } = useAction();
  return (
    <tr className={u.is_active ? undefined : "text-slate-400"}>
      <TD className="font-semibold">{u.display_name}{self && <span className="ml-1 text-xs text-muted">(you)</span>}</TD>
      <TD className="font-mono text-xs">{u.employee_code ?? "—"}</TD>
      <TD>
        <NativeSelect
          className="h-9 w-40 text-sm"
          defaultValue={u.role}
          disabled={pending || self || !u.is_active}
          aria-label={`Role for ${u.display_name}`}
          onChange={(e) => run(() => changeRole(u.id, e.target.value))}
        >
          {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
      </TD>
      <TD className="text-xs">{machines.join(", ") || "—"}</TD>
      <TD>{u.is_active ? <Badge variant="success">Active</Badge> : <Badge>Inactive</Badge>}</TD>
      <TD className="whitespace-nowrap text-right">
        <div className="flex justify-end gap-1">
          <EditUserDialog u={u} />
          <ResetPasswordDialog u={u} />
          {!self && (
            <Button size="sm" variant={u.is_active ? "danger-outline" : "outline"} disabled={pending}
              onClick={() => {
                if (u.is_active && !confirm(`Deactivate ${u.display_name}? They will no longer be able to sign in. Their records are kept.`)) return;
                run(() => setUserActive(u.id, !u.is_active));
              }}>
              {u.is_active ? "Deactivate" : "Reactivate"}
            </Button>
          )}
        </div>
      </TD>
    </tr>
  );
}

function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("operator");
  const { pending, run, fieldErrors } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><UserPlus /> New account</Button></DialogTrigger>
      <DialogContent title="Create account" description="Operators sign in with their employee code. Supervisors and admins need an email.">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(() => createUser(Object.fromEntries(f)), () => setOpen(false));
          }}
        >
          <div className="space-y-1"><Label htmlFor="cu-name">Full name</Label><Input id="cu-name" name="displayName" required /><FieldError message={fieldErrors.displayName} /></div>
          <div className="space-y-1"><Label htmlFor="cu-code">Employee code</Label><Input id="cu-code" name="employeeCode" required autoCapitalize="characters" placeholder="e.g. OP014" /><FieldError message={fieldErrors.employeeCode} /></div>
          <div className="space-y-1">
            <Label htmlFor="cu-role">Role</Label>
            <NativeSelect id="cu-role" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
              {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cu-email">Email {role === "operator" && <span className="font-normal text-muted">(optional)</span>}</Label>
            <Input id="cu-email" name="email" type="email" required={role !== "operator"} /><FieldError message={fieldErrors.email} />
          </div>
          <div className="space-y-1"><Label htmlFor="cu-pw">Initial password</Label><Input id="cu-pw" name="password" type="text" minLength={8} required autoComplete="off" /><FieldError message={fieldErrors.password} /></div>
          <Button type="submit" className="w-full" disabled={pending}>Create account</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ u }: { u: Profile }) {
  const [open, setOpen] = useState(false);
  const { pending, run, fieldErrors } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="ghost" aria-label={`Edit ${u.display_name}`}><Pencil /></Button></DialogTrigger>
      <DialogContent title="Edit user" description={u.display_name}>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(() => updateUserDetails({ userId: u.id, displayName: f.get("displayName"), employeeCode: f.get("employeeCode") }), () => setOpen(false));
        }}>
          <div className="space-y-1"><Label htmlFor={`eu-n-${u.id}`}>Full name</Label><Input id={`eu-n-${u.id}`} name="displayName" defaultValue={u.display_name} required /><FieldError message={fieldErrors.displayName} /></div>
          <div className="space-y-1"><Label htmlFor={`eu-c-${u.id}`}>Employee code</Label><Input id={`eu-c-${u.id}`} name="employeeCode" defaultValue={u.employee_code ?? ""} required /><FieldError message={fieldErrors.employeeCode} />
            <p className="text-xs text-muted">Changing an operator&apos;s code changes the code they sign in with.</p></div>
          <Button type="submit" className="w-full" disabled={pending}>Save</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ u }: { u: Profile }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="ghost" aria-label={`Set password for ${u.display_name}`}><KeyRound /></Button></DialogTrigger>
      <DialogContent title="Set new password" description={`For ${u.display_name}. Tell them in person; do not send it by chat.`}>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          const pw = String(new FormData(e.currentTarget).get("password") ?? "");
          run(() => resetUserPassword(u.id, pw), () => setOpen(false));
        }}>
          <Input name="password" type="text" minLength={8} required autoComplete="off" aria-label="New password" />
          <Button type="submit" className="w-full" disabled={pending}>Set password</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
