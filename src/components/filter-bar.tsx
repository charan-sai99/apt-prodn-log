import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import type { Machine, Shift } from "@/lib/types";
import type { RecordFilters } from "@/lib/validation";

export function FilterBar({
  filters,
  machines,
  operators,
  components,
  shifts,
  resetHref,
  showStatus = true,
}: {
  filters: RecordFilters & { from: string; to: string };
  machines: Machine[];
  operators: { id: string; display_name: string }[];
  components: { id: string; component_name: string }[];
  shifts: Shift[];
  resetHref: string;
  showStatus?: boolean;
}) {
  return (
    <form method="get" className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      <div className="space-y-1">
        <Label htmlFor="f-from">From</Label>
        <Input id="f-from" type="date" name="from" defaultValue={filters.from} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="f-to">To</Label>
        <Input id="f-to" type="date" name="to" defaultValue={filters.to} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="f-machine">Machine</Label>
        <NativeSelect id="f-machine" name="machine" defaultValue={filters.machine ?? ""}>
          <option value="">All</option>
          {machines.map((m) => <option key={m.id} value={m.machine_code}>{m.machine_code}</option>)}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="f-shift">Shift</Label>
        <NativeSelect id="f-shift" name="shift" defaultValue={filters.shift ?? ""}>
          <option value="">All</option>
          {shifts.map((s) => <option key={s.code} value={s.code}>{s.code}</option>)}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="f-operator">Operator</Label>
        <NativeSelect id="f-operator" name="operator" defaultValue={filters.operator ?? ""}>
          <option value="">All</option>
          {operators.map((o) => <option key={o.id} value={o.id}>{o.display_name}</option>)}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="f-component">Component</Label>
        <NativeSelect id="f-component" name="component" defaultValue={filters.component ?? ""}>
          <option value="">All</option>
          {components.map((c) => <option key={c.id} value={c.id}>{c.component_name}</option>)}
        </NativeSelect>
      </div>
      {showStatus && (
        <div className="space-y-1">
          <Label htmlFor="f-status">Status</Label>
          <NativeSelect id="f-status" name="status" defaultValue={filters.status ?? "active"}>
            <option value="active">Active</option>
            <option value="voided">Voided</option>
            <option value="all">All</option>
          </NativeSelect>
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="f-q">Search</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input id="f-q" name="q" defaultValue={filters.q ?? ""} placeholder="Name, code…" className="pl-9" />
        </div>
      </div>
      <div className="col-span-2 flex gap-2 md:col-span-4 xl:col-span-8">
        <Button type="submit" variant="navy">Apply filters</Button>
        <Button asChild variant="ghost"><Link href={resetHref}>Reset</Link></Button>
      </div>
    </form>
  );
}
