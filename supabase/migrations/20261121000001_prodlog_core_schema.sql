-- =============================================================================
-- APT Production Log — 0001 core schema
-- =============================================================================
-- Safe to run on:
--   * an empty Supabase project, or
--   * the project already used by the APT Stock Portal starter, whose
--     `public.profiles` table (display_name, role, is_active, created_at) is
--     EXTENDED here rather than recreated.
-- Nothing in this file drops a table, a column or a row.
-- The only object it replaces is the CHECK constraint on profiles.role, which
-- is widened to add 'supervisor' (existing values admin/operator/customer stay
-- valid).
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- profiles (shared with the APT Stock Portal)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role         text not null default 'operator',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

alter table public.profiles add column if not exists employee_code text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create unique index if not exists profiles_employee_code_key
  on public.profiles (lower(employee_code))
  where employee_code is not null;

-- Widen the role check to include 'supervisor'.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'supervisor', 'operator', 'customer'));

alter table public.profiles
  drop constraint if exists profiles_employee_code_format;
alter table public.profiles
  add constraint profiles_employee_code_format
  check (employee_code is null or employee_code ~ '^[A-Za-z0-9_.-]{2,32}$');

-- -----------------------------------------------------------------------------
-- Factory settings (single row)
-- -----------------------------------------------------------------------------
create table if not exists public.prodlog_settings (
  id                    boolean primary key default true check (id),
  timezone              text not null default 'Asia/Kolkata',
  operator_backdate_days smallint not null default 1 check (operator_backdate_days between 0 and 31),
  max_quantity_per_entry integer not null default 100000 check (max_quantity_per_entry > 0),
  updated_at            timestamptz not null default now()
);
insert into public.prodlog_settings (id) values (true) on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Shifts — the legacy app had no shift concept. Defaults below are an
-- assumption (3 × 8 h from 06:00) that an admin can change in the app.
-- end_hour is exclusive; end_hour <= start_hour means the shift wraps midnight.
-- -----------------------------------------------------------------------------
create table if not exists public.shifts (
  code       text primary key check (code ~ '^[A-Z0-9]{1,4}$'),
  name       text not null,
  start_hour smallint not null check (start_hour between 0 and 23),
  end_hour   smallint not null check (end_hour between 0 and 23),
  sort_order smallint not null default 0,
  is_active  boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.shifts (code, name, start_hour, end_hour, sort_order) values
  ('A', 'Shift A (06:00–14:00)', 6, 14, 1),
  ('B', 'Shift B (14:00–22:00)', 14, 22, 2),
  ('C', 'Shift C (22:00–06:00)', 22, 6, 3)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Machines
-- -----------------------------------------------------------------------------
create table if not exists public.machines (
  id           uuid primary key default gen_random_uuid(),
  machine_code text not null unique check (machine_code ~ '^[A-Z0-9_-]{2,16}$'),
  machine_name text not null check (length(btrim(machine_name)) > 0),
  machine_type text not null default 'vertical_injection'
               check (machine_type in ('vertical_injection', 'horizontal_injection', 'other')),
  legacy_code  text unique,
  sort_order   smallint not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
insert into public.machines (machine_code, machine_name, machine_type, legacy_code, sort_order) values
  ('VIM1', 'Vertical Injection Moulding 1', 'vertical_injection',   'vim1', 1),
  ('VIM2', 'Vertical Injection Moulding 2', 'vertical_injection',   'vim2', 2),
  ('VIM3', 'Vertical Injection Moulding 3', 'vertical_injection',   'vim3', 3),
  ('VIM4', 'Vertical Injection Moulding 4', 'vertical_injection',   'vim4', 4),
  ('HIM',  'Horizontal Injection Moulding', 'horizontal_injection', 'him',  5)
on conflict (machine_code) do nothing;

-- -----------------------------------------------------------------------------
-- Components — keyed by Zoho Item ID (unique and complete in the master),
-- because the legacy `component_id` column is blank for 118/246 rows and not
-- unique. component_code keeps the legacy part code as-is.
-- -----------------------------------------------------------------------------
create table if not exists public.components (
  id             uuid primary key default gen_random_uuid(),
  zoho_item_id   text unique,
  component_code text,
  component_name text not null check (length(btrim(component_name)) > 0),
  description    text,
  product_type   text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists components_name_key
  on public.components (lower(btrim(component_name)));
create index if not exists components_code_idx on public.components (component_code);

-- -----------------------------------------------------------------------------
-- Machine assignments
-- -----------------------------------------------------------------------------
create table if not exists public.machine_assignments (
  id            uuid primary key default gen_random_uuid(),
  operator_id   uuid not null references public.profiles(id) on delete cascade,
  machine_id    uuid not null references public.machines(id),
  is_active     boolean not null default true,
  assigned_at   timestamptz not null default now(),
  assigned_by   uuid references public.profiles(id),
  unassigned_at timestamptz
);
create unique index if not exists machine_assignments_active_key
  on public.machine_assignments (operator_id, machine_id) where is_active;
create index if not exists machine_assignments_machine_idx
  on public.machine_assignments (machine_id) where is_active;

-- -----------------------------------------------------------------------------
-- Production entries
-- -----------------------------------------------------------------------------
create table if not exists public.production_entries (
  id                     uuid primary key default gen_random_uuid(),
  operator_id            uuid references public.profiles(id),
  entered_by             uuid references public.profiles(id),
  machine_id             uuid not null references public.machines(id),
  component_id           uuid not null references public.components(id),
  production_date        date not null,
  hour_slot              smallint not null check (hour_slot between 0 and 23),
  shift                  text references public.shifts(code) on update cascade,
  quantity               integer not null check (quantity > 0 and quantity <= 1000000),
  status                 text not null default 'active' check (status in ('active', 'voided')),
  source                 text not null default 'app' check (source in ('app', 'legacy_import')),
  legacy_operator_name   text,
  legacy_entered_by_name text,
  legacy_raw             jsonb,
  client_request_id      uuid unique,
  import_key             text unique,
  notes                  text check (notes is null or length(notes) <= 500),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint production_entries_operator_known
    check (operator_id is not null or legacy_operator_name is not null)
);

-- Duplicate protection: one active record per machine / date / hour / component.
create unique index if not exists production_entries_one_per_slot
  on public.production_entries (machine_id, production_date, hour_slot, component_id)
  where status = 'active';
create index if not exists production_entries_date_idx
  on public.production_entries (production_date desc);
create index if not exists production_entries_operator_date_idx
  on public.production_entries (operator_id, production_date desc);
create index if not exists production_entries_machine_date_idx
  on public.production_entries (machine_id, production_date desc);
create index if not exists production_entries_component_idx
  on public.production_entries (component_id);

-- -----------------------------------------------------------------------------
-- Correction requests — records are never silently overwritten.
-- -----------------------------------------------------------------------------
create table if not exists public.correction_requests (
  id                     uuid primary key default gen_random_uuid(),
  production_entry_id    uuid not null references public.production_entries(id),
  requested_by           uuid not null references public.profiles(id),
  request_type           text not null check (request_type in ('change', 'void')),
  proposed_quantity      integer check (proposed_quantity is null or (proposed_quantity > 0 and proposed_quantity <= 1000000)),
  proposed_component_id  uuid references public.components(id),
  reason                 text not null check (length(btrim(reason)) between 3 and 500),
  status                 text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by            uuid references public.profiles(id),
  reviewed_at            timestamptz,
  review_note            text check (review_note is null or length(review_note) <= 500),
  created_at             timestamptz not null default now(),
  constraint correction_change_has_values check (
    request_type = 'void' or proposed_quantity is not null or proposed_component_id is not null
  )
);
create unique index if not exists correction_requests_one_pending
  on public.correction_requests (production_entry_id) where status = 'pending';
create index if not exists correction_requests_status_idx
  on public.correction_requests (status, created_at desc);

-- -----------------------------------------------------------------------------
-- Audit log (append-only)
-- -----------------------------------------------------------------------------
create table if not exists public.production_audit_logs (
  id                  bigint generated always as identity primary key,
  entity_type         text not null,
  entity_id           text,
  production_entry_id uuid references public.production_entries(id),
  changed_by          uuid references auth.users(id) on delete set null,
  action              text not null,
  old_values          jsonb,
  new_values          jsonb,
  created_at          timestamptz not null default now()
);
create index if not exists production_audit_logs_created_idx
  on public.production_audit_logs (created_at desc);
create index if not exists production_audit_logs_entry_idx
  on public.production_audit_logs (production_entry_id);
create index if not exists production_audit_logs_entity_idx
  on public.production_audit_logs (entity_type, entity_id);
