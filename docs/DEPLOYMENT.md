# Deploying to Vercel

## Prerequisites
- The database migrations are applied and reviewed (see DATABASE.md), and a first admin exists.
- The GitHub repository contains this project at its root.

## Steps
1. **vercel.com → Add New → Project → Import** the GitHub repository. The framework is detected as Next.js. Keep the defaults: build `next build`, Node 22.
2. **Environment Variables** (Production *and* Preview):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://<ref>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_…`
   - `SUPABASE_SECRET_KEY` = `sb_secret_…` (mark **Sensitive**)
   - `OPERATOR_LOGIN_DOMAIN` = `operators.apt.internal` (or your choice; keep it stable)
   - `NEXT_PUBLIC_SITE_URL` = your production URL, e.g. `https://apt-production-log.vercel.app`
3. **Deploy.** After that, every push to the production branch redeploys, and pull requests get preview URLs.
4. **Supabase → Authentication → URL Configuration:** set **Site URL** to the production URL. Add `https://<your-domain>/auth/confirm` (and the preview pattern `https://*-<team>.vercel.app/auth/confirm` if you want) to **Redirect URLs**, so password-reset links work.
5. Optional, in Supabase → Authentication → Providers → Email: switch off **public sign-ups**. Accounts are created by admins only.

## Smoke test after deploying
1. Sign in as the admin → **Users**: create a supervisor (with email) and an operator (employee code only).
2. **Assignments**: assign the operator to VIM1.
3. On a phone, sign in with the operator's employee code → log one hour → see "Entry saved" and the record in *Recent submissions*. Try submitting the same hour + component again: it must be refused.
4. As the operator, request a correction → as the supervisor, approve it → check that **Audit log** shows the old and new quantity.
5. As the supervisor: **Dashboard** shows the record (live). **Records → Excel** downloads the workbook.
6. Install the PWA on the phone (Add to Home Screen) and reopen it.

## Rolling back
Vercel → Deployments → choose a previous deployment → **Promote to Production**. Database migrations are additive. To roll them back, restore the backup taken before applying them.
