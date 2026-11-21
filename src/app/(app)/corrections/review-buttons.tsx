"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { reviewCorrection } from "./actions";

export function ReviewButtons({ requestId }: { requestId: string }) {
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const act = (approve: boolean) =>
    start(async () => {
      const res = await reviewCorrection({ requestId, approve, note: note || null });
      if (res.ok) toast.success(res.message);
      else toast.error(res.fieldErrors?.note ?? res.error);
    });
  return (
    <div className="space-y-2">
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (required to reject)" maxLength={500} className="min-h-14 text-sm" aria-label="Review note" />
      <div className="flex gap-2">
        <Button variant="success" size="sm" disabled={pending} onClick={() => act(true)}><Check /> Approve</Button>
        <Button variant="danger-outline" size="sm" disabled={pending} onClick={() => act(false)}><X /> Reject</Button>
      </div>
    </div>
  );
}
