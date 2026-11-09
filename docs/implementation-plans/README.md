# Implementation plans

One plan per container in [`ARCHITECTURE.md`](../../ARCHITECTURE.md), detailed enough to hand to a teammate or their coding agent without a separate briefing. · [← Work plan](../WORK-PLAN.md)

The [work plan](../WORK-PLAN.md) says **who and when**; these plans say **how**. Owners and dates below are copied from it, and it wins if they disagree.

> Written Mon 9 Nov 2026. The foundation ([00](00-foundation.md)) was implemented the same day on branches `wp1-layout` and `wp1-contracts`, awaiting review; until they merge, `main` still has the Next.js app at the root.

## Repository layout

One directory per container, one for the shared contracts, and the tooling at the root. Every directory with a `package.json` is a pnpm workspace package named `@greenwave/<directory>`.

```
greenwave/
├── compose.yaml              every container; each build uses the repo root as its context
├── pnpm-workspace.yaml       the seven packages below
├── package.json              workspace root: tooling only, scripts forward to the packages
├── tsconfig.base.json  eslint.config.mjs  vitest.config.mts  .fallowrc.json  .ls-lint.yml  prettier.config.mjs
├── .env.example  .dockerignore  .husky/  .github/
├── vercel.json               the frozen recorder; stays at the root until after the hand-in
├── ARCHITECTURE.md  CLAUDE.md  README.md  docs/
│
├── shared/      @greenwave/shared     topics, message schemas, congestion rules     (no container)
├── database/    @greenwave/database   Prisma schema, migrations, client, seed       → migrate
├── broker/      Mosquitto config, ACL, password script (not a pnpm package)         → mosquitto-init, mosquitto
├── adapter/     @greenwave/adapter                                                   → adapter-aarhus
├── backend/     @greenwave/backend                                                   → backend
├── predictor/   @greenwave/predictor                                                 → predictor
├── loadgen/     @greenwave/loadgen                                                   → loadgen (loadtest profile)
└── frontend/    @greenwave/frontend   the Next.js app: src/, public/, next.config.ts → frontend
```

`postgres` runs the stock image and needs no directory. Each container's directory holds its own `Dockerfile`, `package.json`, `tsconfig.json` and `src/`. Nothing imports across container directories: containers share code only through `shared/` and `database/`.

## Plans

| Plan                                 | Builds                                                                             | Work package    | Owner             | Needs             |
| ------------------------------------ | ---------------------------------------------------------------------------------- | --------------- | ----------------- | ----------------- |
| [00 · Foundation](00-foundation.md)  | The layout above: `frontend/` moved, the workspace, `shared/`, `database/`, schema | WP1             | Christian         | —                 |
| [01 · Broker](01-broker.md)          | `broker/` → `mosquitto-init`, `mosquitto`                                          | WP2             | Bjoern            | —                 |
| [02 · Migrate](02-migrate.md)        | `database/Dockerfile` → `migrate`, and the Dockerfile pattern every service copies | WP2             | Bjoern            | 00                |
| [03 · Adapter](03-adapter.md)        | `adapter/` → `adapter-aarhus`                                                      | WP3             | Bjoern            | 00, 01, 02        |
| [04 · Backend](04-backend.md)        | `backend/` → `backend`                                                             | WP4             | Christian         | 00, 01, 02        |
| [05 · Frontend](05-frontend.md)      | `frontend/` → `frontend`: live map, image, forecast slider, PoC removal            | WP5, WP8 part 1 | bd-nis, Christian | 00, 01; slider 06 |
| [06 · Predictor](06-predictor.md)    | `predictor/` → `predictor`, the history backfill, the backtest                     | WP6             | bd-nis            | 00; job 04        |
| [07 · Load generator](07-loadgen.md) | `loadgen/` → `loadgen`, measurements                                               | WP7             | Bjoern            | 03, 04            |

