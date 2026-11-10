# 02 · Migrate, and the Dockerfile pattern

**Compose service `migrate` (one-shot), built from `database/Dockerfile`, plus the Dockerfile pattern the adapter, backend and predictor copy.** [WP2](../work-plan/wp2-compose-and-broker.md) · Bjoern · 2–6 Nov · Needs [00](00-foundation.md) · Unblocks [03](03-adapter.md), [04](04-backend.md), [06](06-predictor.md), [07](07-loadgen.md). · [← Plans](README.md)

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

1. **`pnpm fetch` first,** from the lockfile alone (pnpm's documented Docker recipe). That layer is cached until a dependency changes.
2. **Copy only what the container needs:** the root manifests, `shared/`, `database/` and the container's own directory. With `COPY . .`, an edit in `frontend/` would invalidate every service's install layer.
3. **Run the program with `node`, not `pnpm`.** pnpm is only a build tool here. Under `pnpm … start`, SIGTERM has to pass through pnpm and tsx before the service's shutdown handler sees it, and corepack downloaded pnpm into root's cache, so after `USER node` the `pnpm` in `CMD` may try to download itself again at start-up. `node --import tsx` loads the TypeScript directly, and Compose's `init: true` forwards signals and reaps child processes.

`database/Dockerfile`:

```dockerfile
# Pin the minor version (check Docker Hub), the same one in every Dockerfile.
FROM node:24.<minor>-alpine
# Prisma needs OpenSSL on Alpine.
RUN apk add --no-cache openssl && corepack enable
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
WORKDIR /app

# Cached until the lockfile changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

# Only this container's sources. --ignore-scripts skips the root preinstall/postinstall;
# the client is generated below.
COPY package.json tsconfig.base.json ./
COPY database database
RUN pnpm install --offline --frozen-lockfile --ignore-scripts --filter "@greenwave/database..."
RUN pnpm --filter @greenwave/database generate

USER node
WORKDIR /app/database
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]
```

A service's Dockerfile is the same with its own sources and filter, and `node` as its command. `backend/Dockerfile` from the second `COPY` on:

```dockerfile
COPY package.json tsconfig.base.json ./
COPY shared shared
COPY database database          # only if the service depends on @greenwave/database
COPY backend backend
RUN pnpm install --offline --frozen-lockfile --ignore-scripts --filter "@greenwave/backend..."
RUN pnpm --filter @greenwave/database generate     # only if the service depends on @greenwave/database

USER node
WORKDIR /app/backend
CMD ["node", "--import", "tsx", "src/main.ts"]
```

- **Verify rule 2 first.** pnpm may refuse an offline filtered install while other directories listed in `pnpm-workspace.yaml` are missing from the image. If it does, fall back to `COPY . .` (`.dockerignore` from [00](00-foundation.md) keeps out `node_modules`, `.next`, the generated client, `.env` and `docs`), and say so in the PR so the other Dockerfiles follow.
- `tsx` must be in the service's own `devDependencies` (every service plan has it), so `node --import tsx` resolves it from the service's directory. Dev dependencies are installed: do not set `NODE_ENV=production` before the install.
- Services that read the root `.env` in development do so through their `dev` script (`tsx watch --env-file=../.env`); in Compose the variables come from the service's `environment`, so the `CMD` needs no env file.
- If `pnpm fetch` or the offline install fails with this pnpm version, drop `fetch` and `--offline` and install directly after the `COPY`s.
- If `prisma migrate deploy` complains that the schema engine is missing, `--ignore-scripts` skipped its download: drop the flag (`allowBuilds` in `pnpm-workspace.yaml` already permits Prisma's build scripts), or add `RUN pnpm --filter @greenwave/database exec prisma --version`, which fetches it.

Every Node service's Compose block sets `init: true` and leaves out `command:` (the Dockerfile's `CMD` is the command).

## Steps

- [ ] `database/Dockerfile` as above.
- [ ] `compose.yaml`:

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

- [ ] `database/prisma.config.ts` loads `../.env`, which is not in the image. Nothing to do: dotenv skips a missing file, and Compose sets `DATABASE_URL`.

## Tests

```bash
docker compose build migrate
docker compose up migrate            # "All migrations have been successfully applied", exit 0
docker compose up migrate            # again: "No pending migrations to apply", exit 0
docker compose ps -a migrate         # Exited (0)
docker compose exec postgres psql -U greenwave -c '\dt'   # the tables from 00
touch frontend/src/app/page.tsx && docker compose build migrate   # every layer cached: frontend/ is not in this image
```

## Pitfalls

- **`migrate` exits by design.** `docker compose ps` shows it as exited, not failed. Never give it `restart:`.
- **Migrations run here only.** The frontend image used to run `prisma migrate deploy` on start (`start-prod`); [00](00-foundation.md) and [05](05-frontend.md) remove that. Two migrators racing on one database is how a half-applied migration happens.
- Do not use `prisma migrate dev` in Compose: it can reset the database.
- **The build context is the repo root, not the container's directory.** `docker build database/` fails; use `docker compose build migrate` or `docker build -f database/Dockerfile .`.

## Done when

- [ ] `docker compose up` starts `postgres` and `mosquitto` healthy, and `migrate` exits 0 (M1, with [01](01-broker.md)).
- [ ] A second `docker compose up migrate` is a no-op that also exits 0.
- [ ] The image builds from a clean checkout with no `.env` present.

## Not in this plan

- Each service's Dockerfile, environment and healthcheck: its own plan, copying the pattern above.
- The frontend image: [05](05-frontend.md), phase B.
