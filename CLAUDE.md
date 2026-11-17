# GreenWave

Live traffic for Aarhus: an adapter publishes TomTom readings over MQTT, a backend stores them and
derives each route's state, and a Next.js app shows them on a map. The design is in
`ARCHITECTURE.md`, the schedule in `docs/WORK-PLAN.md`, and one plan per container in
`docs/implementation-plans/`.

## Layout

One directory per container, one for the shared contracts, tooling at the root. Every directory
with a `package.json` is a pnpm workspace package named `@greenwave/<directory>`.

```
compose.yaml   pnpm-workspace.yaml   package.json   tsconfig.base.json   (and the lint/test configs)
shared/      @greenwave/shared     MQTT topics, message schemas, congestion rules (no container)
database/    @greenwave/database   Prisma schema, migrations, client, seed        → migrate
broker/      Mosquitto config, ACL and verification (not a pnpm package)                        → mosquitto
adapter/  backend/  predictor/                                          → one container each
frontend/    @greenwave/frontend   the Next.js app; its rules are in frontend/CLAUDE.md
```

The foundation includes `frontend/`, `shared/` and `database/`; `broker/` now implements plan 01. The remaining directories arrive with their plans. The required pipeline uses one Aarhus adapter, one broker and one backend with fixed MQTT client ID `backend-1` and a normal subscription. No load-generator/monitor service or multiple backend workers are required. Scope and all nine learning-goal evidence requirements are in `docs/WORK-PLAN.md`.

- **Containers share code only through `shared/` and `database/`.** Nothing imports across container
  directories.
- **`shared/` runs in the browser too:** Zod only, no Node built-ins, no Prisma. The Prisma enum
  `TrafficCongestion` mirrors its `CONGESTION_LEVELS`; never derive one from the other.
- **Imports:** `@/` aliases inside `frontend/`; relative imports in every other package. They are
  consumed as TypeScript source, so an `@/` there would resolve against the importer's tsconfig.
- **One `.env`, at the root.** Next would look for it in `frontend/`, so the frontend's scripts load
  it with `dotenv -e ../.env`; `database/prisma.config.ts` loads it itself, and services use
  `--env-file=../.env`. A variable already set wins, which is how Compose and production override it.
- **Dependencies:** `pnpm add <pkg> --filter @greenwave/<directory>`. A version several packages
  share lives once in `pnpm-workspace.yaml`'s `catalog:`; packages write `"catalog:"` instead.

## Commands

Run every check from the root.

| Command                        | Purpose                                                                |
| ------------------------------ | ---------------------------------------------------------------------- |
| `pnpm dev`                     | Next dev server                                                        |
| `pnpm build`                   | Next production build                                                  |
| `pnpm typecheck`               | `tsc --noEmit` in every package (`next typegen` first in the frontend) |
| `pnpm lint`                    | ESLint, whole repo                                                     |
| `pnpm test`                    | Vitest, one project per package                                        |
| `pnpm analyze`                 | fallow full sweep                                                      |
| `pnpm analyze:ci`              | fallow changed-file gate (pre-push + CI)                               |
| `pnpm db:up` / `db:down`       | Local Postgres and MQTT broker                                         |
| `pnpm broker:verify`           | Isolated real-broker acceptance checks                                 |
| `pnpm db:migrate` / `db:seed`  | Prisma migrate / seed                                                  |
| `pnpm db:generate`             | Prisma client (also runs on `pnpm install`)                            |
| `pnpm db:import-traffic-stats` | Load the Traffic Stats export                                          |

pnpm only (`only-allow` preinstall hook). Husky runs lint-staged on `pre-commit` and `ls-lint` + `fallow audit` on `pre-push`.
Run Prisma through these scripts or `pnpm --filter @greenwave/database exec prisma …`, never `npx prisma` at the root:
its config lives in `database/`.

## Deployment (Vercel)

- **Frozen until after the hand-in.** `vercel.json`'s `"ignoreCommand": "exit 0"` skips every build,
  so production keeps the history recorder while `main` is rebuilt around the new pipeline. Removed
  in WP8 part 2 (`docs/work-plan/wp8-clean-up.md`). Never unfreeze it with previews enabled: Preview
  would share production's env vars, and with them its database and migrations. `vercel.json` stays
  at the root because the Vercel project's Root Directory is the repo root; set that to `frontend`
  before unfreezing, or the next push builds the wrong directory.
- `pnpm build-vercel` runs `prisma generate && prisma migrate deploy && next build`. Generate is
  explicit because the generated client is git-ignored and must not depend on `postinstall`. It
  predates the move into `frontend/` and no longer runs as written; nothing runs it while frozen.
- `database/prisma.config.ts` prefers `DATABASE_URL_UNPOOLED`: Migrate's advisory lock cannot be held
  through Neon's pooled `DATABASE_URL`. The runtime keeps the pooled URL.
- Functions are pinned to `fra1`, next to the Neon database in AWS Frankfurt.
- `ENABLE_EXPERIMENTAL_COREPACK=1` must be set on Vercel: it natively runs pnpm 6–10, and
  `packageManager` pins pnpm 12 (whose `allowBuilds` older versions ignore).

## Project-specific deviations from the template

- **Prisma 7** requires `prisma.config.ts` (in `database/`); the datasource URL lives there, not in `schema.prisma`. The client is generated to `database/src/generated/prisma` (git-ignored) and exported as `@greenwave/database`, with `createPrismaClient(url)`.
- `pg` and `@ls-lint/ls-lint` are in `ignoreDependencies` — one is a Prisma adapter peer, the other is CLI-only.
