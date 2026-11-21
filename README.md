# APT Production Log

Mobile-first hourly production logging for **Axis Plastics Transition** — machine operators submit hourly output from their phones; supervisors and administrators monitor production, review corrections and export reports.

Replaces the earlier Streamlit app (kept unchanged in [`legacy/streamlit/`](legacy/streamlit)).

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · shadcn-style UI on Radix · Supabase (Postgres, Auth, RLS, Realtime) · Recharts · React Hook Form + Zod · ExcelJS · date-fns · hosted on Netlify.

---

## What it does

| Role | Can |
|---|---|
| **Operator** | Sign in with employee code · see assigned machine(s) · log hourly production (date, shift, hour, component, quantity) · see today's and past submissions · request corrections (never edit directly) |
| **Supervisor** | Dashboard for all 5 machines (live) · filter records by date/machine/operator/component/shift/search · daily/weekly/monthly + machine/operator/component reports · CSV & Excel export · approve/reject corrections · audit log · record on behalf of an operator |
| **Administrator** | Everything above + create/deactivate accounts, set roles, reset operator passwords · assign operators to machines · manage machines, components, shifts and factory settings |

Business rules carried over from the legacy app: production time can't be in the future; quantity is a whole number ≥ 1; every entry records operator **and** who entered it; machines `vim1…vim4, him` → `VIM1…VIM4, HIM`; components come from the master list.

New rules: one active record per machine + date + hour + component (duplicate taps are idempotent); operators can back-date 1 day (admin setting); corrections need supervisor approval; nothing is hard-deleted; every change is in an append-only audit log; factory time zone is **Asia/Kolkata**.

## Security model

- Roles live in `public.profiles` and are read on the server and in the database — **never** taken from the browser.
- **Row Level Security** on every table. Operators see only their own records and assigned machines. Supervisors read everything. Only admins change master data.
- **All production writes go through `SECURITY DEFINER` RPCs** (`submit_production_entry`, `request_correction`, `review_correction`, `cancel_correction`). They take the user from `auth.uid()` and validate assignment, quantity, time and duplicates. Direct `INSERT/UPDATE/DELETE` on production tables is revoked for every app user, admins included.
- Triggers block self-promotion, removing the last admin, re-keying records, hard deletes, and edits to audit rows.
- The browser only ever has the **publishable** key. The **secret** key is server-only and is used just for Supabase Auth admin calls (create / ban user, set password) after the caller is re-verified as an admin.
- Sessions live in HTTP cookies (`@supabase/ssr`). Nothing sensitive goes into localStorage. The service worker caches only static assets.

## Project layout

```
src/app/(auth)/        login, forgot/reset password
src/app/(app)/entry    operator mobile form        /history  /my-corrections
src/app/(app)/dashboard /records /reports /corrections /audit   (supervisor + admin)
src/app/(app)/admin/   users, assignments, machines, components, settings
src/app/api/export     CSV / Excel export (staff only)
src/lib/               auth, data access, validation, time zone, aggregation, export
src/proxy.ts           session refresh + sign-in redirect (Next 16 "proxy")
supabase/migrations/   version-controlled SQL (review before applying!)
supabase/seed/         component master seed (246 items from the Excel master)
supabase/tests/        local-only Supabase stub for DB tests
scripts/migrate/       legacy data migration utility (dry-run by default)
tests/unit, tests/db   Vitest suites
legacy/streamlit/      the original Streamlit app and master Excel, untouched
```

## Local development

Requires Node.js ≥ 20.9.

```bash
npm install
cp .env.example .env.local      # fill in values — see below
npm run dev                     # http://localhost:3000
```

### Environment variables

| Name | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | **API URL** `https://<ref>.supabase.co` (Project Settings → API). *Not* the `supabase.com/dashboard/...` address. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | `sb_publishable_…` key. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as a fallback. |
| `SUPABASE_SECRET_KEY` | **server only** | `sb_secret_…` (or legacy service_role). Needed for account management and the migration utility. Never prefix with `NEXT_PUBLIC_`. |
| `OPERATOR_LOGIN_DOMAIN` | server | Operators sign in with their employee code. It maps to `<code>@<this domain>` in Supabase Auth. Default `operators.apt.internal`. Set it once, before creating operators. |
| `NEXT_PUBLIC_SITE_URL` | server | Public URL, used in password-reset emails. |

## Database setup

See **[docs/DATABASE.md](docs/DATABASE.md)** for the schema, the comparison with the existing Stock Portal schema in the same Supabase project, and the exact apply order.

Short version, after reviewing the SQL:
1. Supabase SQL editor → run the three files in `supabase/migrations/` in order.
2. Run `supabase/seed/components_seed.sql` (or `npm run import:data -- components --apply …`).
3. Create the first admin (see docs/DATABASE.md §5). Then do everything else in the app.

## Data migration (legacy CSV / logs)

```bash
# dry run — reads, validates, writes a report; sends nothing
npm run import:data -- components --master legacy/streamlit/data/APT_Production_Master.xlsx --items Item.xlsx
npm run import:data -- production --storage /path/to/legacy/storage

# write (only after reviewing the report)
npm run import:data -- production --storage /path/to/legacy/storage --apply --project-ref <ref>
```

- Originals are only read. Each run copies them to `migration-backups/<timestamp>/` with SHA-256 checksums.
- Imports are idempotent: components are keyed by Zoho Item ID, and legacy rows by a hash of the original row.
- Unmappable rows block `--apply` and are listed in `migration-reports/<timestamp>/` (`summary.md`, `discrepancies.csv`). This covers unknown components, conflicting quantities, missing log lines and names that look like test data. Nothing is guessed. `--allow-partial` imports only the clean rows.
- Operator names are recovered from the legacy `.log` files and stored as `legacy_operator_name`. Legacy operators had no accounts.

## Testing

```bash
npm run typecheck
npm run lint
npm test                 # unit tests (validation, time zone, aggregation, exports, migration)
PG_TEST_URL=postgres://postgres@localhost:5432/postgres npm run test:db
                         # DB tests: RLS, roles, RPCs, duplicates, corrections, audit, concurrency
npm run build
```

The DB suite builds a throwaway database on a **local** PostgreSQL from `supabase/tests/supabase_stub.sql` plus the real migrations. It refuses non-local hosts. It runs twice: once on a fresh project, and once on a project that already has the Stock Portal schema. CI (`.github/workflows/ci.yml`) runs everything on each push.

## Deploying to Netlify

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Installing on phones (PWA)

Open the site in Chrome (Android) → menu → **Install app**, or Safari (iPhone) → Share → **Add to Home Screen**. The app needs a network connection to save entries. It deliberately does not queue production records offline on the device.
