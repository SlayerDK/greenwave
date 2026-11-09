# 02 · Migrate, and the Dockerfile pattern

**Compose service `migrate` (one-shot), built from `database/Dockerfile`, plus the Dockerfile pattern the adapter, backend, predictor and loadgen copy.** [WP2](../work-plan/wp2-compose-and-broker.md) · Bjoern · 2–6 Nov · Needs [00](00-foundation.md) · Unblocks [03](03-adapter.md), [04](04-backend.md), [06](06-predictor.md), [07](07-loadgen.md). · [← Plans](README.md)

> **Status, Mon 9 Nov:** implemented on branch `wp2-migrate`, off `main` after [00](00-foundation.md) merged. Every test below passed. The pattern's open questions are settled: the selective `COPY`s work, and `--ignore-scripts` keeps the schema engine. Where the implementation had to differ from what this plan first said, the text below now says what was done and why (marked _Changed in implementation_). Only M1's `mosquitto` half is left, for [01](01-broker.md).

## Goal

A `migrate` container that applies every pending migration and exits, so every service that touches the database can wait for it. Its Dockerfile is also the first instance of the pattern every Node container uses: built from the repo root, installing only its own package and the workspace packages it depends on.

## Read first

- [README → Repository layout](README.md#repository-layout).
- [00 · Foundation](00-foundation.md) → `database/` (the package, its scripts and `prisma.config.ts`) and the root `.dockerignore`.
- `frontend/Dockerfile`, whose install-then-generate approach this follows.
- [`CLAUDE.md`](../../CLAUDE.md) → _Deployment_ (why `DATABASE_URL_UNPOOLED` is preferred).
- pnpm's [Working with Docker](https://pnpm.io/docker) guide, the `pnpm fetch` section.

## Interfaces

| In             | Out                                                        |
| -------------- | ---------------------------------------------------------- |
| `DATABASE_URL` | The schema at the newest migration; exit code 0 on success |

## Files

```
database/Dockerfile     (new) → migrate
compose.yaml      migrate
```

## The Dockerfile pattern

Every Node container's Dockerfile lives in its own directory but is built with the **repo root** as its context, because it needs the lockfile and the workspace packages beside it. Three rules:

1. **`pnpm fetch` first,** from the lockfile and the root manifests (pnpm's documented Docker recipe). That layer is cached until a dependency changes. It holds every package in the lockfile, about 1.5 GB, so `docker images` shows each image at about 2.1 GB. Docker stores the layer once for every image whose lines are identical up to `RUN pnpm fetch`: **copy those lines exactly, and add nothing above them.**
2. **Copy only what the container needs:** the root manifests, `shared/`, `database/` and the container's own directory. With `COPY . .`, an edit in `frontend/` would invalidate every service's install layer.
3. **Run the program with `node`, not `pnpm`.** pnpm is only a build tool here. Under `pnpm … start`, SIGTERM has to pass through pnpm and tsx before the service's shutdown handler sees it, and corepack downloaded pnpm into root's cache, so after `USER node` the `pnpm` in `CMD` may try to download itself again at start-up. `node --import tsx` loads the TypeScript directly, and Compose's `init: true` forwards signals and reaps child processes.

`database/Dockerfile`:

```dockerfile
# Pin the minor version (check Docker Hub), the same one in every Dockerfile.
FROM node:24.22-alpine
# Prisma needs OpenSSL on Alpine.
RUN apk add --no-cache openssl && corepack enable
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
WORKDIR /app

# Cached until the lockfile or the root manifest changes. (The real file's comment is longer.)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

# Only this container's sources. --ignore-scripts skips the root preinstall/postinstall;
# the client is generated below.
COPY tsconfig.base.json ./
COPY database database
RUN pnpm install --offline --frozen-lockfile --ignore-scripts --filter "@greenwave/database..."
RUN pnpm --filter @greenwave/database generate

USER node
WORKDIR /app/database
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]
```

A service's Dockerfile is the same with its own sources and filter, and `node` as its command. `backend/Dockerfile` from the second `COPY` on:

```dockerfile
COPY tsconfig.base.json ./
COPY shared shared
COPY database database          # only if the service depends on @greenwave/database
COPY backend backend
RUN pnpm install --offline --frozen-lockfile --ignore-scripts --filter "@greenwave/backend..."
RUN pnpm --filter @greenwave/database generate     # only if the service depends on @greenwave/database

USER node
WORKDIR /app/backend
CMD ["node", "--import", "tsx", "src/main.ts"]
```

- _Changed in implementation:_ `package.json` is copied with the lockfile, before `pnpm fetch`. Corepack reads pnpm's version from its `packageManager`; without it, `fetch` ran the newest pnpm (12.18) and the install 12.6. Because of that mismatch, the next `pnpm --filter … generate` reran a full install with scripts, whose root `postinstall` failed. It costs a re-fetch whenever the root `package.json` changes.
- _Verified:_ rule 2 holds. The offline filtered install works while the other workspace directories are missing from the image, and adding a file under `frontend/` leaves every layer of this image cached. No `COPY . .` needed.
- _Verified:_ the install also links the root's devDependencies (eslint, vitest and the rest), because pnpm always includes the workspace root. They are already in the fetch layer, so it costs about 2 MB.
- _Verified:_ `--ignore-scripts` is safe. `pnpm fetch` fills the virtual store (`node_modules/.pnpm`), not just pnpm's store, and runs the build scripts `allowBuilds` permits. So the schema engine (`schema-engine-linux-musl-<arch>-openssl-3.0.x`) is downloaded in the fetch layer, and `migrate deploy` finds it.
- Compose builds with the classic builder when buildx is not installed, as on Christian's Mac. That builder has no BuildKit cache mounts, which is one more reason for the fetch layer.
- `tsx` must be in the service's own `devDependencies` (every service plan has it), so `node --import tsx` resolves it from the service's directory. Dev dependencies are installed: do not set `NODE_ENV=production` before the install.
- Services that read the root `.env` in development do so through their `dev` script (`tsx watch --env-file=../.env`); in Compose the variables come from the service's `environment`, so the `CMD` needs no env file.

Every Node service's Compose block sets `init: true` and leaves out `command:` (the Dockerfile's `CMD` is the command).

## Steps

- [x] `database/Dockerfile` as above.
- [x] `compose.yaml`:

  ```yaml
  migrate:
    build: { context: ., dockerfile: database/Dockerfile }
    environment:
      DATABASE_URL: postgresql://greenwave:greenwave@postgres:5432/greenwave
    depends_on:
      postgres: { condition: service_healthy }
  ```

  Every service that reads or writes the database adds:

  ```yaml
  depends_on:
    migrate: { condition: service_completed_successfully }
  ```

- [x] `database/prisma.config.ts` loads `../.env`, which is not in the image. dotenv skips the missing file, and Compose sets `DATABASE_URL`. _Changed in implementation:_ the URL is now `process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL`, not Prisma's `env("DATABASE_URL")`. `env()` throws while the config loads, so the build's `prisma generate`, which never connects, failed with `PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL`. The same broke `pnpm install` (its `postinstall` generates) on a clone without a `.env`. A command that does connect still fails clearly without a URL: `The datasource.url property is required in your Prisma config file when using prisma migrate deploy.`

## Tests

All passed on 9 Nov. The first `up` was run against a fresh scratch database, since the local `greenwave` already had every migration.

```bash
docker compose build migrate
docker compose up migrate            # "All migrations have been successfully applied", exit 0
docker compose up migrate            # again: "No pending migrations to apply", exit 0
docker compose ps -a migrate         # Exited (0)
docker compose exec postgres psql -U greenwave -c '\dt'   # 18 tables, the pipeline's from 00 among them
echo "// cache test" >> frontend/src/app/layout.tsx && docker compose build migrate   # every layer cached: frontend/ is not in this image
git checkout frontend/src/app/layout.tsx
git archive HEAD | docker build -f database/Dockerfile -   # builds from a clean checkout: no .env, node_modules or generated client
```

## Pitfalls

- **`migrate` exits by design.** `docker compose ps` shows it as exited, not failed. Never give it `restart:`.
- **Migrations run here only.** The frontend image used to run `prisma migrate deploy` on start (`start-prod`); [00](00-foundation.md) and [05](05-frontend.md) remove that. Two migrators racing on one database is how a half-applied migration happens.
- Do not use `prisma migrate dev` in Compose: it can reset the database.
- **The build context is the repo root, not the container's directory.** `docker build database/` fails; use `docker compose build migrate` or `docker build -f database/Dockerfile .`.

## Done when

- [ ] `docker compose up` starts `postgres` and `mosquitto` healthy, and `migrate` exits 0 (M1, with [01](01-broker.md)). The `postgres` and `migrate` half passes.
- [x] A second `docker compose up migrate` is a no-op that also exits 0.
- [x] The image builds from a clean checkout with no `.env` present.

## Not in this plan

- Each service's Dockerfile, environment and healthcheck: its own plan, copying the pattern above.
- The frontend image: [05](05-frontend.md), phase B.
