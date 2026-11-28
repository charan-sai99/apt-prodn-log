"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, ClipboardCheck, Factory, Loader2, Send } from "lucide-react";
import { entrySchema } from "@/lib/validation";
import { factoryNow, formatDisplayDate, formatHourSlot, hoursOfShift, selectableHours, shiftForHour } from "@/lib/time";
import type { Shift } from "@/lib/types";
import { cn, formatQty } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ComponentPicker, type PickerComponent } from "@/components/component-picker";
import { Avatar } from "@/components/avatar";
import { submitEntry } from "./actions";

type FormIn = z.input<typeof entrySchema>;
type FormOut = z.output<typeof entrySchema>;

interface Existing {
  machineId: string;
  componentId: string;
  date: string;
  hour: number;
  status: string;
  quantity: number;
  operatorId: string | null;
}

interface Props {
  operatorId: string;
  /** profile id → photo version, for avatars */
  photos: Record<string, number>;
  operatorName: string;
  operatorCode: string | null;
  isOperator: boolean;
  machines: { id: string; code: string; name: string }[];
  operators: { id: string; display_name: string; employee_code: string | null; machineIds: string[] }[];
  components: PickerComponent[];
  shifts: Shift[];
  /** Today first, then the back-dated days (shown as quick chips: Today, Yesterday). */
  allowedDates: string[];
  /** Earliest date the "Other date" picker allows (operators: their back-dating limit). */
  minDate: string;
  timezone: string;
  maxQuantity: number;
  existing: Existing[];
}

// crypto.randomUUID only exists on https/localhost; testing from a phone over plain
// http (Wi-Fi/Tailscale address) needs the getRandomValues fallback.
const newRequestId = (): string => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

/** Ticks every 30 s so the hour grid unlocks the new hour without a reload. */
function useFactoryClock(timezone: string) {
  const [now, setNow] = useState(() => factoryNow(timezone));
  useEffect(() => {
    const t = setInterval(() => setNow(factoryNow(timezone)), 30_000);
    return () => clearInterval(t);
  }, [timezone]);
  return now;
}

