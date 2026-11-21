import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

/** Plain GET form so filters live in the URL (shareable, back-button friendly). */
export function DateRangeForm({ from, to, children }: { from: string; to: string; children?: React.ReactNode }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="from">From</Label>
        <Input id="from" name="from" type="date" defaultValue={from} className="w-40" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="to">To</Label>
        <Input id="to" name="to" type="date" defaultValue={to} className="w-40" />
      </div>
      {children}
      <Button type="submit" variant="navy">Apply</Button>
    </form>
  );
}
