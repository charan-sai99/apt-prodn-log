-- =============================================================================
-- APT Production Log — 0004 supervisors may assign operators to machines
-- =============================================================================
-- Replaces the admin-only write policies on machine_assignments with ones that
-- allow supervisors too. Everything else stays admin-only. Every change is
-- still recorded in production_audit_logs with the acting user, and the
-- assignment trigger still only allows active operators.
-- Safe to re-run; changes no data.
-- =============================================================================

drop policy if exists "prodlog: admins insert assignments" on public.machine_assignments;
drop policy if exists "prodlog: staff insert assignments" on public.machine_assignments;
create policy "prodlog: staff insert assignments" on public.machine_assignments
  for insert to authenticated with check (public.is_prodlog_staff());

drop policy if exists "prodlog: admins update assignments" on public.machine_assignments;
drop policy if exists "prodlog: staff update assignments" on public.machine_assignments;
create policy "prodlog: staff update assignments" on public.machine_assignments
  for update to authenticated
  using (public.is_prodlog_staff()) with check (public.is_prodlog_staff());