export function EntryForm(props: Props) {
  const { machines, components, shifts, allowedDates, minDate, timezone, existing, isOperator, operators } = props;
  const quickDates = allowedDates.slice(0, 2);
  const today = allowedDates[0]!;
  const canPickOther = minDate < (quickDates[quickDates.length - 1] ?? today);
  const router = useRouter();
  const clock = useFactoryClock(timezone);
  const submitting = useRef(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<{ machine: string; component: string; hour: number; date: string; qty: number } | null>(null);

  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(entrySchema),
    mode: "onTouched",
    defaultValues: {
      machineId: machines.length === 1 ? machines[0]!.id : "",
      componentId: "",
      productionDate: allowedDates[0],
      hourSlot: clock.hour,
      quantity: "",
      clientRequestId: newRequestId(),
      operatorId: null,
      notes: "",
    },
  });
  const { control, register, formState, setValue, getValues } = form;
  const errors = formState.errors;

  const [machineId, componentId, productionDate, hourSlot, operatorId] = useWatch({
    control,
    name: ["machineId", "componentId", "productionDate", "hourSlot", "operatorId"],
  });

  const hours = useMemo(() => selectableHours(productionDate, timezone), [productionDate, timezone, clock.hour, clock.date]); // eslint-disable-line react-hooks/exhaustive-deps
  const currentShift = shiftForHour(shifts, Number(hourSlot)) ?? shifts[0]?.code ?? null;
  const [shiftView, setShiftView] = useState<string | null>(currentShift);
  const activeShifts = shifts.filter((s) => s.is_active);
  const viewShift = activeShifts.find((s) => s.code === shiftView);
  const gridHours = viewShift ? hoursOfShift(viewShift) : Array.from({ length: 24 }, (_, i) => i);

  // Staff recording for an operator: only machines that operator is assigned to.
  const selectableMachines = useMemo(() => {
    if (isOperator) return machines;
    const op = operators.find((o) => o.id === operatorId);
    return op ? machines.filter((m) => op.machineIds.includes(m.id)) : [];
  }, [isOperator, machines, operators, operatorId]);

  // Keep the chosen hour valid when the date changes.
  useEffect(() => {
    if (!hours.includes(Number(getValues("hourSlot")))) {
      const last = hours[hours.length - 1];
      if (last !== undefined) setValue("hourSlot", last, { shouldValidate: true });
    }
  }, [hours, getValues, setValue]);

  const filledHours = useMemo(() => {
    const set = new Set<number>();
    for (const e of existing) {
      if (e.status === "active" && e.machineId === machineId && e.date === productionDate) set.add(e.hour);
    }
    return set;
  }, [existing, machineId, productionDate]);

  const duplicate = existing.find(
    (e) =>
      e.status === "active" &&
      e.machineId === machineId &&
      e.componentId === componentId &&
      e.date === productionDate &&
      e.hour === Number(hourSlot),
  );

  const recentIds = useMemo(() => {
    const seen: string[] = [];
    for (const e of existing) if (!seen.includes(e.componentId)) seen.push(e.componentId);
    return seen.slice(0, 6);
  }, [existing]);

  const machine = machines.find((m) => m.id === machineId);
  const component = components.find((c) => c.id === componentId);

  async function openReview() {
    setServerError(null);
    const ok = await form.trigger();
    if (ok) setReviewOpen(true);
    else toast.error("Please complete the highlighted fields.");
  }

  const saveEntry = async (values: FormOut) => {
    if (submitting.current) return; // double-tap guard
    submitting.current = true;
    setPending(true);
    setServerError(null);
    try {
      const res = await submitEntry(values);
      if (res.ok) {
        setLastSaved({
          machine: machine?.code ?? "",
          component: component?.component_name ?? "",
          hour: values.hourSlot,
          date: values.productionDate,
          qty: values.quantity,
        });
        toast.success(`Saved: ${formatQty(values.quantity)} pcs · ${formatHourSlot(values.hourSlot)}`);
        setReviewOpen(false);
        // Fresh request id only after a confirmed save, so retries stay idempotent.
        form.reset({ ...getValues(), quantity: "", notes: "", clientRequestId: newRequestId() });
        router.refresh();
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(40);
      } else {
        setServerError(res.error);
        if (res.fieldErrors) {
          for (const [k, msg] of Object.entries(res.fieldErrors)) form.setError(k as keyof FormIn, { message: msg });
        }
      }
    } catch {
      setServerError("Network problem — your entry may not have been saved. Tap Submit again; it will not create a duplicate.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };
  // Built at tap time (not during render) so the double-tap ref is only read in the handler.
  const onSubmit = () => form.handleSubmit(saveEntry)();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-navy-900">Log production</h1>
          <p className="text-sm text-muted" suppressHydrationWarning>
            {formatDisplayDate(clock.date)} · now {String(clock.hour).padStart(2, "0")}:{String(clock.minute).padStart(2, "0")}
          </p>
        </div>
      </div>

      {lastSaved && (
        <Alert variant="success" title="Entry saved">
          {formatQty(lastSaved.qty)} pcs of {lastSaved.component} on {lastSaved.machine}, {formatHourSlot(lastSaved.hour)} (
          {formatDisplayDate(lastSaved.date)}).
        </Alert>
      )}

      <form onSubmit={(e) => { e.preventDefault(); void openReview(); }} className="space-y-4" noValidate>
        <input type="hidden" {...register("clientRequestId")} />

        {/* Operator & machine */}
        <Card className="space-y-4 p-4">
          {isOperator ? (
            <div className="flex items-center gap-3">
              <Avatar id={props.operatorId} name={props.operatorName} version={props.photos[props.operatorId]} size={48} />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Operator</p>
                <p className="truncate font-semibold text-navy-900">
                  {props.operatorName}
                  {props.operatorCode && <span className="font-normal text-muted"> · {props.operatorCode}</span>}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="operatorId">Operator</Label>
              <Controller
                control={control}
                name="operatorId"
                render={({ field }) => (
                  <NativeSelect
                    id="operatorId"
                    value={field.value ?? ""}
                    onChange={(e) => {
                      field.onChange(e.target.value || null);
                      setValue("machineId", "");
                    }}
                    className="h-12"
                  >
                    <option value="">Choose operator…</option>
                    {operators.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.display_name}{o.employee_code ? ` (${o.employee_code})` : ""}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              />
              {(() => {
                const chosen = operators.find((o) => o.id === operatorId);
                return chosen ? (
                  <div className="flex items-center gap-2 pt-1">
                    <Avatar id={chosen.id} name={chosen.display_name} version={props.photos[chosen.id]} size={40} />
                    <span className="text-sm font-semibold text-navy-900">{chosen.display_name}</span>
                  </div>
                ) : null;
              })()}
              <p className="text-xs text-muted">You are recording on behalf of this operator; you are logged as “entered by”.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-navy-800" id="machine-label">Machine</p>
            {selectableMachines.length === 1 && isOperator ? (
              <div className="flex items-center gap-3 rounded-lg border border-line bg-canvas px-4 py-3">
                <Factory className="size-5 text-brand" />
                <div>
                  <p className="font-bold text-navy-900">{selectableMachines[0]!.code}</p>
                  <p className="text-xs text-muted">{selectableMachines[0]!.name}</p>
                </div>
              </div>
            ) : selectableMachines.length === 0 ? (
              <p className="text-sm text-muted">{isOperator ? "No machine assigned." : "Choose an operator first (only their assigned machines are shown)."}</p>
            ) : (
              <Controller
                control={control}
                name="machineId"
                render={({ field }) => (
                  <div role="radiogroup" aria-labelledby="machine-label" className="grid grid-cols-3 gap-2">
                    {selectableMachines.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={field.value === m.id}
                        onClick={() => field.onChange(m.id)}
                        className={cn(
                          "min-h-14 rounded-lg border px-2 py-2 text-center font-bold",
                          field.value === m.id ? "border-brand bg-brand text-white" : "border-line bg-surface text-navy-900",
                        )}
                      >
                        {m.code}
                      </button>
                    ))}
                  </div>
                )}
              />
            )}
            <FieldError message={errors.machineId?.message} />
          </div>
        </Card>

        {/* Date, shift, hour */}
        <Card className="space-y-4 p-4">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-navy-800" id="date-label">Production date</p>
            <Controller
              control={control}
              name="productionDate"
              render={({ field }) => (
                <div role="radiogroup" aria-labelledby="date-label" className="flex flex-wrap gap-2">
                  {quickDates.map((d, i) => (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={field.value === d}
                      onClick={() => field.onChange(d)}
                      className={cn(
                        "min-h-12 shrink-0 rounded-lg border px-4 text-sm font-semibold",
                        field.value === d ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-surface text-navy-900",
                      )}
                    >
                      {i === 0 ? "Today" : "Yesterday"}
                    </button>
                  ))}
                  {canPickOther && (
                    <label
                      className={cn(
                        "flex min-h-12 items-center gap-2 rounded-lg border px-3 text-sm font-semibold",
                        !quickDates.includes(field.value) ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-surface text-navy-900",
                      )}
                    >
                      <CalendarDays className="size-4 shrink-0" aria-hidden />
                      <span className="sr-only">Other date</span>
                      <input
                        type="date"
                        min={minDate}
                        max={today}
                        value={quickDates.includes(field.value) ? "" : field.value}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v && v >= minDate && v <= today) field.onChange(v);
                        }}
                        aria-label="Other date"
                        className={cn("min-w-0 bg-transparent font-semibold outline-none", quickDates.includes(field.value) ? "[color-scheme:light]" : "[color-scheme:dark]")}
                      />
                    </label>
                  )}
                </div>
              )}
            />
            <FieldError message={errors.productionDate?.message} />
          </div>

          {activeShifts.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-navy-800">Shift</p>
              <div className="flex gap-2">
                {activeShifts.map((s) => (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => setShiftView(s.code)}
                    aria-pressed={shiftView === s.code}
                    className={cn(
                      "min-h-11 flex-1 rounded-lg border text-sm font-semibold",
                      shiftView === s.code ? "border-brand bg-brand-50 text-brand" : "border-line text-navy-800",
                    )}
                  >
                    {s.code}
                    <span className="block text-[10px] font-medium text-muted">
                      {String(s.start_hour).padStart(2, "0")}–{String(s.end_hour).padStart(2, "0")}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-navy-800" id="hour-label">Hour</p>
            <Controller
              control={control}
              name="hourSlot"
              render={({ field }) => (
                <div role="radiogroup" aria-labelledby="hour-label" className="grid grid-cols-4 gap-2">
                  {gridHours.map((h) => {
                    const enabled = hours.includes(h);
                    const filled = filledHours.has(h);
                    const selected = Number(field.value) === h;
                    return (
                      <button
                        key={h}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={!enabled}
                        onClick={() => field.onChange(h)}
                        className={cn(
                          "relative min-h-12 rounded-lg border text-sm font-bold tabular",
                          selected ? "border-brand bg-brand text-white" : "border-line bg-surface text-navy-900",
                          !enabled && "border-dashed bg-slate-50 text-slate-300",
                        )}
                        aria-label={`${formatHourSlot(h)}${filled ? ", already has entries" : ""}${enabled ? "" : ", in the future"}`}
                      >
                        {String(h).padStart(2, "0")}:00
                        {filled && (
                          <span className={cn("absolute right-1 top-1 size-2 rounded-full", selected ? "bg-white" : "bg-success")} aria-hidden />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            />
            <p className="text-xs text-muted">
              Selected: <strong>{formatHourSlot(Number(hourSlot))}</strong>
              {currentShift ? ` · Shift ${currentShift}` : ""} · <span className="inline-block size-2 rounded-full bg-success align-middle" /> = already logged on this machine
            </p>
            <FieldError message={errors.hourSlot?.message} />
          </div>
        </Card>

        {/* Component & quantity */}
        <Card className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="component">Component</Label>
            <Controller
              control={control}
              name="componentId"
              render={({ field }) => (
                <ComponentPicker
                  id="component"
                  components={components}
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v);
                    field.onBlur();
                  }}
                  recentIds={recentIds}
                  invalid={Boolean(errors.componentId)}
                />
              )}
            />
            <FieldError message={errors.componentId?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quantity">Quantity produced (pcs)</Label>
            <Input
              id="quantity"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              enterKeyHint="done"
              placeholder="0"
              aria-invalid={Boolean(errors.quantity) || undefined}
              className="h-16 text-center text-3xl font-bold tabular"
              {...register("quantity")}
            />
            <FieldError message={errors.quantity?.message} />
            <p className="text-xs text-muted">Whole number, 1 – {formatQty(props.maxQuantity)}.</p>
          </div>

          <details className="group">
            <summary className="cursor-pointer text-sm font-semibold text-brand">Add a note (optional)</summary>
            <Textarea className="mt-2" maxLength={500} placeholder="e.g. mould change at :30" {...register("notes")} />
          </details>
        </Card>

        {duplicate && (
          <Alert variant="warning" title="Already logged">
            {formatQty(duplicate.quantity)} pcs of this component are already recorded for this hour on this machine. To change it,
            use <strong>Request correction</strong> on that record below.
          </Alert>
        )}
        {serverError && <Alert variant="error">{serverError}</Alert>}

        <Button type="submit" size="xl" className="w-full" disabled={pending || Boolean(duplicate)}>
          <ClipboardCheck className="!size-5" /> Review &amp; submit
        </Button>
      </form>

      <Dialog open={reviewOpen} onOpenChange={(o) => !pending && setReviewOpen(o)}>
        <DialogContent title="Confirm entry" description="Check the details before saving.">
          <dl className="divide-y divide-line rounded-lg border border-line text-sm">
            <Row label="Operator" value={isOperator ? props.operatorName : (operators.find((o) => o.id === operatorId)?.display_name ?? "—")} />
            <Row label="Machine" value={machine ? `${machine.code} · ${machine.name}` : "—"} />
            <Row label="Date" value={formatDisplayDate(productionDate)} />
            <Row label="Hour" value={`${formatHourSlot(Number(hourSlot))}${currentShift ? ` · Shift ${currentShift}` : ""}`} />
            <Row label="Component" value={component ? component.component_name : "—"} />
            <div className="flex items-center justify-between px-3 py-3">
              <dt className="text-muted">Quantity</dt>
              <dd className="text-2xl font-bold text-navy-900 tabular">{formatQty(Number(getValues("quantity")) || 0)} pcs</dd>
            </div>
          </dl>
          {serverError && <Alert variant="error" className="mt-3">{serverError}</Alert>}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" size="lg" onClick={() => setReviewOpen(false)} disabled={pending}>
              Edit
            </Button>
            <Button type="button" variant="success" size="lg" onClick={() => void onSubmit()} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Send />}
              {pending ? "Saving…" : "Submit"}
            </Button>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
            <CheckCircle2 className="size-3.5" /> Tapping twice will not create a duplicate.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2.5">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold text-navy-900">{value}</dd>
    </div>
  );
}
