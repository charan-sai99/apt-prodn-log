# Deploying to Netlify

## Release workflow (keep production deploys rare)
Branch deploys and Deploy Previews cost 0 Netlify credits; production deploys do not. So:

1. **All work goes to the `dev` branch.** Every push builds a preview at
   **https://dev--apt-prodn-log.netlify.app** (sign in with your Netlify account to view it).
2. **Test there.** It uses the same Supabase database as production, so test with a test operator and
   void any test entries afterwards.
3. **Release in batches:** when a set of changes is ready, merge `dev` into `main`
   (GitHub → Pull requests → New → base `main`, compare `dev` → Merge). That is the only production deploy.
4. Database changes (`supabase/migrations/…`) are run in the Supabase SQL editor **before** merging the app
   change that needs them. Write them so the old app version keeps working (add columns, never drop).

Once the app settles, a few production deploys a month is enough.

Netlify setting needed once: Project configuration → Build & deploy → Branches and deploy contexts →
**Branch deploys: Let me add individual branches → `dev`**, and **Deploy Previews: Any pull request**.


## Prerequisites
- Database migrations reviewed and applied, and a first admin created (see DATABASE.md). The app runs without them but nobody can sign in.
- This repository is on GitHub (branch `nextjs-migration`, or `main` once merged).

## Steps
1. **app.netlify.com → Add new site → Import an existing project → GitHub** → choose `charan-sai99/apt-prodn-log`.
2. **Branch to deploy:** `nextjs-migration` (or `main` after merging). Build settings come from `netlify.toml` (`npm run build`, publish `.next`, Node 22). Netlify's Next.js runtime is applied automatically.
3. **Environment variables** (Site configuration → Environment variables). Add them for all deploy contexts:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://<ref>.supabase.co` (the API URL, not the dashboard address)
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_…`
   - `SUPABASE_SECRET_KEY` = `sb_secret_…` (mark it **secret**; scope: Builds + Functions)
   - `OPERATOR_LOGIN_DOMAIN` = `operators.apt.internal` (keep it stable once operators exist)
   - `NEXT_PUBLIC_SITE_URL` = the site URL, e.g. `https://apt-production-log.netlify.app`. This is optional because Netlify's `URL` is used as a fallback.
4. **Deploy site.** After that, every push to the chosen branch redeploys, and pull requests get Deploy Previews.
5. **Supabase → Authentication → URL Configuration:** set **Site URL** to the Netlify URL. Add `https://<site>.netlify.app/auth/confirm` to **Redirect URLs** so password-reset emails work. Optionally add `https://deploy-preview-*--<site>.netlify.app/auth/confirm` too.
6. Optional: Supabase → Authentication → Providers → Email → switch off public sign-ups. Accounts are created by admins only.

## Smoke test
1. Sign in as the admin → **Users**: create a supervisor (with email) and an operator (employee code only).
2. **Assignments**: assign the operator to VIM1.
3. On a phone, sign in with the operator's employee code → log one hour → you should see "Entry saved". Submitting the same hour + component again must be refused.
4. As the operator, request a correction → as the supervisor, approve it → the **Audit log** shows the old and new quantity.
5. Check that the supervisor **Dashboard** updates live and that **Records → Excel** downloads.
6. Install the app on the phone (Add to Home Screen).

## Rolling back
Netlify → Deploys → choose an earlier deploy → **Publish deploy**. Database migrations are additive. To undo them, restore the backup taken before applying.
