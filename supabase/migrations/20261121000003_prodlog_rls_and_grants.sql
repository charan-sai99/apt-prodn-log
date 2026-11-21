-- =============================================================================
-- APT Production Log — 0003 Row Level Security, grants and realtime
-- =============================================================================
-- Policy names are prefixed "prodlog:" so they never collide with the Stock
-- Portal's policies on the shared profiles table. Existing Stock Portal
-- policies and grants on profiles are left untouched.
-- =============================================================================

alter table public.profiles              enable row level security;
alter table public.prodlog_settings      enable row level security;
alter table public.shifts                enable row level security;
alter table public.machines              enable row level security;
alter table public.components            enable row level security;
alter table public.machine_assignments   enable row level security;
alter table public.production_entries    enable row level security;
alter table public.correction_requests   enable row level security;
alter table public.production_audit_logs enable row level security;

-- ---------------------------------------------------------------- profiles
drop policy if exists "prodlog: read own profile or staff reads all" on public.profiles;
create policy "prodlog: read own profile or staff reads all" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_prodlog_staff());

drop policy if exists "prodlog: admins insert profiles" on public.profiles;
create policy "prodlog: admins insert profiles" on public.profiles
  for insert to authenticated
  with check (public.is_prodlog_admin());

drop policy if exists "prodlog: admins update profiles" on public.profiles;
create policy "prodlog: admins update profiles" on public.profiles
  for update to authenticated
  using (public.is_prodlog_admin())
  with check (public.is_prodlog_admin());

-- ---------------------------------------------------------------- settings
drop policy if exists "prodlog: users read settings" on public.prodlog_settings;
create policy "prodlog: users read settings" on public.prodlog_settings
  for select to authenticated using (public.prodlog_role() is not null);

drop policy if exists "prodlog: admins update settings" on public.prodlog_settings;
create policy "prodlog: admins update settings" on public.prodlog_settings
  for update to authenticated
  using (public.is_prodlog_admin()) with check (public.is_prodlog_admin());

-- ---------------------------------------------------------------- shifts
drop policy if exists "prodlog: users read shifts" on public.shifts;
create policy "prodlog: users read shifts" on public.shifts
  for select to authenticated using (public.prodlog_role() is not null);

drop policy if exists "prodlog: admins insert shifts" on public.shifts;
create policy "prodlog: admins insert shifts" on public.shifts
  for insert to authenticated with check (public.is_prodlog_admin());

drop policy if exists "prodlog: admins update shifts" on public.shifts;
create policy "prodlog: admins update shifts" on public.shifts
  for update to authenticated
  using (public.is_prodlog_admin()) with check (public.is_prodlog_admin());

-- ---------------------------------------------------------------- machines
drop policy if exists "prodlog: read machines" on public.machines;
create policy "prodlog: read machines" on public.machines
  for select to authenticated
  using (
    public.is_prodlog_staff()
    or (public.prodlog_role() = 'operator' and (
          public.is_assigned_to_machine(id)
          or exists (select 1 from public.production_entries e
                     where e.machine_id = machines.id and e.operator_id = auth.uid())
    ))
  );

drop policy if exists "prodlog: admins insert machines" on public.machines;
create policy "prodlog: admins insert machines" on public.machines
  for insert to authenticated with check (public.is_prodlog_admin());

drop policy if exists "prodlog: admins update machines" on public.machines;
create policy "prodlog: admins update machines" on public.machines
  for update to authenticated
  using (public.is_prodlog_admin()) with check (public.is_prodlog_admin());

-- ---------------------------------------------------------------- components
drop policy if exists "prodlog: users read components" on public.components;
create policy "prodlog: users read components" on public.components
  for select to authenticated using (public.prodlog_role() is not null);

drop policy if exists "prodlog: admins insert components" on public.components;
create policy "prodlog: admins insert components" on public.components
  for insert to authenticated with check (public.is_prodlog_admin());

