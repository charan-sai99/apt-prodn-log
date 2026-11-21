"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/types";

/** Run a server action with pending state, toast feedback and a data refresh. */
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const run = (fn: () => Promise<ActionResult<unknown>>, onOk?: () => void) =>
    start(async () => {
      setFieldErrors({});
      try {
        const res = await fn();
        if (res.ok) {
          toast.success(res.message ?? "Saved");
          onOk?.();
          router.refresh();
        } else {
          setFieldErrors(res.fieldErrors ?? {});
          toast.error(res.error);
        }
      } catch {
        toast.error("Network problem — please try again.");
      }
    });
  return { pending, run, fieldErrors };
}
