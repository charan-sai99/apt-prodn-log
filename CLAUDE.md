# APT Production Log — handover for Claude Code

Hourly machine-production logging for **Axis Plastics Transition** (injection moulding, India).
Operators log output from their phones; supervisors/admins monitor, correct, report and export.
Replaces a Streamlit app kept read-only in `legacy/streamlit/`.

- Live: https://apt-prodn-log.netlify.app (Netlify, builds from `main`)
- Repo: https://github.com/charan-sai99/apt-prodn-log
- Local working copy (Windows): `E:\APT_2026\apt\apt-prodn-log`; Node 22 in `E:\APT_2026\tools\node`
- Supabase project ref: `kbvmyroacpueiwvlnynm` (API URL `https://kbvmyroacpueiwvlnynm.supabase.co`)
- Netlify site: `apt-prodn-log` (id `155d74ba-299a-4ebe-977b-494c2836058b`, team `charan-sai-ljeluje`, Free plan)

## Rules for working on this repo

1. **Branches:** work on `dev`. Never push to `main` directly. `main` = production; it changes only when
   the owner says a batch is ready (merge `dev` → `main`). Netlify production deploys cost credits;
   `dev` branch deploys / Deploy Previews don't. Aim for few production deploys.
2. **Before every push:** `npm run typecheck && npm run lint && npm test && npm run build` must pass.
   CI (`.github/workflows/ci.yml`) runs the same plus DB tests.
3. **Database changes:** add a new numbered file in `supabase/migrations/` (never edit applied ones).
   The owner runs SQL by hand in the Supabase SQL editor — **never run SQL against the live project yourself;
   show the SQL and wait for approval.** Write migrations additive and re-runnable (`if not exists`,
   `create or replace`, `drop policy if exists`) so the live app keeps working before/after.
   New tables need explicit `grant`s to `authenticated` (this project has NO default grants — see Gotchas).
4. **The local app and the `dev` preview use the LIVE database.** Test with a test operator; void test entries.
5. **Never** print, log or commit secrets. `.env.local` is gitignored. `SUPABASE_SECRET_KEY` is server-only.
6. Owner is not a professional developer: explain changes plainly, give exact click-paths for
   Supabase/Netlify steps, and say what was tested vs. not.

## Commands (Windows: run inside `E:\APT_2026\apt\prodlog-shell.cmd`, or `start-prodlog.cmd` for the dev server)

```
npm run dev            # http://localhost:3000
npm run typecheck
npm run lint
npm test               # unit tests (vitest, tests/unit)
npm run test:db        # needs PG_TEST_URL=postgres://postgres@localhost:5432/postgres (LOCAL Postgres 16 only)
npm run build
npm run import:data -- production-list --file APT_ProdnList.xlsx   # regenerate component SQL from Excel
```

## Stack

Next.js 16 (App Router, `src/proxy.ts` is the Next 16 "middleware") · React 19 · TypeScript strict ·
Tailwind 4 (tokens in `src/app/globals.css`) · shadcn-style UI on Radix (`src/components/ui`) ·
Supabase (`@supabase/ssr`, Postgres + Auth + RLS + Realtime) · Zod 4 · React Hook Form · Recharts ·
ExcelJS · date-fns + `@date-fns/tz`. Hosted on Netlify (`netlify.toml`, Next.js runtime, functions in us-east-2).

## Layout

```
src/app/(auth)/            login, forgot/reset password (server actions in actions.ts)
src/app/(app)/entry        operator mobile entry form (most important screen)
src/app/(app)/history, my-corrections            operator
src/app/(app)/dashboard, records, reports, corrections, audit     supervisor + admin
src/app/(app)/admin/assignments                  supervisor + admin
src/app/(app)/admin/{users,machines,components,settings}   admin only
src/app/(app)/admin/components/list-*            Excel upload of the production component list
src/app/api/export          CSV/XLSX export   ·  src/app/api/components/list  current list as XLSX
src/lib/auth.ts             getSession (getClaims + profiles), requireRole, pageContext (parallel session+settings)
src/lib/data.ts             DB reads (getComponents has a fallback for pre-0005 schema)
src/lib/validation.ts       all Zod schemas  ·  time.ts (Asia/Kolkata, shifts)  ·  aggregate.ts  ·  export.ts
src/lib/production-list.ts  Excel list parse/diff/build — shared by the app and scripts/migrate
supabase/migrations/        0001–0006 (see below)  ·  supabase/seed/  ·  supabase/tests/ (local stub)
tests/unit, tests/db        vitest  ·  scripts/migrate/  legacy-data + list importer (dry-run default)
legacy/streamlit/           original app — do not modify
```

## Domain & security model

- Roles in `public.profiles.role`: `operator | supervisor | admin` (+ `customer`, which belongs to the
  separate APT Stock Portal app that shares this Supabase project and `profiles` table — customers get no
  Production Log access). Role is always read from the DB, never from the browser.
- Operators sign in with an employee code → mapped to `<code>@operators.apt.internal` (`OPERATOR_LOGIN_DOMAIN`).
  Supervisors/admins use email.
- Machines: VIM1–VIM4, HIM. Operators may only log on machines assigned to them (`machine_assignments`).
  Supervisors and admins can assign (migration 0004).
- Components: the 24 moulded child parts with `raw_material` are active; ~246 old Zoho items are inactive (kept
  for history). Components are **independent of Zoho** (name is the key; `zoho_item_id` optional).
  Admin maintains the list by uploading Excel (Production Part Name + RAW MATERIAL) → preview → apply
  (`apply_production_list` RPC, migration 0006).
- All production writes go through SECURITY DEFINER RPCs that use `auth.uid()`:
  `submit_production_entry` (idempotent via `client_request_id`; one active row per machine/date/hour/component;
  no future hours; operators may back-date `operator_backdate_days`), `request_correction`, `review_correction`,
  `cancel_correction`. Direct INSERT/UPDATE/DELETE on production tables is revoked for everyone.
- No hard deletes anywhere; corrections need supervisor approval; append-only `production_audit_logs`
  (immutable via trigger). Factory timezone `Asia/Kolkata`; shifts A 06–14, B 14–22, C 22–06 (admin-editable).
- RPC errors start with a code word (`DUPLICATE_SLOT:` …) mapped in `src/lib/errors.ts`.

## Migration status (live Supabase) — verify with the owner before relying on it

| File | Status |
|---|---|
| 0001–0003 core schema, functions/audit, RLS | applied |
| extra `grant select, insert, update on public.profiles to authenticated;` | applied (now in 0003) |
| 0004 supervisor assignments | SQL given to owner 21 Nov — confirm |
| 0005 raw_material + `seed/production_components.sql` | SQL given 23 Nov — confirm (app falls back if missing) |
| 0006 `apply_production_list` (Excel upload) | SQL given 23 Nov — confirm |

Quick check in SQL editor: `select column_name from information_schema.columns where table_name='components' and column_name='raw_material';`
and `select proname from pg_proc where proname in ('apply_production_list');`

## Gotchas learned the hard way

- **No default grants** on this Supabase project: tables need explicit `grant … to authenticated`, otherwise
  RLS never even runs and users get "permission denied" (that caused the first "no access" login bug).
  The DB test stub mimics this; keep it that way.
- Next 16: middleware file is `src/proxy.ts` exporting `proxy`; `cookies()`/`searchParams` are async.
- Server-action uploads: `experimental.serverActions.bodySizeLimit = "3mb"` in `next.config.ts`.
- After a deploy, an already-open page can log "Failed to find Server Action" — harmless, reload.
- Netlify Free: functions run in us-east-2 (Ohio) and can't be moved; each DB round trip crosses the world.
  Keep page loads to 1–2 parallel rounds of queries (see `pageContext`, entry page).
- Preview/branch URLs (`*--apt-prodn-log.netlify.app`) are behind Netlify team login (SSO) — intended.
- "Powered by Netlify" badge is a Netlify project setting (Project configuration → General), not code.
- The dev box for DB tests needs PostgreSQL 16 locally; tests refuse non-local hosts.

## Open items / ideas (not started)

- Confirm Netlify branch deploys are enabled for `dev` (Project configuration → Build & deploy → Branches).
- Delete stale GitHub branch `nextjs-migration`.
- Consider a separate Supabase project for dev/testing so local & preview don't touch live data.
- Legacy Streamlit `storage/` CSVs/logs were never found; importer ready: `npm run import:data -- production --storage <dir>`.
- Same `dev`-branch workflow still to be set up for the APT Stock Portal (separate repo/Netlify site).

Details: `README.md`, `docs/DATABASE.md`, `docs/DEPLOYMENT.md`.
