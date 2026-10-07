# GreenWave

IoT device and sensor dashboard — Next.js 16, Prisma 7 + PostgreSQL, Better Auth, TanStack Query, Tailwind 4 + shadcn/ui.

## Getting started

```bash
pnpm install
cp .env.example .env        # a .env with a generated BETTER_AUTH_SECRET is already present
pnpm db:up                  # Postgres via Docker Compose
pnpm db:migrate             # create the schema
pnpm db:seed                # optional demo data
pnpm dev
```

Then sign up at http://localhost:3000/signup.

## Scripts

`dev` · `build` · `start` · `lint` · `format` · `typecheck` · `test` · `analyze` · `analyze:ci` · `db:up` · `db:down` · `db:migrate` · `db:push` · `db:generate` · `db:seed` · `build-prod` · `start-prod` · `build-vercel`

## Deployment

### Vercel

Production deploys from `main`; preview builds are skipped (`vercel.json`). Traffic history is recorded hourly by a GitHub Actions schedule calling `/api/cron/traffic-history`, because Vercel's Hobby plan does not allow hourly crons.

1. Merge into `main` — Vercel production and GitHub schedules both run from the default branch.
2. In Vercel, add a new project and import this repo. Build, ignore and region settings come from `vercel.json`. The first build fails until steps 3–4 are done; that is expected.
3. In the project's **Storage** tab, create a **Neon** database in AWS Frankfurt (`eu-central-1`), Free plan, connected to **Production**. This sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
4. Set these **Production** environment variables:
   - `BETTER_AUTH_SECRET` — `openssl rand -base64 32`
   - `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` — `https://<project>.vercel.app`
   - `TOMTOM_API_KEY`, `MAPBOX_PUBLIC_TOKEN`
   - `CRON_SECRET` — `openssl rand -hex 32`
   - `ENABLE_EXPERIMENTAL_COREPACK` = `1` (lets Vercel use the pinned pnpm 12)
5. Redeploy — existing deployments don't pick up new variables. The build applies migrations. Then sign up at `/signup` (the new database has no users). If your Mapbox token is URL-restricted, allow the Vercel domain.
6. In GitHub → Settings → Secrets and variables → Actions, add secret `CRON_SECRET` (same value) and variable `APP_URL` = the production domain.
7. Actions → **Traffic history** → **Run workflow** to check it; afterwards it runs at minute 7 of every hour (UTC). A second run in the same hour reports `inserted: 0` by design.

### Docker

`Dockerfile` builds a standalone Next.js image (`STANDALONE_BUILD=1`). `start-prod` applies migrations before booting the server. `CRON_SECRET` is required here too, and something must call the cron endpoint hourly.

## Conventions

See `CLAUDE.md` for the layering rules, and `NEXTJS_FULLSTACK_TEMPLATE.md` for the template they come from.