```
00 foundation ──┬──► 02 migrate ──┬──► 03 adapter ──┐
                │                 ├──► 04 backend ──┼──► 07 loadgen
01 broker ──────┴─────────────────┤                 │
                                  └──► 05 frontend A/B
00 ──► 06 predictor data ──► (04 running) ──► 06 job ──► 05 frontend C (slider)
05 A ──► 05 D (remove the proof of concept)
```

01 can start today, in parallel with 00. 00's first PR **moves the Next app into `frontend/`**; merge it fast, because every other branch rebases over it. Everything else needs 00's `shared/` and `database/` merged first. A plan may start against 00's **written** contract (its exports and models are spelled out in full) before 00 merges, but must rebase onto it before its own PR.

## Handing a plan off

Give the person or agent these files, in this order:

1. [`CLAUDE.md`](../../CLAUDE.md), and for frontend work `frontend/CLAUDE.md` with `frontend/AGENTS.md` (00 moves the Next-specific rules there): conventions, and the traffic gotchas that silently produce wrong output.
2. [`ARCHITECTURE.md`](../../ARCHITECTURE.md): the design and the reasons for it.
3. This README: the layout, shared rules and contracts.
4. Their plan, plus [00 · Foundation](00-foundation.md) for the names they build against.
5. [Libraries and connections](../work-plan/libraries-and-connections.md): versions, users, ports, variables.

Each plan has the same sections: **Goal**, **Read first**, **Interfaces**, **Files**, **Steps**, **Tests**, **Compose**, **Pitfalls**, **Done when**, **Not in this plan**. Steps are ordered and roughly one PR each.

## Rules for every plan

