"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelCorrection } from "../entry/actions";

export function CancelButton({ requestId }: { requestId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await cancelCorrection(requestId);
          if (res.ok) toast.success(res.message ?? "Cancelled");
          else toast.error(res.error);
        })
      }
    >
      Cancel request
    </Button>
  );
}
