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

`dev` · `build` · `start` · `lint` · `format` · `typecheck` · `test` · `analyze` · `analyze:ci` · `db:up` · `db:down` · `db:migrate` · `db:push` · `db:generate` · `db:seed` · `build-prod` · `start-prod`

## Deployment

`Dockerfile` builds a standalone Next.js image (`STANDALONE_BUILD=1`). `start-prod` applies migrations before booting the server.

## Conventions

See `CLAUDE.md` for the layering rules, and `NEXTJS_FULLSTACK_TEMPLATE.md` for the template they come from.
