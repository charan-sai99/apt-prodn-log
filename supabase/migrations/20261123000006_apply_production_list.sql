-- =============================================================================
-- APT Production Log — 0006 apply an uploaded production component list
-- =============================================================================
-- Used by Admin → Components → "Upload production list". In ONE transaction:
--   * adds parts that are new,
--   * updates name spelling / raw material of existing parts,
--   * re-activates listed parts that were hidden,
--   * (optionally) hides every active part not on the list.
-- Nothing is deleted, so production history keeps its components. Every row
-- change is written to production_audit_logs by the existing audit trigger.
-- Administrators only. Safe to re-run this migration.
-- =============================================================================

create or replace function public.apply_production_list(
  p_items       jsonb,
  p_hide_others boolean default true
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_item        jsonb;
  v_name        text;
  v_raw         text;
  v_keys        text[] := '{}';
  v_row         public.components;
  v_inserted    integer := 0;
  v_updated     integer := 0;
  v_reactivated integer := 0;
  v_hidden      integer := 0;
begin
  if not public.is_prodlog_admin() then
    raise exception 'FORBIDDEN: only administrators can update the component list';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'INVALID_INPUT: the list has no parts';
  end if;
  if jsonb_array_length(p_items) > 2000 then
    raise exception 'INVALID_INPUT: the list has more than 2000 parts';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_name := regexp_replace(btrim(coalesce(v_item ->> 'component_name', '')), '\s+', ' ', 'g');
    v_raw  := nullif(regexp_replace(btrim(coalesce(v_item ->> 'raw_material', '')), '\s+', ' ', 'g'), '');
    if v_name = '' or length(v_name) > 200 then
      raise exception 'INVALID_INPUT: every part needs a name of at most 200 characters';
    end if;
    if v_raw is not null and length(v_raw) > 80 then
      raise exception 'INVALID_INPUT: raw material for % is longer than 80 characters', v_name;
    end if;
    if lower(v_name) = any (v_keys) then
      raise exception 'INVALID_INPUT: % appears twice in the list', v_name;
    end if;
    v_keys := v_keys || lower(v_name);

    select * into v_row
      from public.components
     where lower(regexp_replace(btrim(component_name), '\s+', ' ', 'g')) = lower(v_name)
     for update;

    if not found then
      insert into public.components (component_name, raw_material, is_active)
      values (v_name, v_raw, true);
      v_inserted := v_inserted + 1;
    elsif not v_row.is_active then
      update public.components set component_name = v_name, raw_material = v_raw, is_active = true where id = v_row.id;
      v_reactivated := v_reactivated + 1;
    elsif v_row.component_name is distinct from v_name or v_row.raw_material is distinct from v_raw then
      update public.components set component_name = v_name, raw_material = v_raw where id = v_row.id;
      v_updated := v_updated + 1;
    end if;
  end loop;

  if p_hide_others then
    update public.components
       set is_active = false
     where is_active
       and not (lower(regexp_replace(btrim(component_name), '\s+', ' ', 'g')) = any (v_keys));
    get diagnostics v_hidden = row_count;
  end if;

  return jsonb_build_object(
    'inserted', v_inserted,
    'updated', v_updated,
    'reactivated', v_reactivated,
    'hidden', v_hidden,
    'total', jsonb_array_length(p_items)
  );
end;
$$;

revoke all on function public.apply_production_list(jsonb, boolean) from public, anon;
grant execute on function public.apply_production_list(jsonb, boolean) to authenticated;
