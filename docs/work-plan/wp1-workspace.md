# WP1 · Workspace, contracts and database

**Christian · Mon 2 – Fri 6 Nov.** Everything else builds on it. · [← Work plan](../WORK-PLAN.md)

## pnpm workspace

- [ ] `pnpm-workspace.yaml` gets `packages: ["packages/*", "services/*"]` beside `allowBuilds`.
- [ ] The Next.js app stays at the repo root and depends on `@greenwave/contracts` and `@greenwave/db` (`workspace:*`).
- [ ] In `.gitignore`, `/node_modules` becomes `node_modules` (pnpm creates one per package), and add `packages/db/src/generated`.

Packages are consumed as TypeScript source, so files inside `packages/*` use **relative imports**: an `@/` would resolve against the importer's tsconfig. Turbopack compiles workspace packages itself, so no `transpilePackages`.

## `packages/contracts` (_new_)

Merge by **Tue 3 Nov** so the others can build against it. Zod only, no `server-only`: the browser imports it.

| File             | Exports                                                                                                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `topics.ts`      | `observationTopic(city, route)`, `stateTopic(city, route)`, `statusTopic(city)`; wildcards `SHARED_OBSERVATIONS`, `ALL_STATES`, `ALL_STATUSES`                                               |
| `observation.ts` | `observationSchema` (as in `ARCHITECTURE.md`, with `source: "live" \| "fixture" \| "loadtest"`), `toEventId(cityId, routeId, observedAt)`                                                    |
| `state.ts`       | `stateSchema`: the observation plus `segments[].congestion`, `route.congestedSince`, `route.slowerThanUsualSince` (ISO string or `null`)                                                     |
| `status.ts`      | `adapterStatusSchema`: `{ status: "online" \| "offline", at }`                                                                                                                               |
| `congestion.ts`  | `classifyCongestion` (moved from `src/lib/traffic/serialization.ts`), `CONGESTED_LENGTH_SHARE = 0.2`, `SLOWER_THAN_USUAL_RATIO = 1.3`, `FLAG_SWITCH_READINGS = 3`, `STATE_TTL_SECONDS = 300` |

`source` exists because replayed fixtures are stamped "now"; without it they would land in the history prediction learns from.

- [ ] Test: `src/lib/traffic/fixtures/route-details.json` becomes a valid observation, every id still a string.

## `packages/db` (_new_)

- [ ] Move `prisma/` and `prisma.config.ts` into it; generate to `packages/db/src/generated/prisma`. `prisma.config.ts` loads the root `.env` (`dotenv.config({ path: "../../.env" })`).
- [ ] `src/index.ts` exports `createPrismaClient(url)` (the `PrismaPg` adapter, as today), `Prisma` and the model types.
- [ ] `src/lib/config/prisma.ts` keeps its `globalThis` singleton and calls `createPrismaClient(env.DATABASE_URL)`.
- [ ] Point the five importers of `@/generated/prisma` at `@greenwave/db`: `prisma/seed.ts`, `scripts/import-traffic-stats.ts`, `src/lib/config/prisma.ts`, `src/lib/devices/serialization.ts`, `src/lib/traffic-stats/serialization.ts`.
- [ ] Root `db:*` scripts forward with `pnpm --filter @greenwave/db exec prisma …`; `postinstall` generates the client.

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

- [ ] Root `tsconfig.json` excludes `packages` and `services`; each has its own (`strict`, `moduleResolution: "bundler"`, `noEmit`), and `pnpm typecheck` also runs `pnpm -r typecheck`.
- [ ] `vitest.config.mts`: `test.projects`, the app on jsdom, packages and services on node.
- [ ] `.fallowrc.json`: a `contracts` zone (imports nothing), `packages/db/**` in `db`, a `services` zone (contracts and db), and let `ui`, `hooks` and `data` import contracts. Every new file needs a zone, or boundary coverage fails.
- [ ] `eslint.config.mjs`: the relative-import ban applies to `src/**` only; add `@greenwave/db` to the restricted imports.
- [ ] `.ls-lint.yml`: kebab-case for `packages/*/src/**` and `services/*/src/**` too.

**Done when** M1's checks pass, and the architecture and MQTT-design sections have a draft.
