"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { useAction } from "@/components/use-action";
import type { Settings, Shift } from "@/lib/types";
import { saveSettings, saveShift } from "../actions";

export function SettingsForms({ settings, shifts }: { settings: Settings; shifts: Shift[] }) {
  const s = useAction();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Factory settings</CardTitle><CardDescription>Applied by the database to every submission.</CardDescription></CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); s.run(() => saveSettings(Object.fromEntries(new FormData(e.currentTarget)))); }}>
            <div className="space-y-1"><Label htmlFor="tz">Time zone</Label><Input id="tz" name="timezone" defaultValue={settings.timezone} /><FieldError message={s.fieldErrors.timezone} /></div>
            <div className="space-y-1"><Label htmlFor="bd">Operator back-dating (days)</Label><Input id="bd" name="operatorBackdateDays" type="number" min={0} max={31} defaultValue={settings.operator_backdate_days} /></div>
            <div className="space-y-1"><Label htmlFor="mq">Max quantity per entry</Label><Input id="mq" name="maxQuantity" type="number" min={1} defaultValue={settings.max_quantity_per_entry} /></div>
            <div className="sm:col-span-3"><Button type="submit" disabled={s.pending}>Save settings</Button></div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Shifts</CardTitle><CardDescription>End hour is exclusive; an end hour at or before the start wraps past midnight.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {[...shifts, { code: "", name: "", start_hour: 0, end_hour: 0, sort_order: shifts.length + 1, is_active: true }].map((sh, i) => <ShiftRow key={sh.code || `new-${i}`} sh={sh} />)}
        </CardContent>
      </Card>
    </div>
  );
}

function ShiftRow({ sh }: { sh: Shift }) {
  const { pending, run } = useAction();
  const isNew = !sh.code;
  return (
    <form className="grid grid-cols-2 items-end gap-2 rounded-lg border border-line p-3 sm:grid-cols-7" onSubmit={(e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.currentTarget));
      run(() => saveShift({ ...f, isActive: f.isActive === "on" }));
    }}>
      <div className="space-y-1"><Label>Code</Label><Input name="code" defaultValue={sh.code} readOnly={!isNew} maxLength={4} required placeholder="D" /></div>
      <div className="col-span-2 space-y-1"><Label>Name</Label><Input name="name" defaultValue={sh.name} required /></div>
      <div className="space-y-1"><Label>Start</Label><Input name="startHour" type="number" min={0} max={23} defaultValue={sh.start_hour} /></div>
      <div className="space-y-1"><Label>End</Label><Input name="endHour" type="number" min={0} max={23} defaultValue={sh.end_hour} /></div>
      <input type="hidden" name="sortOrder" value={sh.sort_order} />
      <label className="flex h-11 items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={sh.is_active} className="size-5" /> Active</label>
      <Button type="submit" variant={isNew ? "default" : "outline"} disabled={pending}>{isNew ? "Add" : "Save"}</Button>
    </form>
  );
}
