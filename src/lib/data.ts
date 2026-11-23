import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_FACTORY_TIMEZONE } from "./env";
import type { Component, EntryRow, Machine, Settings, Shift } from "./types";
import type { RecordFilters } from "./validation";

export async function getSettings(supabase: SupabaseClient): Promise<Settings> {
  const { data } = await supabase
    .from("prodlog_settings")
    .select("timezone, operator_backdate_days, max_quantity_per_entry")
    .maybeSingle<Settings>();
  return data ?? { timezone: DEFAULT_FACTORY_TIMEZONE, operator_backdate_days: 1, max_quantity_per_entry: 100000 };
}

export async function getShifts(supabase: SupabaseClient): Promise<Shift[]> {
  const { data } = await supabase.from("shifts").select("*").order("sort_order");
  return (data ?? []) as Shift[];
}

export async function getMachines(supabase: SupabaseClient, includeInactive = false): Promise<Machine[]> {
  let q = supabase.from("machines").select("*").order("sort_order").order("machine_code");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data } = await q;
  return (data ?? []) as Machine[];
}

const COMPONENT_COLUMNS = "id, zoho_item_id, component_code, component_name, description, product_type, raw_material, is_active";
// Until migration 0005 is applied there is no raw_material column; fall back so the app keeps working.
const COMPONENT_COLUMNS_PRE_0005 = "id, zoho_item_id, component_code, component_name, description, product_type, is_active";

export async function getComponents(supabase: SupabaseClient, includeInactive = false): Promise<Component[]> {
  const first = await loadComponents(supabase, includeInactive, COMPONENT_COLUMNS);
  if (first.ok) return first.rows;
  const fallback = await loadComponents(supabase, includeInactive, COMPONENT_COLUMNS_PRE_0005);
  return fallback.rows.map((c) => ({ ...c, raw_material: c.raw_material ?? null }));
}

async function loadComponents(
  supabase: SupabaseClient,
  includeInactive: boolean,
  columns: string,
): Promise<{ ok: boolean; rows: Component[] }> {
  const out: Component[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase
      .from("components")
      .select(columns)
      .order("component_name")
      .range(from, from + 999);
    if (!includeInactive) q = q.eq("is_active", true);
    const { data, error } = await q;
    if (error) return { ok: false, rows: out };
    if (!data) break;
    out.push(...(data as unknown as Component[]));
    if (data.length < 1000) break;
  }
  return { ok: true, rows: out };
}

export const ENTRY_FETCH_LIMIT = 20000;

/**
 * Reads production rows (RLS applies: operators only ever get their own).
 * Pages through results; `truncated` is true if the limit was reached.
 */
export async function fetchEntries(
  supabase: SupabaseClient,
  f: RecordFilters & { operatorSelf?: string },
  limit = ENTRY_FETCH_LIMIT,
): Promise<{ rows: EntryRow[]; truncated: boolean; error?: string }> {
  const rows: EntryRow[] = [];
  const page = 1000;
  for (let from = 0; from < limit; from += page) {
    let q = supabase
      .from("production_entries_enriched")
      .select("*")
      .order("production_date", { ascending: false })
      .order("hour_slot", { ascending: false })
      .order("machine_code")
      .range(from, Math.min(from + page, limit) - 1);
    if (f.from) q = q.gte("production_date", f.from);
    if (f.to) q = q.lte("production_date", f.to);
    if (f.machine) q = q.eq("machine_code", f.machine);
    if (f.operator) q = q.eq("operator_id", f.operator);
    if (f.operatorSelf) q = q.eq("operator_id", f.operatorSelf);
    if (f.component) q = q.eq("component_id", f.component);
    if (f.shift) q = q.eq("shift", f.shift);
    if (!f.status || f.status === "active") q = q.eq("status", "active");
    else if (f.status === "voided") q = q.eq("status", "voided");
    if (f.q) {
      const term = f.q.replace(/[%_,()*\\]/g, " ").trim();
      if (term) {
        q = q.or(
          `component_name.ilike.%${term}%,component_code.ilike.%${term}%,operator_name.ilike.%${term}%,machine_code.ilike.%${term}%`,
        );
      }
    }
    const { data, error } = await q;
    if (error) return { rows, truncated: false, error: error.message };
    rows.push(...((data ?? []) as EntryRow[]));
    if (!data || data.length < page) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}
