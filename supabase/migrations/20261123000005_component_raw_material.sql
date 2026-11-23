-- =============================================================================
-- APT Production Log — 0005 raw material on components
-- =============================================================================
-- Production components (moulded child parts) are managed independently of
-- Zoho: zoho_item_id stays optional, and the component name is the key
-- (already unique, case-insensitive). This adds the raw material used to
-- mould each part, and exposes it in the reporting view.
-- Safe to re-run; changes no existing data.
-- =============================================================================

alter table public.components add column if not exists raw_material text;

alter table public.components drop constraint if exists components_raw_material_length;
alter table public.components
  add constraint components_raw_material_length
  check (raw_material is null or length(raw_material) <= 80);

-- Same view as 0002 with raw_material appended (columns can only be added at the end).
create or replace view public.production_entries_enriched
with (security_invoker = true)
as
select
  e.id,
  e.production_date,
  e.hour_slot,
  e.shift,
  e.quantity,
  e.status,
  e.source,
  e.notes,
  e.created_at,
  e.updated_at,
  e.operator_id,
  e.entered_by,
  coalesce(op.display_name, e.legacy_operator_name) as operator_name,
  op.employee_code as operator_code,
  coalesce(eb.display_name, e.legacy_entered_by_name) as entered_by_name,
  e.machine_id,
  m.machine_code,
  m.machine_name,
  e.component_id,
  c.component_name,
  c.component_code,
  c.zoho_item_id,
  c.raw_material
from public.production_entries e
join public.machines m on m.id = e.machine_id
join public.components c on c.id = e.component_id
left join public.profiles op on op.id = e.operator_id
left join public.profiles eb on eb.id = e.entered_by;

revoke all on public.production_entries_enriched from anon;
grant select on public.production_entries_enriched to authenticated;
