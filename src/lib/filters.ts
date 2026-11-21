import { recordFiltersSchema, type RecordFilters } from "./validation";
import { str, UUID_RE } from "./params";
import { isValidIsoDate } from "./time";

/** Parse record filters from URL search params, dropping anything invalid. */
export function parseRecordFilters(sp: Record<string, string | string[] | undefined>, defaults: { from: string; to: string }): RecordFilters & { from: string; to: string } {
  const raw = {
    from: str(sp.from),
    to: str(sp.to),
    machine: str(sp.machine)?.toUpperCase(),
    operator: str(sp.operator),
    component: str(sp.component),
    shift: str(sp.shift)?.toUpperCase(),
    q: str(sp.q),
    status: str(sp.status),
  };
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!v) continue;
    if ((k === "operator" || k === "component") && !UUID_RE.test(v)) continue;
    if ((k === "from" || k === "to") && !isValidIsoDate(v)) continue;
    if (k === "machine" && !/^[A-Z0-9_-]{2,16}$/.test(v)) continue;
    if (k === "shift" && !/^[A-Z0-9]{1,4}$/.test(v)) continue;
    if (k === "status" && !["active", "voided", "all"].includes(v)) continue;
    clean[k] = v;
  }
  const parsed = recordFiltersSchema.safeParse(clean);
  const f = parsed.success ? parsed.data : {};
  let from = f.from ?? defaults.from;
  let to = f.to ?? defaults.to;
  if (from > to) [from, to] = [to, from];
  return { ...f, from, to };
}

export function filtersToQuery(f: RecordFilters, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra })) if (v) p.set(k, String(v));
  return p.toString();
}
