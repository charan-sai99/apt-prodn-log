export type Role = "admin" | "supervisor" | "operator";
export const ROLES: Role[] = ["operator", "supervisor", "admin"];

export interface Profile {
  id: string;
  display_name: string;
  employee_code: string | null;
  role: Role | "customer";
  is_active: boolean;
  created_at: string;
  designation?: string | null;
  display_order?: number;
  show_on_login?: boolean;
}

export interface Machine {
  id: string;
  machine_code: string;
  machine_name: string;
  machine_type: "vertical_injection" | "horizontal_injection" | "other";
  legacy_code: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface Component {
  id: string;
  zoho_item_id: string | null;
  component_code: string | null;
  component_name: string;
  description: string | null;
  product_type: string | null;
  raw_material: string | null;
  is_active: boolean;
}

export interface Shift {
  code: string;
  name: string;
  start_hour: number;
  end_hour: number;
  sort_order: number;
  is_active: boolean;
}

export interface Settings {
  timezone: string;
  operator_backdate_days: number;
  max_quantity_per_entry: number;
}

export interface Assignment {
  id: string;
  operator_id: string;
  machine_id: string;
  is_active: boolean;
  assigned_at: string;
  unassigned_at: string | null;
}

/** Row of the production_entries_enriched view. */
export interface EntryRow {
  id: string;
  production_date: string;
  hour_slot: number;
  shift: string | null;
  quantity: number;
  status: "active" | "voided";
  source: "app" | "legacy_import";
  notes: string | null;
  created_at: string;
  updated_at: string;
  operator_id: string | null;
  entered_by: string | null;
  operator_name: string | null;
  operator_code: string | null;
  entered_by_name: string | null;
  machine_id: string;
  machine_code: string;
  machine_name: string;
  component_id: string;
  component_name: string;
  component_code: string | null;
  zoho_item_id: string | null;
  raw_material: string | null;
}

export interface CorrectionRequest {
  id: string;
  production_entry_id: string;
  requested_by: string;
  request_type: "change" | "void";
  proposed_quantity: number | null;
  proposed_component_id: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  entity_type: string;
  entity_id: string | null;
  production_entry_id: string | null;
  changed_by: string | null;
  action: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };
