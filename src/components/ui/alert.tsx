import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const styles = {
  info: { box: "border-blue-200 bg-brand-50 text-navy-800", Icon: Info, icon: "text-brand" },
  success: { box: "border-green-200 bg-success-50 text-green-900", Icon: CheckCircle2, icon: "text-success" },
  warning: { box: "border-amber-200 bg-warning-50 text-amber-900", Icon: AlertTriangle, icon: "text-warning" },
  error: { box: "border-red-200 bg-danger-50 text-red-900", Icon: XCircle, icon: "text-danger" },
};

export function Alert({
  variant = "info",
  title,
  children,
  className,
}: {
  variant?: keyof typeof styles;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const s = styles[variant];
  return (
    <div role={variant === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border p-3 text-sm", s.box, className)}>
      <s.Icon className={cn("mt-0.5 size-5 shrink-0", s.icon)} aria-hidden />
      <div className="space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}
