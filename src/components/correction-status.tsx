import { Badge } from "@/components/ui/badge";
import type { CorrectionRequest } from "@/lib/types";

export function CorrectionStatusBadge({ status }: { status: CorrectionRequest["status"] }) {
  const map = {
    pending: { variant: "warning", label: "Pending" },
    approved: { variant: "success", label: "Approved" },
    rejected: { variant: "danger", label: "Rejected" },
    cancelled: { variant: "default", label: "Cancelled" },
  } as const;
  const m = map[status];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}