- **pnpm only.** `pnpm add <pkg> --filter @greenwave/<directory>`; never npm or yarn.
- **Imports.** `@/` aliases inside `frontend/`. **Relative** imports inside every other package: they are consumed as TypeScript source, so an `@/` there would resolve against the importer's tsconfig. Across packages, only `@greenwave/shared` and `@greenwave/database`.
- **Filenames** kebab-case everywhere (`ls-lint` checks every package's `src/`).
- **React Compiler** is on in the frontend: no hand-written `useMemo`, `useCallback` or `memo`.
- **Types:** let TypeScript infer; annotate parameters, exported return types and empty collections.
- **Next.js 16** is not the one in your training data. Read the relevant guide in `frontend/node_modules/next/dist/docs/` before writing Next code.
- **Branch** per work package (`wp3-adapter`), merged by PR. Small PRs beat big ones.
- **Before the PR**, run `pnpm lint && pnpm typecheck && pnpm test --run && pnpm analyze` from the repo root. fallow fails on unused files, exports and dependencies, so delete what your change leaves unused.
- **Contracts and schema are shared.** A change to `shared/` or `database/prisma/schema.prisma` needs review from both of the others.
- **Stay in your directory.** Touch other directories only at the touch points your plan lists. Each plan adds its own Compose service and its own lines to `.env.example`.
- **Track progress** by ticking the checkboxes in your plan. The work-package files stay the summary that Monday's planning reads.

## Cross-plan contracts

Each contract has one owner; everybody else reads it.

| Contract                                 | Defined in                                                                    | Owner plan | Used by                    |
| ---------------------------------------- | ----------------------------------------------------------------------------- | ---------- | -------------------------- |
| Topics and topic builders                | `shared/src/topics.ts`                                                        | 00         | 03, 04, 05, 07             |
| Observation message                      | `shared/src/observation.ts`                                                   | 00         | 03 writes, 04 reads, 07    |
| State message                            | `shared/src/state.ts`                                                         | 00         | 04 writes, 05 reads        |
| Adapter status message                   | `shared/src/status.ts`                                                        | 00         | 03 writes, 05 reads        |
| Congestion levels, thresholds, TTL       | `shared/src/congestion.ts`                                                    | 00         | 04, 05, 06                 |
| Route, segment, state, history, receipts | `database/prisma/schema.prisma`                                               | 00         | 04 writes; 05, 06 read     |
| Route links and forecasts                | `database/prisma/schema.prisma`                                               | 06         | 06 writes, 05 reads        |
| Service Dockerfile pattern               | [02 · Migrate → The Dockerfile pattern](02-migrate.md#the-dockerfile-pattern) | 02         | 03, 04, 06, 07             |
| Observation fixture                      | `shared/src/fixtures/observation-56634.json`                                  | 00         | contract tests, 07         |
| Recorded TomTom responses                | `adapter/fixtures/route-<id>.json`                                            | 03         | the adapter's fixture mode |
| Backend metrics log line                 | [04 · Backend → Metrics](04-backend.md#metrics)                               | 04         | 07                         |
| MQTT users and ACL                       | `broker/acl`                                                                  | 01         | 03, 04, 05, 07             |
| Ports, variables, users                  | [Libraries and connections](../work-plan/libraries-and-connections.md)        | —          | all                        |

**MQTT passwords.** Each service reads the variable named after its own user (`MQTT_ADAPTER_PASSWORD`, `MQTT_BACKEND_PASSWORD`, `MQTT_LOADGEN_PASSWORD`, `MQTT_MONITOR_PASSWORD`), so one root `.env` serves every service in development and Compose needs no renaming. This replaces the generic `MQTT_USERNAME`/`MQTT_PASSWORD` in the WP3 file.

## Deliberate deviations from best practice

Checked against pnpm's and Docker's documentation on 9 Nov 2026. These differ from the recommended setup on purpose; change them only together with this table.

| Practice                                                   | What we do instead                                                                                    | Why                                                                                                                                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compose secrets (`/run/secrets/…`) for passwords           | MQTT passwords as environment variables, interpolated from `.env`                                     | The stack runs locally only; `ARCHITECTURE.md` puts credentials and TLS out of scope, and the app's other secrets already live in `.env`.                           |
| A production-only final image (`--prod`, or `pnpm deploy`) | Services ship their dev dependencies and run TypeScript through `tsx`                                 | No build step to keep in sync. `pnpm deploy` would also drop the git-ignored Prisma client unless `database/` gains a `files` field.                                |
| BuildKit cache mounts for the pnpm store                   | A cached `pnpm fetch` layer                                                                           | pnpm's own fallback recipe; it needs nothing from the builder. Cache mounts are an easy later speed-up.                                                             |
| One Compose file per component, joined with `include:`     | One root `compose.yaml`                                                                               | Every build needs the repo root as context and the root `.env`, so each included file would need `context: ..` and `env_file: ../.env`. Nine services fit one file. |
| Compose Watch (`develop.watch`) for live reload            | Services run on the host with `tsx watch`; Docker runs only `postgres` and `mosquitto` in development | Faster on macOS, with no `node_modules` syncing.                                                                                                                    |

Followed: one lockfile, `workspace:*`, a catalog for shared versions, `pnpm fetch` then an offline filtered install, multi-stage frontend build, non-root users, `init: true` with `node` as the command, `service_healthy` / `service_completed_successfully` ordering, a profile only for the optional load generator, explicit per-service `environment`, pinned image versions.

## Running things

| What                        | Command                                                                         |
| --------------------------- | ------------------------------------------------------------------------------- |
| Postgres and the broker     | `pnpm db:up` (after [01](01-broker.md))                                         |
| One service in development  | `pnpm --filter @greenwave/<directory> dev` (`tsx watch`, reads the root `.env`) |
| The Next app                | `pnpm dev` (forwards to `@greenwave/frontend`)                                  |
| The whole stack             | `docker compose up --build`                                                     |
| Every message on the broker | `mosquitto_sub -v -t 'greenwave/v1/#' -u backend -P "$MQTT_BACKEND_PASSWORD"`   |
