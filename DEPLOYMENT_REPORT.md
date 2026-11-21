# APT Production Log — migration & deployment report (21 Nov 2026)

## Status at a glance
| Item | Status |
|---|---|
| Next.js app (operator / supervisor / admin, PWA) | ✅ Built. Typecheck, lint and production build pass |
| SQL migrations (3) + component seed | ✅ Written and tested on local PostgreSQL 16. ⏸ **Not applied to Supabase — waiting for your approval** |
| Unit tests | ✅ 55 / 55 |
| Database tests (RLS, roles, RPCs, duplicates, corrections, audit, concurrency) | ✅ 77 / 77, on a fresh schema *and* with the Stock Portal schema present |
| Data migration utility | ✅ Components dry run: 246 ready (235 active, 11 inactive), 0 rejected. Legacy production import tested on files written by the old app's own code |
| Mobile layout | ✅ Screenshots checked at 390 px (phone), 820 px, 1440 px |
| GitHub | ⏸ Branch `nextjs-migration` committed locally, delivered as `apt-prodn-log-nextjs-migration.bundle`. Not pushed: this session had no write access to the repo |
| Vercel | ⏸ Not deployed. Needs the database applied and your Vercel account. Steps in docs/DEPLOYMENT.md |
| Live URL | — none yet |

## Not verified (honest limits)
- **No connection to the live Supabase project** was possible from the build environment. The live schema was not inspected, and nothing ran against Supabase Auth / PostgREST. The database logic was proven against real PostgreSQL with a Supabase-auth stand-in. The first end-to-end sign-in will happen on your project.
- `.env.local` in the Stock Portal folder has the **dashboard** URL in `NEXT_PUBLIC_SUPABASE_URL`. It must be the API URL `https://<ref>.supabase.co`. The app's /setup page flags this.
- **No legacy production CSV/log files were found** (the old `storage/` folder is gitignored). The import tool is ready for them.

## To go live
1. Review `supabase/migrations/*.sql` (explained in docs/DATABASE.md) and approve.
2. Back up the database, then run the 3 migrations and `supabase/seed/components_seed.sql` in the SQL editor.
3. Create the first admin (docs/DATABASE.md §5).
4. Push the branch: in your local clone of apt-prodn-log
   `git fetch <path>/apt-prodn-log-nextjs-migration.bundle nextjs-migration:nextjs-migration && git push -u origin nextjs-migration`
   then open a PR into main.
5. Import into Vercel and set the env vars (docs/DEPLOYMENT.md). Then run the smoke test listed there.
6. If you have the old `storage/` folder: `npm run import:data -- production --storage <folder>` (dry run), review the report, then `--apply --project-ref <ref>`.

## Decisions taken (change any of them easily)
- Components keyed by **Zoho Item ID** (unique and complete). The legacy `component_id` is blank in 120/246 rows and duplicated in others, so it is kept only as a part code.
- **Shifts A 06–14 / B 14–22 / C 22–06** — an assumption, since the old app had no shifts. Editable under Admin → Shifts & settings.
- Operators may back-date **1 day**. Supervisors can record older dates on an operator's behalf.
- One active record per machine + hour + component. Changes go through supervisor-approved corrections. Nothing is hard-deleted.
- Operators sign in with their **employee code**. Supervisors and admins use email (needed for password reset).
- `profiles` is **shared** with the Stock Portal (role list widened to add `supervisor`). Stock Portal customers get no Production Log access.
