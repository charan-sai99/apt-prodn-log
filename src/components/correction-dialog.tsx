"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Wrench } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { ComponentPicker, type PickerComponent } from "@/components/component-picker";
import { requestCorrection } from "@/app/(app)/entry/actions";
import { formatHourSlot } from "@/lib/time";
import { cn, formatQty } from "@/lib/utils";

export interface CorrectableEntry {
  id: string;
  production_date: string;
  hour_slot: number;
  machine_code: string;
  component_id: string;
  component_name: string;
  quantity: number;
}

export function CorrectionDialog({
  entry,
  components,
  triggerClassName,
}: {
  entry: CorrectableEntry;
  components: PickerComponent[];
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"change" | "void">("change");
  const [qty, setQty] = useState("");
  const [componentId, setComponentId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    setErrors({});
    const res = await requestCorrection({
      entryId: entry.id,
      requestType: type,
      reason,
      proposedQuantity: type === "change" ? qty : null,
      proposedComponentId: type === "change" ? componentId : null,
    });
    setPending(false);
    if (res.ok) {
      toast.success(res.message ?? "Correction requested");
      setOpen(false);
      setQty("");
      setReason("");
      setComponentId(null);
      router.refresh();
    } else {
      setError(res.error);
      setErrors(res.fieldErrors ?? {});
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={triggerClassName}>
          <Wrench /> Request correction
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Request correction"
        description={`${entry.machine_code} · ${entry.production_date} · ${formatHourSlot(entry.hour_slot)}`}
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-canvas p-3 text-sm">
            <p className="text-muted">Current record</p>
            <p className="font-semibold text-navy-900">{entry.component_name}</p>
            <p className="text-lg font-bold tabular">{formatQty(entry.quantity)} pcs</p>
          </div>

          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Correction type">
            {(["change", "void"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                onClick={() => setType(t)}
                className={cn(
                  "min-h-12 rounded-lg border text-sm font-semibold",
                  type === t ? (t === "void" ? "border-danger bg-danger-50 text-danger" : "border-brand bg-brand-50 text-brand") : "border-line",
                )}
              >
                {t === "change" ? "Fix quantity / component" : "Entered by mistake"}
              </button>
            ))}
          </div>

          {type === "change" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor={`cq-${entry.id}`}>Correct quantity</Label>
                <Input
                  id={`cq-${entry.id}`}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder={String(entry.quantity)}
                  className="h-14 text-center text-2xl font-bold"
                  aria-invalid={Boolean(errors.proposedQuantity) || undefined}
                />
                <FieldError message={errors.proposedQuantity} />
              </div>
              <div className="space-y-1.5">
                <Label>Correct component (only if wrong)</Label>
                <ComponentPicker components={components} value={componentId} onChange={setComponentId} placeholder="Keep current component" />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor={`cr-${entry.id}`}>Reason</Label>
            <Textarea
              id={`cr-${entry.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder="What went wrong?"
              aria-invalid={Boolean(errors.reason) || undefined}
            />
            <FieldError message={errors.reason} />
          </div>

          {error && <Alert variant="error">{error}</Alert>}
          <Alert variant="info">The original record stays unchanged until a supervisor approves your request.</Alert>
          <Button className="w-full" size="lg" onClick={submit} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Send request
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
