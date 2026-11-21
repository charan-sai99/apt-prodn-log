import Image from "next/image";
import { cn } from "@/lib/utils";

export function Brand({ inverted = false, compact = false, className }: { inverted?: boolean; compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Image src="/apt-mark.png" alt="APT" width={compact ? 32 : 40} height={compact ? 32 : 40} className="rounded-md" priority />
      <div className="leading-tight">
        <p className={cn("brand-wordmark text-[15px] uppercase", inverted ? "text-white" : "text-navy-900")}>
          APT Production Log
        </p>
        {!compact && (
          <p className={cn("text-[11px] font-medium tracking-wide", inverted ? "text-slate-300" : "text-muted")}>
            Axis Plastics Transition
          </p>
        )}
      </div>
    </div>
  );
}
