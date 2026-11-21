import type { EntryRow } from "./types";

export interface Bucket {
  key: string;
  label: string;
  quantity: number;
  entries: number;
}

export interface ProductionSummary {
  totalQuantity: number;
  entryCount: number;
  activeOperators: number;
  byMachine: Bucket[];
  byComponent: Bucket[];
  byOperator: Bucket[];
  byShift: Bucket[];
  byHour: Bucket[];
  byDate: Bucket[];
}

function bump(map: Map<string, Bucket>, key: string, label: string, qty: number) {
  const b = map.get(key);
  if (b) {
    b.quantity += qty;
    b.entries += 1;
  } else {
    map.set(key, { key, label, quantity: qty, entries: 1 });
  }
}

const byQtyDesc = (a: Bucket, b: Bucket) => b.quantity - a.quantity || a.label.localeCompare(b.label);

/**
 * Aggregate production rows. Voided records are excluded.
 * `machineOrder` keeps every machine present (with zero) in a stable order.
 */
export function summarize(
  rows: EntryRow[],
  opts: { machineOrder?: { code: string; name: string }[]; dates?: string[] } = {},
): ProductionSummary {
  const active = rows.filter((r) => r.status === "active");
  const machine = new Map<string, Bucket>();
  const component = new Map<string, Bucket>();
  const operator = new Map<string, Bucket>();
  const shift = new Map<string, Bucket>();
  const hour = new Map<string, Bucket>();
  const date = new Map<string, Bucket>();

  for (const m of opts.machineOrder ?? []) machine.set(m.code, { key: m.code, label: m.code, quantity: 0, entries: 0 });
  for (let h = 0; h < 24; h++) {
    const k = String(h).padStart(2, "0");
    hour.set(k, { key: k, label: `${k}:00`, quantity: 0, entries: 0 });
  }
  for (const d of opts.dates ?? []) date.set(d, { key: d, label: d, quantity: 0, entries: 0 });

  let total = 0;
  for (const r of active) {
    total += r.quantity;
    bump(machine, r.machine_code, r.machine_code, r.quantity);
    bump(component, r.component_id, r.component_name, r.quantity);
    bump(operator, r.operator_id ?? `legacy:${r.operator_name ?? "unknown"}`, r.operator_name ?? "Unknown", r.quantity);
    bump(shift, r.shift ?? "-", r.shift ? `Shift ${r.shift}` : "No shift", r.quantity);
    const hk = String(r.hour_slot).padStart(2, "0");
    bump(hour, hk, `${hk}:00`, r.quantity);
    bump(date, r.production_date, r.production_date, r.quantity);
  }

  const machineList = [...machine.values()];
  if (!opts.machineOrder) machineList.sort(byQtyDesc);

  return {
    totalQuantity: total,
    entryCount: active.length,
    activeOperators: new Set(active.map((r) => r.operator_id ?? `legacy:${r.operator_name}`)).size,
    byMachine: machineList,
    byComponent: [...component.values()].sort(byQtyDesc),
    byOperator: [...operator.values()].sort(byQtyDesc),
    byShift: [...shift.values()].sort((a, b) => a.key.localeCompare(b.key)),
    byHour: [...hour.values()],
    byDate: [...date.values()].sort((a, b) => a.key.localeCompare(b.key)),
  };
}
