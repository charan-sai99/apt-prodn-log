import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getComponents, getMachines, getShifts } from "./data";

export async function getFilterLookups(supabase: SupabaseClient) {
  const [machines, shifts, components, { data: ops }] = await Promise.all([
    getMachines(supabase, true),
    getShifts(supabase),
    getComponents(supabase, true),
    supabase.from("profiles").select("id, display_name").in("role", ["operator", "supervisor", "admin"]).order("display_name"),
  ]);
  return {
    machines,
    shifts,
    components: components.map((c) => ({ id: c.id, component_name: c.component_name, raw_material: c.raw_material, is_active: c.is_active })),
    operators: (ops ?? []) as { id: string; display_name: string }[],
  };
}
