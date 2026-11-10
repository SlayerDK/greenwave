# WP1 · Workspace, contracts and database

**Christian · Mon 2 – Fri 6 Nov.** Everything else builds on it. · [← Work plan](../WORK-PLAN.md)

> **Implementation plan:** [00 · Foundation](../implementation-plans/00-foundation.md). It has the step-by-step detail for handing this off; this file keeps the owner, dates and summary.
>
> **Status, Mon 9 Nov:** done on branches `wp1-layout` (the move) and `wp1-contracts` (contracts and schema), awaiting review. The last three models are 06's. The report drafts are still open.

## pnpm workspace

- [x] One directory per container plus `shared/`, and tooling at the root (layout in the [implementation plans](../implementation-plans/README.md#repository-layout)). `pnpm-workspace.yaml` lists `shared`, `database`, `adapter`, `backend`, `predictor`, `loadgen` and `frontend` beside `allowBuilds`.
- [x] The Next.js app moves into `frontend/` (`@greenwave/frontend`) and depends on `@greenwave/shared` and `@greenwave/database` (`workspace:*`). `vercel.json` stays at the root, which keeps the recorder frozen.
- [x] In `.gitignore`, `/node_modules` becomes `node_modules` (pnpm creates one per package), and add `database/src/generated`.

Packages are consumed as TypeScript source, so files in every package except `frontend/` use **relative imports**: an `@/` would resolve against the importer's tsconfig. Turbopack compiles workspace packages itself, so no `transpilePackages`.

## `shared/` (_new_, `@greenwave/shared`)

Merge by **Tue 3 Nov** so the others can build against it. Zod only, no `server-only`: the browser imports it.

| File             | Exports                                                                                                                                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `topics.ts`      | `observationTopic(city, route)`, `stateTopic(city, route)`, `statusTopic(city)`; normal observations via `observationTopic("+", "+")`; `ALL_STATES`, `ALL_STATUSES`; merged `SHARED_OBSERVATIONS` is legacy and unused by the approved backend |
| `observation.ts` | `observationSchema` (as in `ARCHITECTURE.md`, with `source: "live" \| "fixture" \| "loadtest"`), `toEventId(cityId, routeId, observedAt)`                                                                                                      |
| `state.ts`       | `stateSchema`: the observation plus `segments[].congestion`, `route.congestedSince`, `route.slowerThanUsualSince` (ISO string or `null`)                                                                                                       |
| `status.ts`      | `adapterStatusSchema`: `{ status: "online" \| "offline", at }`                                                                                                                                                                                 |
| `congestion.ts`  | `classifyCongestion` (moved from `src/lib/traffic/serialization.ts`), `CONGESTED_LENGTH_SHARE = 0.2`, `SLOWER_THAN_USUAL_RATIO = 1.3`, `FLAG_SWITCH_READINGS = 3`, `STATE_TTL_SECONDS = 300`                                                   |

`source` exists because replayed fixtures are stamped "now"; without it they would land in the history prediction learns from.

- [x] Test: `src/lib/traffic/fixtures/route-details.json` becomes a valid observation, every id still a string.

## `database/` (_new_, `@greenwave/database`)

- [x] Move `prisma/` and `prisma.config.ts` into it; generate to `database/src/generated/prisma`. `prisma.config.ts` loads the root `.env` (`dotenv.config({ path: "../.env" })`).
- [x] `src/index.ts` exports `createPrismaClient(url)` (the `PrismaPg` adapter, as today), `Prisma` and the model types.
- [x] `src/lib/config/prisma.ts` keeps its `globalThis` singleton and calls `createPrismaClient(env.DATABASE_URL)`.
- [x] Point the five importers of `@/generated/prisma` at `@greenwave/database`: `prisma/seed.ts`, and under `frontend/`: `scripts/import-traffic-stats.ts`, `src/lib/config/prisma.ts`, `src/lib/devices/serialization.ts`, `src/lib/traffic-stats/serialization.ts`.
- [x] Root `db:*` scripts forward to `@greenwave/database`'s scripts; `postinstall` generates the client.

## Schema

One migration. Fields camelCase, tables `@@map`ped to snake_case.

| Model                       | Key                                             | Holds                                                                          | Written by        |
| --------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------ | ----------------- |
| `TrafficRoute` (replaced)   | `cityId`, `id` (string)                         | name, length                                                                   | backend           |
| `TrafficSegment` (replaced) | `cityId`, `routeId`, `id`                       | ordinal, length, coordinates                                                   | backend, once     |
| `TrafficRouteState`         | `cityId`, `routeId`                             | latest `observedAt`, `eventId`, times, delay, passable, both flags and streaks | backend           |
| `TrafficSegmentState`       | `cityId`, `routeId`, `segmentId`                | latest speeds, confidence, congestion level                                    | backend           |
| `TrafficSegmentHistory`     | `bucketStart`, `cityId`, `routeId`, `segmentId` | `sampleCount`, sums of current, average, typical and relative speed            | backend, backfill |
| `TrafficObservationReceipt` | `eventId`                                       | `receivedAt`                                                                   | backend           |
| `TrafficStatsRouteLink`     | `cityId`, `routeId`                             | `statsRouteId`                                                                 | WP6               |
| `TrafficForecastRun`        | `id`                                            | `generatedAt`, `slotStarts DateTime[]`, `tau`                                  | predictor         |
| `TrafficSegmentForecast`    | `runId`, `cityId`, `routeId`, `segmentId`       | `relativeSpeedPcts Int[]`, `speedsKmh Int[]`, aligned with `slotStarts`        | predictor         |

- The old route and segment tables are recreated; geometry returns with the first observation.
- `TrafficSnapshot` and the `TrafficRouteStatus` enum go. `traffic_history` and `traffic_route_history` stay as the backfill source. New tables use `@db.Timestamptz`, so local-time queries need no double conversion.
- History stores sums, not averages: adding to a sum is exact, and the average is `sum / sampleCount`.
- bd-nis adds the last three models in a PR on top.

## Tooling

- [x] A root `tsconfig.base.json` that every package but the frontend extends (`strict`, `moduleResolution: "bundler"`, `noEmit`); `pnpm typecheck` runs `pnpm -r typecheck`.
- [x] `vitest.config.mts`: `test.projects`, the frontend on jsdom, the other packages on node.
- [x] `.fallowrc.json`: zone patterns prefixed with `frontend/`, a `shared` zone (imports nothing), `database/**` in `db`, a `services` zone (`shared` and `db`), and let `ui`, `hooks` and `data` import `shared`. The frontend's old `shared` zone is renamed `utils`.
- [x] `eslint.config.mjs`: Next's configs and the relative-import ban apply to `frontend/**` only (`settings.next.rootDir`); add `@greenwave/database` to the restricted imports.
- [x] `.ls-lint.yml`: kebab-case for every package's `src/**`.
- [x] `CLAUDE.md` in two: the Next-specific rules move to `frontend/CLAUDE.md` beside `frontend/AGENTS.md`.

**Done when** M1's checks pass, and the architecture and MQTT-design sections have a draft.
