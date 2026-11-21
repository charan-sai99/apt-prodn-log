import { Card } from "@/components/ui/card";

export function StatTile({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        {icon && <span className="text-brand">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-bold text-navy-900 tabular sm:text-3xl">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </Card>
  );
}
