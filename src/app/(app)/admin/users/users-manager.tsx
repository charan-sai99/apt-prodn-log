"use client";
import { useRef, useState } from "react";
import { Camera, KeyRound, Lock, LockOpen, Pencil, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FieldError, Input, Label, NativeSelect } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyRow, Table, TD, TH, THead } from "@/components/ui/table";
import { Avatar } from "@/components/avatar";
import { useAction } from "@/components/use-action";
import type { Profile } from "@/lib/types";
import { resizePhoto } from "@/lib/resize-photo";
import {
  changeRole, clearPhoto, clearPin, createUser, resetUserPassword, setPhoto, setPin, setUserActive, unlockPin, updateUserDetails,
} from "../actions";

const ROLE_LABEL: Record<string, string> = { operator: "Operator", supervisor: "Supervisor", admin: "Administrator" };

export interface PinStatus {
  has_pin: boolean;
  locked: boolean;
  needs_admin_unlock: boolean;
  failed_attempts: number;
  last_used_at: string | null;
}

interface Props {
  users: Profile[];
  machinesByUser: Record<string, string[]>;
  pinByUser: Record<string, PinStatus>;
  photoByUser: Record<string, number>;
  currentUserId: string;
  pinsEnabled: boolean;
}

export function UsersManager({ users, machinesByUser, pinByUser, photoByUser, currentUserId, pinsEnabled }: Props) {
  const [filter, setFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const inactiveCount = users.filter((u) => !u.is_active).length;
  const shown = users.filter(
    (u) =>
      (showInactive || u.is_active) &&
      `${u.display_name} ${u.employee_code ?? ""} ${u.role} ${u.designation ?? ""}`.toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search people" className="max-w-xs" aria-label="Search people" />
          {inactiveCount > 0 && (
            <button
              type="button"
              onClick={() => setShowInactive((v) => !v)}
              aria-pressed={showInactive}
              className="text-sm font-medium text-muted underline-offset-2 hover:text-navy-900 hover:underline"
            >
              {showInactive ? "Hide deactivated" : `Show deactivated (${inactiveCount})`}
            </button>
          )}
        </div>
        <CreateUserDialog pinsEnabled={pinsEnabled} />
      </div>
      <Table>
        <THead>
          <tr><TH>Person</TH><TH>Role</TH><TH>Machines</TH><TH>Sign-in</TH><TH>Status</TH><TH className="text-right">Actions</TH></tr>
        </THead>
        <tbody>
          {shown.length === 0 && <EmptyRow colSpan={6}>No people.</EmptyRow>}
          {shown.map((u) => (
            <UserRow
              key={u.id}
              u={u}
              machines={machinesByUser[u.id] ?? []}
              pin={pinByUser[u.id]}
              photo={photoByUser[u.id]}
              self={u.id === currentUserId}
              pinsEnabled={pinsEnabled}
            />
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function UserRow({ u, machines, pin, photo, self, pinsEnabled }: { u: Profile; machines: string[]; pin?: PinStatus; photo?: number; self: boolean; pinsEnabled: boolean }) {
  const { pending, run } = useAction();
  const isAdmin = u.role === "admin";
  return (
    <tr className={u.is_active ? undefined : "text-slate-400"}>
      <TD>
        <div className="flex items-center gap-3">
          {pinsEnabled ? <PhotoDialog u={u} version={photo} /> : <Avatar id={u.id} name={u.display_name} size={44} />}
          <div className="min-w-0">
            <p className="font-semibold">{u.display_name}{self && <span className="ml-1 text-xs text-muted">(you)</span>}</p>
            <p className="text-xs text-muted">
              {[u.designation, u.employee_code].filter(Boolean).join(" · ") || "—"}
              {u.show_on_login === false && " · hidden from sign-in"}
            </p>
          </div>
        </div>
      </TD>
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
      <TD className="whitespace-nowrap">
        {isAdmin ? (
          <Badge>Email + password</Badge>
        ) : !pinsEnabled ? (
          <span className="text-xs text-muted">—</span>
        ) : pin?.needs_admin_unlock ? (
          <Badge variant="danger"><Lock className="size-3" /> Locked — unlock</Badge>
        ) : pin?.locked ? (
          <Badge variant="warning"><Lock className="size-3" /> Locked 15 min</Badge>
        ) : pin?.has_pin ? (
          <Badge variant="success">PIN set</Badge>
        ) : (
          <Badge variant="warning">No PIN yet</Badge>
        )}
      </TD>
      <TD>{u.is_active ? <Badge variant="success">Active</Badge> : <Badge>Inactive</Badge>}</TD>
      <TD className="whitespace-nowrap text-right">
        <div className="flex justify-end gap-1">
          <EditUserDialog u={u} pinsEnabled={pinsEnabled} />
          {isAdmin ? (
            <ResetPasswordDialog u={u} />
          ) : (
            pinsEnabled && u.is_active && (
              <>
                <PinDialog u={u} hasPin={Boolean(pin?.has_pin)} />
                {pin?.locked && (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => unlockPin(u.id))} aria-label={`Unlock ${u.display_name}`}>
                    <LockOpen /> Unlock
                  </Button>
                )}
              </>
            )
          )}
          {!self && (
            <Button
              size="sm"
              variant={u.is_active ? "danger-outline" : "outline"}
              disabled={pending}
              onClick={() => {
                if (u.is_active && !confirm(`Deactivate ${u.display_name}? They will no longer be able to sign in. Their records are kept.`)) return;
                run(() => setUserActive(u.id, !u.is_active));
              }}
            >
              {u.is_active ? "Deactivate" : "Reactivate"}
            </Button>
          )}
        </div>
      </TD>
    </tr>
  );
}

function PhotoDialog({ u, version }: { u: Profile; version?: number }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="relative rounded-full" aria-label={`Change photo of ${u.display_name}`}>
        <Avatar id={u.id} name={u.display_name} version={version} size={44} />
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-navy-900 p-1 text-white"><Camera className="size-3" /></span>
      </DialogTrigger>
      <DialogContent title="Photo" description={`${u.display_name} — shown on the sign-in screen`}>
        <div className="flex flex-col items-center gap-4">
          <Avatar id={u.id} name={u.display_name} version={version} size={128} />
          <input ref={fileRef} type="file" accept="image/*" className="text-sm file:mr-3 file:h-11 file:rounded-lg file:border-0 file:bg-navy-900 file:px-4 file:font-semibold file:text-white" aria-label="Choose photo" />
          <p className="text-center text-xs text-muted">The middle of the picture is used; it is shrunk to a small square automatically. A head-and-shoulders photo works best.</p>
          {error && <p className="text-sm font-semibold text-danger">{error}</p>}
          <div className="flex w-full gap-2">
            <Button
              className="flex-1"
              disabled={pending}
              onClick={async () => {
                setError(null);
                const f = fileRef.current?.files?.[0];
                if (!f) return setError("Choose a photo first.");
                try {
                  const photo = await resizePhoto(f);
                  run(() => setPhoto({ userId: u.id, ...photo }), () => setOpen(false));
                } catch {
                  setError("That file could not be read as a picture.");
                }
              }}
            >
              <Camera /> Save photo
            </Button>
            {version && (
              <Button variant="danger-outline" disabled={pending} onClick={() => run(() => clearPhoto(u.id), () => setOpen(false))} aria-label="Remove photo">
                <Trash2 />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PinDialog({ u, hasPin }: { u: Profile; hasPin: boolean }) {
  const [open, setOpen] = useState(false);
  const [pin, setPinValue] = useState("");
  const { pending, run } = useAction();
  const valid = /^[0-9]{4}$/.test(pin);
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setPinValue(""); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" aria-label={`${hasPin ? "Change" : "Set"} PIN for ${u.display_name}`}><KeyRound /> {hasPin ? "PIN" : "Set PIN"}</Button>
      </DialogTrigger>
      <DialogContent title={hasPin ? "Change PIN" : "Set PIN"} description={`For ${u.display_name}. Any 4 digits; tell them in private.`}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) run(() => setPin(u.id, pin), () => setOpen(false)); }}>
          <Input
            value={pin}
            onChange={(e) => setPinValue(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            autoComplete="off"
            placeholder="••••"
            className="h-16 text-center text-3xl font-bold tracking-[0.5em]"
            aria-label="New 4-digit PIN"
          />
          <Button type="submit" className="w-full" disabled={pending || !valid}>Save PIN</Button>
          {hasPin && (
            <Button type="button" variant="ghost" className="w-full text-danger" disabled={pending}
              onClick={() => { if (confirm(`Remove ${u.display_name}'s PIN? They can't sign in until you set a new one.`)) run(() => clearPin(u.id), () => setOpen(false)); }}>
              Remove PIN
            </Button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateUserDialog({ pinsEnabled }: { pinsEnabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("operator");
  const { pending, run, fieldErrors } = useAction();
  const isAdmin = role === "admin";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><UserPlus /> Add person</Button></DialogTrigger>
      <DialogContent title="Add person" description="Add their photo afterwards by tapping the picture in the list.">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => createUser(Object.fromEntries(new FormData(e.currentTarget))), () => setOpen(false));
          }}
        >
          <div className="space-y-1"><Label htmlFor="cu-name">Name</Label><Input id="cu-name" name="displayName" required /><FieldError message={fieldErrors.displayName} /></div>
          <div className="space-y-1">
            <Label htmlFor="cu-role">Role</Label>
            <NativeSelect id="cu-role" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
              {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1"><Label htmlFor="cu-des">Designation <span className="font-normal text-muted">(optional)</span></Label><Input id="cu-des" name="designation" placeholder="e.g. Machine Operator" /></div>
          {isAdmin ? (
            <>
              <div className="space-y-1"><Label htmlFor="cu-email">Email</Label><Input id="cu-email" name="email" type="email" required /><FieldError message={fieldErrors.email} /></div>
              <div className="space-y-1"><Label htmlFor="cu-pw">Password</Label><Input id="cu-pw" name="password" type="text" minLength={8} required autoComplete="off" /><FieldError message={fieldErrors.password} /></div>
            </>
          ) : (
            pinsEnabled && (
              <div className="space-y-1">
                <Label htmlFor="cu-pin">4-digit PIN <span className="font-normal text-muted">(can be set later)</span></Label>
                <Input id="cu-pin" name="pin" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" autoComplete="off" />
                <FieldError message={fieldErrors.pin} />
              </div>
            )
          )}
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">Employee code (optional)</summary>
            <Input name="employeeCode" placeholder="Made from the name if left empty" className="mt-2" />
            <FieldError message={fieldErrors.employeeCode} />
          </details>
          <Button type="submit" className="w-full" disabled={pending}>Add</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ u, pinsEnabled }: { u: Profile; pinsEnabled: boolean }) {
  const [open, setOpen] = useState(false);
  const { pending, run, fieldErrors } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="ghost" aria-label={`Edit ${u.display_name}`}><Pencil /></Button></DialogTrigger>
      <DialogContent title="Edit person" description={u.display_name}>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(() => updateUserDetails({
            userId: u.id,
            displayName: f.get("displayName"),
            employeeCode: f.get("employeeCode"),
            ...(pinsEnabled ? {
              designation: f.get("designation") ?? "",
              displayOrder: f.get("displayOrder"),
              showOnLogin: f.get("showOnLogin") === "on",
            } : {}),
          }), () => setOpen(false));
        }}>
          <div className="space-y-1"><Label htmlFor={`eu-n-${u.id}`}>Name</Label><Input id={`eu-n-${u.id}`} name="displayName" defaultValue={u.display_name} required /><FieldError message={fieldErrors.displayName} /></div>
          <div className="space-y-1"><Label htmlFor={`eu-c-${u.id}`}>Employee code</Label><Input id={`eu-c-${u.id}`} name="employeeCode" defaultValue={u.employee_code ?? ""} required /><FieldError message={fieldErrors.employeeCode} /></div>
          {pinsEnabled && (
            <>
              <div className="space-y-1"><Label htmlFor={`eu-d-${u.id}`}>Designation</Label><Input id={`eu-d-${u.id}`} name="designation" defaultValue={u.designation ?? ""} /></div>
              <div className="space-y-1">
                <Label htmlFor={`eu-o-${u.id}`}>Position on the sign-in screen</Label>
                <Input id={`eu-o-${u.id}`} name="displayOrder" type="number" min={0} max={9999} defaultValue={u.display_order ?? 100} />
                <p className="text-xs text-muted">Lower numbers appear first. Same number → alphabetical. The proprietor uses 1000 to stay at the bottom.</p>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showOnLogin" defaultChecked={u.show_on_login !== false} className="size-5" /> Show on the sign-in screen</label>
            </>
          )}
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
      <DialogContent title="Set new password" description={`For ${u.display_name}.`}>
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