drop policy if exists "prodlog: admins update components" on public.components;
create policy "prodlog: admins update components" on public.components
  for update to authenticated
  using (public.is_prodlog_admin()) with check (public.is_prodlog_admin());

-- ---------------------------------------------------------------- assignments
drop policy if exists "prodlog: read assignments" on public.machine_assignments;
create policy "prodlog: read assignments" on public.machine_assignments
  for select to authenticated
  using ((operator_id = auth.uid() and public.prodlog_role() is not null) or public.is_prodlog_staff());

drop policy if exists "prodlog: admins insert assignments" on public.machine_assignments;
create policy "prodlog: admins insert assignments" on public.machine_assignments
  for insert to authenticated with check (public.is_prodlog_admin());

drop policy if exists "prodlog: admins update assignments" on public.machine_assignments;
create policy "prodlog: admins update assignments" on public.machine_assignments
  for update to authenticated
  using (public.is_prodlog_admin()) with check (public.is_prodlog_admin());

-- ---------------------------------------------------------------- production
-- Read-only through RLS. All writes go through the RPCs in 0002.
drop policy if exists "prodlog: read production entries" on public.production_entries;
create policy "prodlog: read production entries" on public.production_entries
  for select to authenticated
  using ((operator_id = auth.uid() and public.prodlog_role() is not null) or public.is_prodlog_staff());

drop policy if exists "prodlog: read correction requests" on public.correction_requests;
create policy "prodlog: read correction requests" on public.correction_requests
  for select to authenticated
  using ((requested_by = auth.uid() and public.prodlog_role() is not null) or public.is_prodlog_staff());

drop policy if exists "prodlog: staff read audit logs" on public.production_audit_logs;
create policy "prodlog: staff read audit logs" on public.production_audit_logs
  for select to authenticated using (public.is_prodlog_staff());

-- ---------------------------------------------------------------- grants
revoke all on public.prodlog_settings, public.shifts, public.machines, public.components,
              public.machine_assignments, public.production_entries,
              public.correction_requests, public.production_audit_logs
  from anon;
revoke all on public.production_entries_enriched from anon;

revoke insert, update, delete, truncate on public.production_entries,
                                            public.correction_requests,
                                            public.production_audit_logs
  from authenticated;
revoke delete, truncate on public.prodlog_settings, public.shifts, public.machines,
                           public.components, public.machine_assignments
  from authenticated;

grant select on public.prodlog_settings, public.shifts, public.machines, public.components,
                public.machine_assignments, public.production_entries,
                public.correction_requests, public.production_audit_logs,
                public.production_entries_enriched
  to authenticated;
grant insert, update on public.shifts, public.machines, public.components,
                        public.machine_assignments
  to authenticated;
grant update on public.prodlog_settings to authenticated;

-- Newer Supabase projects do not grant table privileges to `authenticated`
-- automatically. Signed-in users need to read their own profile (RLS above
-- limits which rows) and admins need insert/update. Delete is not granted.
grant select, insert, update on public.profiles to authenticated;
revoke all on public.profiles from anon;

-- Functions: never callable anonymously.
do $$
declare f text;
begin
  foreach f in array array[
    'public.prodlog_role()',
    'public.is_prodlog_staff()',
    'public.is_prodlog_admin()',
    'public.is_assigned_to_machine(uuid)',
    'public.factory_timezone()',
    'public.factory_today()',
    'public.shift_for_hour(integer)',
    'public.submit_production_entry(uuid,uuid,date,integer,integer,uuid,uuid,text)',
    'public.request_correction(uuid,text,text,integer,uuid)',
    'public.cancel_correction(uuid)',
    'public.review_correction(uuid,boolean,text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------- realtime
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public'
                     and tablename = 'production_entries') then
      execute 'alter publication supabase_realtime add table public.production_entries';
    end if;
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public'
                     and tablename = 'correction_requests') then
      execute 'alter publication supabase_realtime add table public.correction_requests';
    end if;
  end if;
end $$;
