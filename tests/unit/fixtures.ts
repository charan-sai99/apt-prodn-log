import type { EntryRow } from "@/lib/types";

let n = 0;
export function row(p: Partial<EntryRow>): EntryRow {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    production_date: "2026-11-20",
    hour_slot: 8,
    shift: "A",
    quantity: 100,
    status: "active",
    source: "app",
    notes: null,
    created_at: "2026-11-20T03:00:00Z",
    updated_at: "2026-11-20T03:00:00Z",
    operator_id: "op-1",
    entered_by: "op-1",
    operator_name: "Operator One",
    operator_code: "OP1",
    entered_by_name: "Operator One",
    machine_id: "m-1",
    machine_code: "VIM1",
    machine_name: "Vertical Injection Moulding 1",
    component_id: "c-1",
    component_name: "N45 SPEEDO POINTER ASSEMBLY",
    component_code: "COM-SPA-00018",
    zoho_item_id: "74630000000006013",
    raw_material: "TR ORANGE",
    ...p,
  };
}
