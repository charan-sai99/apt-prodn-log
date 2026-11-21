-- =============================================================================
-- APT Production Log — 0002 helper functions, triggers, audit and RPCs
-- =============================================================================
-- All business writes to production data go through SECURITY DEFINER RPCs
-- that derive the acting user from auth.uid(). The browser never supplies a
-- role or an operator id that is trusted.
--
-- Errors raised by the RPCs start with a stable code word (e.g.
-- 'DUPLICATE_SLOT:') that the app maps to a user-friendly message.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Role helpers (independent of the Stock Portal's current_app_role()).
-- -----------------------------------------------------------------------------
create or replace function public.prodlog_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active
    and p.role in ('admin', 'supervisor', 'operator')
$$;

create or replace function public.is_prodlog_staff()
returns boolean
language sql stable security definer
set search_path = public
as $$ select coalesce(public.prodlog_role() in ('admin', 'supervisor'), false) $$;

create or replace function public.is_prodlog_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$ select coalesce(public.prodlog_role() = 'admin', false) $$;

create or replace function public.is_assigned_to_machine(p_machine_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.machine_assignments a
    where a.operator_id = auth.uid() and a.machine_id = p_machine_id and a.is_active
  )
$$;

-- True when the current session is a trusted backend (service role / owner),
-- e.g. the migration utility. Such sessions bypass RLS in Supabase anyway.
create or replace function public.prodlog_is_backend()
returns boolean
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
      or session_user in ('postgres', 'supabase_admin')
      and auth.uid() is null
$$;

create or replace function public.factory_timezone()
returns text
language sql stable security definer
set search_path = public
as $$ select coalesce((select timezone from public.prodlog_settings where id), 'Asia/Kolkata') $$;

create or replace function public.factory_today()
returns date
language sql stable
set search_path = public
as $$ select (now() at time zone public.factory_timezone())::date $$;

create or replace function public.shift_for_hour(p_hour integer)
returns text
language sql stable security definer
set search_path = public
as $$
  select s.code
  from public.shifts s
  where s.is_active
    and (
      (s.start_hour < s.end_hour and p_hour >= s.start_hour and p_hour < s.end_hour)
      or (s.start_hour >= s.end_hour and (p_hour >= s.start_hour or p_hour < s.end_hour))
    )
  order by s.sort_order, s.code
  limit 1
$$;

-- -----------------------------------------------------------------------------
-- Generic timestamp trigger
-- -----------------------------------------------------------------------------
create or replace function public.prodlog_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if to_jsonb(new) ? 'created_at' then new := jsonb_populate_record(new, jsonb_build_object('created_at', now())); end if;
  end if;
  new := jsonb_populate_record(new, jsonb_build_object('updated_at', now()));
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['machines', 'components', 'shifts', 'prodlog_settings', 'production_entries', 'profiles']
  loop
    execute format('drop trigger if exists prodlog_touch_updated_at on public.%I', t);
    execute format(
      'create trigger prodlog_touch_updated_at before insert or update on public.%I
         for each row execute function public.prodlog_touch_updated_at()', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Generic audit trigger (append-only log of every change)
-- -----------------------------------------------------------------------------
create or replace function public.prodlog_audit()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_id  text;
  v_entry uuid;
  v_action text;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old) - 'updated_at'; end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new) - 'updated_at'; end if;

  if tg_op = 'UPDATE' and v_old = v_new then
    return new;  -- nothing meaningful changed
  end if;

  -- Profiles are shared with the Stock Portal: only audit Production Log fields.
  if tg_table_name = 'profiles' and tg_op = 'UPDATE'
     and v_old->>'display_name' is not distinct from v_new->>'display_name'
     and v_old->>'role' is not distinct from v_new->>'role'
     and v_old->>'is_active' is not distinct from v_new->>'is_active'
     and v_old->>'employee_code' is not distinct from v_new->>'employee_code' then
    return new;
  end if;

  v_id := coalesce(v_new->>'id', v_old->>'id', v_new->>'code', v_old->>'code');
  if tg_table_name = 'production_entries' then
    v_entry := coalesce(new.id, old.id);
  elsif tg_table_name = 'correction_requests' then
    v_entry := coalesce(new.production_entry_id, old.production_entry_id);
  end if;

  v_action := lower(tg_op);
  if tg_table_name = 'production_entries' and tg_op = 'UPDATE'
     and v_old->>'status' = 'active' and v_new->>'status' = 'voided' then
    v_action := 'void';
  end if;

  insert into public.production_audit_logs
    (entity_type, entity_id, production_entry_id, changed_by, action, old_values, new_values)
  values
    (tg_table_name, v_id, v_entry, auth.uid(), v_action, v_old, v_new);

  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['machines', 'components', 'shifts', 'prodlog_settings',
                           'machine_assignments', 'production_entries',
                           'correction_requests', 'profiles']
  loop
    execute format('drop trigger if exists prodlog_audit on public.%I', t);
    execute format(
      'create trigger prodlog_audit after insert or update or delete on public.%I
         for each row execute function public.prodlog_audit()', t);
  end loop;
end $$;

-- Audit rows can never be changed or removed.
create or replace function public.prodlog_audit_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'AUDIT_IMMUTABLE: audit log entries cannot be modified or deleted';
end;
$$;
drop trigger if exists prodlog_audit_immutable on public.production_audit_logs;
create trigger prodlog_audit_immutable
  before update or delete on public.production_audit_logs
  for each row execute function public.prodlog_audit_immutable();

-- -----------------------------------------------------------------------------
-- Production entry integrity: immutable identity fields, no hard deletes.
-- -----------------------------------------------------------------------------
create or replace function public.prodlog_entry_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'FORBIDDEN: production records cannot be deleted; void them through a correction';
  end if;
  if new.operator_id is distinct from old.operator_id
     or new.machine_id is distinct from old.machine_id
     or new.production_date is distinct from old.production_date
     or new.hour_slot is distinct from old.hour_slot
     or new.source is distinct from old.source
     or new.created_at is distinct from old.created_at
     or new.client_request_id is distinct from old.client_request_id
     or new.import_key is distinct from old.import_key then
    raise exception 'FORBIDDEN: operator, machine, date and hour of a production record cannot be changed';
  end if;
  if old.status = 'voided' then
    raise exception 'FORBIDDEN: voided records cannot be changed';
  end if;
  return new;
end;
$$;
drop trigger if exists prodlog_entry_guard on public.production_entries;
create trigger prodlog_entry_guard
  before update or delete on public.production_entries
  for each row execute function public.prodlog_entry_guard();

-- Fill the shift from the hour when not supplied (e.g. legacy imports).
create or replace function public.prodlog_entry_defaults()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.shift is null then
    new.shift := public.shift_for_hour(new.hour_slot);
  end if;
  return new;
end;
$$;
drop trigger if exists prodlog_entry_defaults on public.production_entries;
create trigger prodlog_entry_defaults
  before insert on public.production_entries
  for each row execute function public.prodlog_entry_defaults();

-- -----------------------------------------------------------------------------
-- Profile guard: nobody can change their own role/active flag/employee code
-- unless they are an active admin (or a trusted backend session). Also keeps
-- at least one active admin.
-- -----------------------------------------------------------------------------
create or replace function public.prodlog_profile_guard()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if (new.role is distinct from old.role
        or new.is_active is distinct from old.is_active
        or new.employee_code is distinct from old.employee_code
        or new.id is distinct from old.id)
       and not public.is_prodlog_admin()
       and not public.prodlog_is_backend() then
      raise exception 'FORBIDDEN: only an administrator can change roles, status or employee codes';
    end if;

    if new.id = auth.uid() and new.role is distinct from old.role then
      raise exception 'FORBIDDEN: administrators cannot change their own role';
    end if;
    if new.id = auth.uid() and old.is_active and not new.is_active then
      raise exception 'FORBIDDEN: administrators cannot deactivate themselves';
    end if;

    if old.role = 'admin' and old.is_active
       and (new.role <> 'admin' or not new.is_active)
       and not exists (
         select 1 from public.profiles p
         where p.role = 'admin' and p.is_active and p.id <> old.id
       ) then
      raise exception 'FORBIDDEN: at least one active administrator must remain';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists prodlog_profile_guard on public.profiles;
create trigger prodlog_profile_guard
  before update on public.profiles
  for each row execute function public.prodlog_profile_guard();

-- Deactivating an operator ends their machine assignments.
create or replace function public.prodlog_profile_deactivated()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if old.is_active and not new.is_active then
    update public.machine_assignments
       set is_active = false, unassigned_at = now()
     where operator_id = new.id and is_active;
  end if;
  return new;
end;
$$;
drop trigger if exists prodlog_profile_deactivated on public.profiles;
create trigger prodlog_profile_deactivated
  after update of is_active on public.profiles
  for each row execute function public.prodlog_profile_deactivated();

-- Assignments may only target active operators.
create or replace function public.prodlog_assignment_guard()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.is_active and not exists (
    select 1 from public.profiles p
    where p.id = new.operator_id and p.role = 'operator' and p.is_active
  ) then
    raise exception 'INVALID_OPERATOR: machines can only be assigned to active operators';
  end if;
  if tg_op = 'INSERT' then
    new.assigned_at := now();
    new.assigned_by := coalesce(auth.uid(), new.assigned_by);
    new.unassigned_at := null;
  elsif old.is_active and not new.is_active then
    new.unassigned_at := now();
  elsif not old.is_active and new.is_active then
    raise exception 'FORBIDDEN: create a new assignment instead of reactivating an old one';
  end if;
  return new;
end;
$$;
drop trigger if exists prodlog_assignment_guard on public.machine_assignments;
create trigger prodlog_assignment_guard
  before insert or update on public.machine_assignments
  for each row execute function public.prodlog_assignment_guard();

-- -----------------------------------------------------------------------------
-- RPC: submit an hourly production entry
-- -----------------------------------------------------------------------------
create or replace function public.submit_production_entry(
  p_machine_id        uuid,
  p_component_id      uuid,
  p_production_date   date,
  p_hour_slot         integer,
  p_quantity          integer,
  p_client_request_id uuid,
  p_operator_id       uuid default null,
  p_notes             text default null
)
returns public.production_entries
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_role     text := public.prodlog_role();
  v_operator uuid;
  v_settings public.prodlog_settings;
  v_now      timestamp;
  v_today    date;
  v_entry    public.production_entries;
begin
  if v_uid is null or v_role is null then
    raise exception 'FORBIDDEN: an active Production Log account is required';
  end if;
  if p_client_request_id is null then
    raise exception 'INVALID_INPUT: client request id is required';
  end if;

  -- Idempotency: a retried request returns the record it already created.
  select * into v_entry from public.production_entries where client_request_id = p_client_request_id;
  if found then
    if v_entry.entered_by is distinct from v_uid then
      raise exception 'FORBIDDEN: request id already used';
    end if;
    return v_entry;
  end if;

  if v_role = 'operator' then
    if p_operator_id is not null and p_operator_id <> v_uid then
      raise exception 'FORBIDDEN: operators can only submit their own production';
    end if;
    v_operator := v_uid;
  else
    v_operator := coalesce(p_operator_id, v_uid);
    if not exists (select 1 from public.profiles where id = v_operator and role = 'operator' and is_active) then
      raise exception 'INVALID_OPERATOR: entries must be recorded against an active operator';
    end if;
  end if;

  select * into v_settings from public.prodlog_settings where id;

  if p_quantity is null or p_quantity < 1 or p_quantity > v_settings.max_quantity_per_entry then
    raise exception 'INVALID_QUANTITY: quantity must be a whole number between 1 and %', v_settings.max_quantity_per_entry;
  end if;
  if p_hour_slot is null or p_hour_slot < 0 or p_hour_slot > 23 then
    raise exception 'INVALID_INPUT: hour must be between 0 and 23';
  end if;
  if p_production_date is null then
    raise exception 'INVALID_INPUT: production date is required';
  end if;
  if p_notes is not null and length(p_notes) > 500 then
    raise exception 'INVALID_INPUT: notes must be 500 characters or fewer';
  end if;

  v_now   := now() at time zone v_settings.timezone;
  v_today := v_now::date;

  -- Legacy rule: production time cannot be in the future.
  if p_production_date + make_time(p_hour_slot, 0, 0) > v_now then
    raise exception 'FUTURE_SLOT: production time cannot be in the future';
  end if;
  if v_role = 'operator' and p_production_date < v_today - v_settings.operator_backdate_days then
    raise exception 'TOO_OLD: operators can only record production for the last % day(s); ask a supervisor', v_settings.operator_backdate_days;
  end if;

  if not exists (select 1 from public.machines where id = p_machine_id and is_active) then
    raise exception 'INACTIVE_MACHINE: machine is not active';
  end if;
  if not exists (select 1 from public.components where id = p_component_id and is_active) then
    raise exception 'INACTIVE_COMPONENT: component is not active';
  end if;
  if not exists (
    select 1 from public.machine_assignments
    where operator_id = v_operator and machine_id = p_machine_id and is_active
  ) then
    raise exception 'NOT_ASSIGNED: the operator is not assigned to this machine';
  end if;

  begin
    insert into public.production_entries
      (operator_id, entered_by, machine_id, component_id, production_date, hour_slot,
       shift, quantity, client_request_id, notes)
    values
      (v_operator, v_uid, p_machine_id, p_component_id, p_production_date, p_hour_slot,
       public.shift_for_hour(p_hour_slot), p_quantity, p_client_request_id, nullif(btrim(p_notes), ''))
    returning * into v_entry;
  exception when unique_violation then
    -- A concurrent retry of the same request may have won the race.
    select * into v_entry from public.production_entries where client_request_id = p_client_request_id;
    if found then return v_entry; end if;
    raise exception 'DUPLICATE_SLOT: this machine already has a record for this component in this hour. Request a correction instead.';
  end;

  return v_entry;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: request a correction (operators: own entries; staff: any entry)
-- -----------------------------------------------------------------------------
create or replace function public.request_correction(
  p_entry_id              uuid,
  p_request_type          text,
  p_reason                text,
  p_proposed_quantity     integer default null,
  p_proposed_component_id uuid default null
)
returns public.correction_requests
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_role  text := public.prodlog_role();
  v_entry public.production_entries;
  v_req   public.correction_requests;
  v_max   integer;
begin
  if v_uid is null or v_role is null then
    raise exception 'FORBIDDEN: an active Production Log account is required';
  end if;

  select * into v_entry from public.production_entries where id = p_entry_id;
  if not found then
    raise exception 'NOT_FOUND: production record not found';
  end if;
  if v_role = 'operator' and v_entry.operator_id is distinct from v_uid then
    raise exception 'FORBIDDEN: operators can only request corrections to their own records';
  end if;
  if v_entry.status <> 'active' then
    raise exception 'FORBIDDEN: this record has been voided';
  end if;
  if p_request_type not in ('change', 'void') then
    raise exception 'INVALID_INPUT: request type must be change or void';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'INVALID_INPUT: please give a reason (at least 3 characters)';
  end if;

  select max_quantity_per_entry into v_max from public.prodlog_settings where id;
  if p_request_type = 'change' then
    if p_proposed_quantity is null and p_proposed_component_id is null then
      raise exception 'INVALID_INPUT: propose a new quantity or component';
    end if;
    if p_proposed_quantity is not null and (p_proposed_quantity < 1 or p_proposed_quantity > v_max) then
      raise exception 'INVALID_QUANTITY: quantity must be a whole number between 1 and %', v_max;
    end if;
    if p_proposed_component_id is not null
       and not exists (select 1 from public.components where id = p_proposed_component_id and is_active) then
      raise exception 'INACTIVE_COMPONENT: component is not active';
    end if;
    if coalesce(p_proposed_quantity, v_entry.quantity) = v_entry.quantity
       and coalesce(p_proposed_component_id, v_entry.component_id) = v_entry.component_id then
      raise exception 'INVALID_INPUT: the proposed values are the same as the current record';
    end if;
  end if;

  begin
    insert into public.correction_requests
      (production_entry_id, requested_by, request_type, proposed_quantity, proposed_component_id, reason)
    values
      (p_entry_id, v_uid, p_request_type,
       case when p_request_type = 'change' then p_proposed_quantity end,
       case when p_request_type = 'change' then p_proposed_component_id end,
       btrim(p_reason))
    returning * into v_req;
  exception when unique_violation then
    raise exception 'PENDING_EXISTS: a correction for this record is already waiting for review';
  end;
  return v_req;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: cancel own pending correction
-- -----------------------------------------------------------------------------
create or replace function public.cancel_correction(p_request_id uuid)
returns public.correction_requests
language plpgsql security definer
set search_path = public
as $$
declare v_req public.correction_requests;
begin
  update public.correction_requests
     set status = 'cancelled', reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_request_id and requested_by = auth.uid() and status = 'pending'
     and public.prodlog_role() is not null
  returning * into v_req;
  if not found then
    raise exception 'NOT_FOUND: no pending request of yours with that id';
  end if;
  return v_req;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: review a correction (supervisors and admins)
-- -----------------------------------------------------------------------------
create or replace function public.review_correction(
  p_request_id uuid,
  p_approve    boolean,
  p_note       text default null
)
returns public.correction_requests
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_req   public.correction_requests;
  v_entry public.production_entries;
begin
  if not public.is_prodlog_staff() then
    raise exception 'FORBIDDEN: only supervisors and administrators can review corrections';
  end if;

  select * into v_req from public.correction_requests where id = p_request_id for update;
  if not found or v_req.status <> 'pending' then
    raise exception 'NOT_FOUND: this request is no longer pending';
  end if;
  if not p_approve and (p_note is null or length(btrim(p_note)) < 3) then
    raise exception 'INVALID_INPUT: please give a reason for rejecting';
  end if;

  if p_approve then
    select * into v_entry from public.production_entries where id = v_req.production_entry_id for update;
    if v_entry.status <> 'active' then
      raise exception 'FORBIDDEN: this record has already been voided';
    end if;
    begin
      if v_req.request_type = 'void' then
        update public.production_entries set status = 'voided' where id = v_entry.id;
      else
        update public.production_entries
           set quantity = coalesce(v_req.proposed_quantity, quantity),
               component_id = coalesce(v_req.proposed_component_id, component_id)
         where id = v_entry.id;
      end if;
    exception when unique_violation then
      raise exception 'DUPLICATE_SLOT: another record already exists for that component in this hour';
    end;
  end if;

  update public.correction_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = v_uid,
         reviewed_at = now(),
         review_note = nullif(btrim(p_note), '')
   where id = p_request_id
  returning * into v_req;
  return v_req;
end;
$$;

-- -----------------------------------------------------------------------------
-- Enriched read view (respects RLS of the underlying tables).
-- -----------------------------------------------------------------------------
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
  c.zoho_item_id
from public.production_entries e
join public.machines m on m.id = e.machine_id
join public.components c on c.id = e.component_id
left join public.profiles op on op.id = e.operator_id
left join public.profiles eb on eb.id = e.entered_by;
