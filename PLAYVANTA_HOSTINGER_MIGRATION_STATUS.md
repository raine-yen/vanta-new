# PlayVanta (Vanta Paper Trader) — Hostinger Migration Handoff

## Status: Code migration COMPLETE, deployment pending manual steps

### What's DONE ✅

1. **Express + MySQL backend** — `server.js` entry point, `src/vanta-routes.js` (all 43 routes), `src/lib/auth-mysql.js` (MySQL auth), `src/lib/mysql-client.js`, `src/cron-jobs.js`, `src/cron-handler.js`
2. **DB schema** — `database/migrations/001_vanta_paper_trader.sql` (544 lines, 25+ tables)
3. **Migration runner** — `scripts/migrate.mjs` with SHA-256 checksum verification
4. **Next.js frontend** — `src/app/` pages, `.next/` production build exists
5. **Supabase cleanup** — All Express runtime files converted to MySQL:
   - `src/lib/engine.ts` → `getDb()` (MySQL pool)
   - `src/lib/prices.ts` → `getDb()` (MySQL pool)
   - `src/lib/prediction-engine.ts` → `getDb()` (MySQL pool)
   - `src/lib/prediction-settle.ts` → `getDb()` (MySQL pool)
   - `src/lib/mysql-duck.ts` — new MySQL-compatible duck-typed DB wrapper
   - `src/lib/supabase/` directory deleted (dead code)
   - `@supabase/ssr` and `@supabase/supabase-js` removed from `package.json`
6. **Route paths fixed** — All 49 Express routes corrected (removed `/api/` prefix)
7. **Google OAuth** — Added `GET /auth/google` redirect + `POST /auth/google/callback` endpoints
8. **Layout auth** — `src/app/(app)/layout.tsx` converted to use Express Bearer token
9. **Auth callback** — `src/app/auth/callback/route.ts` converted to use Express auth
10. **`next.config.mjs`** — Restored (renamed from `next.config 2.mjs`)
11. **HOSTINGER_DEPLOYMENT.md** — comprehensive 79-line deployment guide exists
12. **VERCEL_DEPRECATED.md** — marks Vercel as deprecated

### Git state

- **Branch:** `release/vanta-production`
- **Latest commit:** `d4390e6` (local only, NOT pushed)
- **Remote:** `origin https://github.com/raine-yen/paper-trader.git` ⚠️ **REPO DOES NOT EXIST**
- **GitHub user:** `raine` (Raine Virta), not `raine-yen`
- **Staged files:** 16 files (see git status below)

## What needs YOUR action

### Step 1: Create GitHub repo

The remote `raine-yen/paper-trader` doesn't exist. You need to either:
- Create a new repo at `https://github.com/raine/paper-trader` (under your `raine` account)
- Or create it at `https://github.com/raine-yen/paper-trader` (if you have that org)

Then update the remote:
```bash
cd C:/Users/raine/iCloudDrive/Projects/vanta-release
git remote set-url origin https://github.com/raine/paper-trader.git
git push origin release/vanta-production
```

### Step 2: Hostinger setup (see HOSTINGER_DEPLOYMENT.md)

1. **Hosting plan:** Business Web Hosting (or Cloud)
2. **Create Node.js web app** from GitHub repo `raine/paper-trader`, branch `release/vanta-production`
3. **Build settings:** Node.js 22, framework "Other / Express", entry `server.js`, build `npm run build`
4. **Create MySQL database** in hPanel, record host, database name, user, password
5. **Set environment variables** in hPanel:
   - `DB_HOST` (usually localhost)
   - `DB_PORT` (3306)
   - `DB_NAME` (full prefixed name)
   - `DB_USER` (full prefixed user)
   - `DB_PASSWORD`
   - `CRON_SECRET` (generate a long random secret)
   - `APP_URL` (your domain's HTTPS origin)
   - `NEXT_PORT` (3001)
   - `CORS_ORIGIN` (your domain)
   - `ALLOWED_ORIGINS` (comma-separated)
   - `GOOGLE_CLIENT_ID` (if using Google OAuth)
   - `GOOGLE_CLIENT_SECRET` (if using Google OAuth)
6. **Run `npm run db:migrate`** once via Hostinger command interface
7. **Promote first owner** in phpMyAdmin:
   ```sql
   UPDATE users SET role = 'owner' WHERE email = 'YOUR_EMAIL';
   ```
8. **Create 4 cron jobs** in hPanel (Custom command):
   - tick: `0 13 * * *` → `/api/cron/tick`
   - snapshot: `5 13 * * *` → `/api/cron/snapshot`
   - predictions: `10 13 * * *` → `/api/cron/predictions`
   - predictions-settle: `15 13 * * *` → `/api/cron/predictions-settle`

### Step 3: DNS cutover

Point your custom domain's DNS to Hostinger (nameservers or A record).

### Step 4: Verify

- `GET /health` → `{ "ok": true }`
- `GET /api/cron/tick` without auth → `401`
- Sign up, sign in, load `/api/me`, `/api/competitions`, `/api/leaderboard`
- Place a paper order, verify in MySQL
- All 4 cron jobs show successful output

## Known issues

1. **Dead code in `src/app/api/`** — 60+ files still reference Supabase. These are never loaded by Express (server.js handles all `/api/*` via `src/vanta-routes.js`). They can be cleaned up later.
2. **iOS assets deleted** — `ios/PaperTrader/Assets.xcassets/` icons deleted (not needed for web deployment)
3. **Google OAuth** — Requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Hostinger env vars
4. **Resend email** — Optional until sender domain is verified
5. **Uploads directory** — `uploads/` for avatars needs persistent storage on Hostinger

## Deployment branch note

The branch is `release/vanta-production`. If you want Hostinger to deploy from `main`, merge this branch into `main` first:
```bash
cd C:/Users/raine/iCloudDrive/Projects/vanta-release
git checkout main
git merge release/vanta-production
git push origin main
```
