# Database design and migration plan

> **Status: NOT applied to your Supabase project.** I could not reach Supabase from the build environment, so the live schema was not inspected. The plan below is based on the Stock Portal migrations found in `E:\APT_2026\apt\apt-stock-portal-starter\…\supabase\migrations`. Please review the SQL and approve it before running it against production.

## 1. What already exists (Stock Portal starter, same Supabase project)

If those migrations were applied, the project contains:

| Table | Used by Production Log? |
|---|---|
| `profiles` (id, display_name, role ∈ admin/operator/customer, is_active, created_at) | **Shared** — extended, not recreated |
| `zoho_items`, `daily_reports`, `daily_stock_entries`, `audit_logs` | Not touched |
| function `current_app_role()` and Stock Portal policies | Not touched |

## 2. Changes, by file

### `20261121000001_prodlog_core_schema.sql`
- `profiles`: `create table if not exists` (no-op if present). **Adds** `employee_code` (unique, case-insensitive) and `updated_at`. **Replaces the role CHECK constraint** to allow `admin, supervisor, operator, customer`. Existing rows remain valid. This is the only change to an existing object.
- New tables: `prodlog_settings` (time zone `Asia/Kolkata`, operator back-dating 1 day, max quantity 100 000), `shifts` (A 06–14, B 14–22, C 22–06 — **an assumption**; the legacy app had no shifts), `machines` (seeded VIM1–VIM4, HIM with legacy codes), `components` (keyed by Zoho Item ID), `machine_assignments`, `production_entries`, `correction_requests`, `production_audit_logs`.
- Constraints: quantity 1…1 000 000, hour 0–23, one **active** row per machine/date/hour/component (partial unique index), `client_request_id` unique (idempotent retries), `import_key` unique (idempotent legacy import), one pending correction per record.

### `20261121000002_prodlog_functions_and_audit.sql`
- Role helpers `prodlog_role()`, `is_prodlog_staff()`, `is_prodlog_admin()`. These are independent of the Stock Portal's `current_app_role()`.
- Triggers: server timestamps, generic **append-only audit** (old/new JSON, actor) on all Production Log tables and on profile role/status/name/code changes, audit immutability, production-record guard (no hard delete, no re-keying), profile guard (no self-promotion, keep ≥ 1 admin), deactivation ends assignments, assignments only to active operators, shift default from hour.
- RPCs: `submit_production_entry`, `request_correction`, `cancel_correction`, `review_correction`.
- View `production_entries_enriched` (`security_invoker`, so RLS still applies).

### `20261121000003_prodlog_rls_and_grants.sql`
- Enables RLS and adds `prodlog:`-prefixed policies. On `profiles` it **adds** three policies (read own / staff read all; admin insert; admin update). Existing Stock Portal policies are unchanged.
- Revokes anonymous access. Revokes direct writes on production tables. Function execute goes to `authenticated` only.
- Adds `production_entries` and `correction_requests` to the `supabase_realtime` publication.

All three files are re-runnable, and none of them drops data. They were applied twice in a row, both on an empty database and on one that already had the Stock Portal schema, followed by the 77 DB tests.

## 3. Points to be aware of

1. **Shared roles.** A person's role in `profiles` applies to both apps. A Stock Portal *operator* is also a Production Log operator. They can't log anything until an admin assigns them a machine. *Customers* get no Production Log access at all.
2. **Deleting auth users** that have production history is blocked by foreign keys. Deactivate them instead (the Users page does this and also blocks sign-in).
3. **Shifts** are derived from the hour and stored on each record. Changing shift times affects new records only.

## 4. How to apply (after approval)

1. Back up: Supabase Dashboard → Database → Backups. Or `pg_dump`.
2. SQL editor → paste and run each migration file **in order**. Or with the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.
3. Run `supabase/seed/components_seed.sql`. It adds 246 components: 235 active goods and 11 Zoho service items set inactive.
4. Check: `select machine_code from machines;` returns 5 rows; `select count(*) from components;` returns 246.

## 5. First administrator

The app needs one admin before anyone can create accounts in it:

1. Dashboard → Authentication → Users → **Add user** (your email + a strong password, "auto confirm").
2. SQL editor:
   ```sql
   insert into public.profiles (id, display_name, employee_code, role)
   select id, 'Your Name', 'ADM01', 'admin' from auth.users where email = 'you@example.com'
   on conflict (id) do update set role = 'admin', is_active = true, employee_code = excluded.employee_code;
   ```
3. Sign in to the app → Users → create supervisors and operators → Assignments.

## 6. Data mapping from the legacy app

| Legacy | New |
|---|---|
| `storage/<machine>.csv` → `log_datetime` | `production_date` + `hour_slot` (minutes kept in `notes` if not :00) |
| `component_name` (selection key in old app) | `components` matched by exact name, else by a **unique** part code |
| `component_id` | `components.component_code` (not unique, 120/246 blank — not used as a key) |
| `ZohoID` | `components.zoho_item_id` (unique, complete — the key) |
| `APTID` (Excel formula) | not imported (derivable) |
| `quantity` | `quantity` |
| `logs/<machine>.log` EnteredBy / Operator | `legacy_entered_by_name` / `legacy_operator_name` |
| file name `vim1` … `him` | `machines.legacy_code` → `VIM1` … `HIM` |
| whole original row | `legacy_raw` (jsonb), plus the source file and line |
