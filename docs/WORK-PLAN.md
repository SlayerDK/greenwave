# GreenWave work plan

How we build the architecture in [`ARCHITECTURE.md`](../ARCHITECTURE.md) by the hand-in on **Friday 4 December 2026**: who does what, when, and with which libraries. `ARCHITECTURE.md` says what we build and why. This file says how, and when.

> Written 2 November 2026. Tick your own checkboxes in your own PRs; Monday's planning starts from them.

At a glance:

- **Hand-in:** the report and a live demo, both on Fri 4 Dec, with a backup video.
- **Team:** Christian, Bjoern and bd-nis, each owning one slice of the system.
- **Five weeks:** skeleton (week 45), live pipeline (46), prediction (47), evaluation (48), report and demo (49).
- **History:** recorded from today through the proof of concept's Vercel cron at 15-minute resolution, and by the backend once the pipeline runs.

## Decisions

| Topic                | Decision                                                                                                         | Why                                                                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| History resolution   | 15-minute buckets, about 100,000 rows a day for Aarhus                                                           | All 24 Traffic Stats slots start and end on a quarter hour, so 15 minutes is the coarsest step that lines up with every one of them. Hourly is too coarse for the peaks |
| Recording until then | The proof of concept's Vercel cron, switched to 15-minute slots, from 2 Nov until after the hand-in              | The new pipeline records nothing before 16 Nov. The cron has never run on schedule, so Neon holds about one hour of history                                             |
| Prediction method    | A typical-speed profile plus today's deviation, which fades over the forecast horizon. TypeScript, no ML library | Explainable, works with a few weeks of data, and has two obvious baselines to beat                                                                                      |
| Forecasts on the map | A slider over every 15-minute slot from now until midnight, local time                                           | "The rest of today"                                                                                                                                                     |
| Route status         | Two flags: `congestedSince` and `slowerThanUsualSince`                                                           | The first matches the map's colours. The second says whether today is worse than usual                                                                                  |
| TomTom polling       | Every minute, as `ARCHITECTURE.md` says. Development uses recorded fixtures                                      | The key has no practical limit, but three laptops polling would triple the calls for nothing                                                                            |
| Checks               | No CI. The Husky hooks stay, and the reviewer runs the checks before approving                                   |                                                                                                                                                                         |
| Report               | Every work package ends with a 1–2 page draft of its report section                                              | Week 49 goes to results and editing, not first drafts                                                                                                                   |
| Vercel               | Frozen on 2 Nov, removed after the hand-in                                                                       | It's the only always-on recorder until then                                                                                                                             |

## Team

| Person        | Owns                                                                           | Also                                                                                       |
| ------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **Christian** | WP0 recorder, WP1 workspace, contracts and database, WP4 backend, WP8 clean-up | Reviews conventions, keeps `CLAUDE.md` and `ARCHITECTURE.md` current, runs the demo laptop |
| **Bjoern**    | WP2 Compose and broker, WP3 adapter, WP7 load and resilience tests             | Demo script and backup video                                                               |
| **bd-nis**    | WP5 live map, WP6 prediction                                                   | Weekly Neon export                                                                         |

The slices are vertical, so hand-offs happen in two places only: `packages/contracts` (message formats, topics and thresholds) and the database tables. Every PR gets one reviewer. A PR that changes `packages/contracts` or the Prisma schema needs both of the others.

## Schedule

| Week                                | Christian                                                                                                 | Bjoern                                                                                                          | bd-nis                                                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **45** · 2–6 Nov · Skeleton         | Mon: WP0. Mon–Tue: `packages/contracts`. Wed–Fri: workspace, `packages/db`, tooling, schema and migration | Mosquitto config, ACL, password init and healthchecks. Services image, `migrate` service, frontend `Dockerfile` | Traffic Stats curves, route links, backfill SQL, forecast models. Thu–Fri: the live hook, against hand-published state messages |
| **46** · 9–13 Nov · Live pipeline   | Backend, end to end                                                                                       | Adapter (Mon–Wed). Compose wiring for adapter, backend and frontend (Thu–Fri)                                   | First paint from Postgres, live hook, both route badges, offline and stale states                                               |
| **47** · 16–20 Nov · Prediction v1  | Integration fixes, clean-up part 1, row lock for several backends, `CLAUDE.md`                            | Load generator, `loadtest` profile, resilience tests                                                            | Weekly export. Predictor: profile, fallbacks, forecast until midnight, schedule                                                 |
| **48** · 23–27 Nov · Evaluate, show | Tune both route rules on recorded data, check `--scale backend=3`                                         | Load scenarios, CSVs and charts                                                                                 | Forecast slider on the map, backtest                                                                                            |
| **49** · 30 Nov–4 Dec · Hand-in     | Final `README.md`, `CLAUDE.md` and `ARCHITECTURE.md`. Demo laptop, backfilled again on Thu evening        | Demo script ready for Tuesday. Backup video on Wed 2 Dec                                                        | Final export, backfill and evaluation numbers on Mon 30 Nov                                                                     |
| After 4 Dec                         | Clean-up part 2                                                                                           |                                                                                                                 |                                                                                                                                 |

Milestones:

- **M1 · Fri 6 Nov · Skeleton.** `docker compose up` starts postgres, mosquitto and migrate, all healthy. `pnpm lint`, `typecheck`, `test` and `analyze` pass across the workspace. Contracts and the new schema are merged.
- **M2 · Mon 16 Nov · Live pipeline.** An integration day together: the adapter publishes real TomTom readings, the backend stores and republishes them, and the map in the browser updates every minute without a reload.
- **M3 · Fri 20 Nov · Prediction v1.** The predictor writes a forecast every 15 minutes, the load generator runs, and clean-up part 1 is merged.
- **M4 · Fri 27 Nov · Feature freeze.** Every work package below is done except clean-up part 2, and every report section has a draft.
- **Fri 4 Dec · Hand-in and live demo.**

Week 49, day by day:

| Day        | What                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------ |
| Mon 30 Nov | Planning; confirm the demo laptop. bd-nis: final Neon export, backfill, final evaluation numbers |
| Tue 1 Dec  | Demo rehearsal, all three                                                                        |
| Wed 2 Dec  | Fixes from the rehearsal. Bjoern records the backup video                                        |
| Thu 3 Dec  | The report is finished. Christian backfills the demo laptop in the evening                       |
| Fri 4 Dec  | Hand-in and live demo                                                                            |

Meetings: a 30-minute planning on Mondays, a 15-minute check-in on Thursdays.

## Work packages

Each package lists its steps, the files it touches (marked _new_ where they don't exist yet), how its parts connect, and when it's done. "Done" always includes a draft of the package's report section.

### WP0 · Restart the history recorder

**Christian · Mon 2 Nov.** WP6 depends on it.

The hourly cron has never run on schedule. `APP_URL` and `CRON_SECRET` were empty until 19 October, so all 57 scheduled runs failed, and the workflow was then disabled. Neon holds about one hour of history. Restart it at 15-minute resolution before anything restructures `main`.

- [ ] In `src/lib/traffic/history-service.ts`, key rows by the quarter hour instead of the hour (`setUTCMinutes(Math.floor(minutes / 15) * 15, 0, 0)`). Update `history-service.test.ts`.
- [ ] In `.github/workflows/traffic-history.yml`, set `cron: "7,22,37,52 * * * *"`.
- [ ] Push to `main` and let Vercel deploy production. Then run `gh workflow enable traffic-history.yml` and `gh workflow run traffic-history.yml`. The run should report about 1,079 rows `inserted`.
- [ ] Freeze Vercel by setting `"ignoreCommand": "exit 0"` in `vercel.json`. Vercel then skips every later build, so production keeps serving this recorder while `main` is rebuilt around it.
- [ ] Update the "hourly" wording in `CLAUDE.md`, the `TrafficHistory` comment in `prisma/schema.prisma`, and `README.md`.

Done when a scheduled run inserts rows, and the next push shows as a skipped build on Vercel.

### WP1 · Workspace, contracts and database

**Christian · Mon 2 – Fri 6 Nov.** Everything depends on it.

- [ ] **pnpm workspace.**
  - `pnpm-workspace.yaml` gets `packages: ["packages/*", "services/*"]` beside its `allowBuilds`.
  - The Next.js app stays at the repo root as the `greenwave` package, and depends on `"@greenwave/contracts": "workspace:*"` and `"@greenwave/db": "workspace:*"`.
  - In `.gitignore`, change `/node_modules` to `node_modules`, because pnpm creates one in every package, and add `packages/db/src/generated`.
- [ ] **`packages/contracts`** (_new_). Merge it by Tue 3 Nov, so the others can build against it. It uses only Zod and has no `server-only`, because the browser imports it.
  - `topics.ts`:
    - `observationTopic(city, route)`, `stateTopic(city, route)` and `statusTopic(city)`
    - the wildcards `SHARED_OBSERVATIONS` (`$share/backend/greenwave/v1/+/routes/+/observations`), `ALL_STATES` and `ALL_STATUSES`
  - `observation.ts`:
    - `observationSchema`, the message in `ARCHITECTURE.md`
    - `toEventId(cityId, routeId, observedAt)`
    - the message's `source` field: `"live"`, `"fixture"` or `"loadtest"`. Replayed fixtures are stamped "now", so without it they would end up in the history that prediction learns from
  - `state.ts`: `stateSchema`, the observation plus `segments[].congestion`, `route.congestedSince` and `route.slowerThanUsualSince` (ISO strings or `null`).
  - `status.ts`: `adapterStatusSchema`, shaped `{ status: "online" | "offline", at }`.
  - `congestion.ts`:
    - `classifyCongestion`, moved out of `src/lib/traffic/serialization.ts`; `src/app/(app)/history/_lib/slot-features.ts` imports it from here too
    - `CONGESTED_LENGTH_SHARE = 0.2`, `SLOWER_THAN_USUAL_RATIO = 1.3`, `FLAG_SWITCH_READINGS = 3` and `STATE_TTL_SECONDS = 300`
  - A test: `src/lib/traffic/fixtures/route-details.json` becomes an observation that `observationSchema` accepts, with every id still a string.
- [ ] **`packages/db`** (_new_).
  - Move `prisma/` and `prisma.config.ts` into it. The generator outputs to `packages/db/src/generated/prisma`.
  - `prisma.config.ts` loads the root `.env` (`dotenv.config({ path: "../../.env" })`).
  - `src/index.ts` exports `createPrismaClient(url)`, using the `PrismaPg` adapter as `src/lib/config/prisma.ts` does today, plus `Prisma` and the model types.
  - `src/lib/config/prisma.ts` keeps its `globalThis` singleton and calls `createPrismaClient(env.DATABASE_URL)`.
  - Point the five files that import `@/generated/prisma` at `@greenwave/db`: `prisma/seed.ts`, `scripts/import-traffic-stats.ts`, `src/lib/config/prisma.ts`, `src/lib/devices/serialization.ts` and `src/lib/traffic-stats/serialization.ts`.
  - The root `db:*` scripts forward to it (`pnpm --filter @greenwave/db exec prisma migrate dev`, and so on), and `postinstall` generates the client.
- [ ] **Schema**, in one migration. Fields stay camelCase like the existing models, and tables are `@@map`ped to snake_case:

  | Model                       | Key                                             | Holds                                                                                                                                    | Written by        |
  | --------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
  | `TrafficRoute` (replaced)   | `cityId`, `id` (string)                         | name, length                                                                                                                             | backend           |
  | `TrafficSegment` (replaced) | `cityId`, `routeId`, `id`                       | ordinal, length, coordinates                                                                                                             | backend, once     |
  | `TrafficRouteState`         | `cityId`, `routeId`                             | latest `observedAt` and `eventId`, travel and typical time, delay, passable, `congestedSince`, `slowerThanUsualSince`, a streak per flag | backend           |
  | `TrafficSegmentState`       | `cityId`, `routeId`, `segmentId`                | latest speeds, confidence, congestion level                                                                                              | backend           |
  | `TrafficSegmentHistory`     | `bucketStart`, `cityId`, `routeId`, `segmentId` | `sampleCount`, and the sums of current, average, typical and relative speed                                                              | backend, backfill |
  | `TrafficObservationReceipt` | `eventId`                                       | `receivedAt`                                                                                                                             | backend           |
  | `TrafficStatsRouteLink`     | `cityId`, `routeId`                             | `statsRouteId`                                                                                                                           | WP6               |
  | `TrafficForecastRun`        | `id`                                            | `generatedAt`, `slotStarts DateTime[]`, `tau`                                                                                            | predictor         |
  | `TrafficSegmentForecast`    | `runId`, `cityId`, `routeId`, `segmentId`       | `relativeSpeedPcts Int[]` and `speedsKmh Int[]`, aligned with the run's `slotStarts`                                                     | predictor         |
  - The old `TrafficRoute` and `TrafficSegment` are dropped and recreated; their geometry comes back with the first observation.
  - `TrafficSnapshot` and the `TrafficRouteStatus` enum go.
  - `traffic_history` stays as it is, as the backfill source.
  - The history holds sums rather than averages, because adding to a sum is exact; the average is `sum / sampleCount`.
  - bd-nis adds the last three models in a PR on top.

- [ ] **Tooling.**
  - The root `tsconfig.json` excludes `packages` and `services`. Each has its own `tsconfig.json` (`strict`, `moduleResolution: "bundler"`, `noEmit`), and `pnpm typecheck` also runs `pnpm -r typecheck`.
  - In `vitest.config.mts`, use `test.projects`: the app with jsdom, and `packages/*` and `services/*` with node.
  - In `.fallowrc.json`:
    - add a `contracts` zone (`packages/contracts/**`, which may import nothing)
    - add `packages/db/**` to `db`
    - add a `services` zone (`services/**`, which may import contracts and db)
    - let `ui`, `hooks` and `data` import contracts
    - fallow's boundary coverage fails on files that are in no zone, so every new file needs one
  - In `eslint.config.mjs`, apply the relative-import ban to `src/**` only, and add `@greenwave/db` to the restricted imports.
  - In `.ls-lint.yml`, enforce kebab-case for `packages/*/src/**` and `services/*/src/**` too.

Files inside `packages/*` use relative imports. The frontend and the services import the packages as TypeScript source, so an `@/` inside a package would be resolved against the importer's `tsconfig.json`. Turbopack compiles workspace packages by itself, so no `transpilePackages` is needed (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/transpilePackages.md`).

Done when M1's checks pass, and the architecture and MQTT-design sections have a draft.

### WP2 · Compose and the broker

**Bjoern · Mon 2 – Fri 6 Nov, wiring Thu 12 – Fri 13 Nov.**

- [ ] `infra/mosquitto/mosquitto.conf` (_new_): the config in `ARCHITECTURE.md`, plus:
  - `max_queued_messages 5000`; the default of 1,000 holds about 75 minutes of Aarhus readings for a restarting backend
  - `password_file /mosquitto/secrets/passwords`
- [ ] `infra/mosquitto/acl` (_new_): the rules in `ARCHITECTURE.md`, plus:
  - anonymous `topic read $SYS/broker/uptime`, for the healthcheck
  - a `loadgen` user that may write `greenwave/v1/+/routes/+/observations`
  - a `monitor` user that may read `$SYS/#`
- [ ] A `mosquitto-init` service: a one-shot container on the Mosquitto image.
  - It runs `mosquitto_passwd -c -b` for `adapter-aarhus`, `backend`, `loadgen` and `monitor`, with the passwords from `.env`.
  - It writes them into a `mosquitto-secrets` volume, then runs `chown mosquitto:mosquitto` and `chmod 0700`, because Mosquitto 2 complains about world-readable password files.
  - No password lands in git.
- [ ] `services/Dockerfile` (_new_): one Node 24 image for adapter, backend, predictor, loadgen and migrate.
  - It runs `pnpm install --frozen-lockfile` and generates the Prisma client.
  - Each service runs with tsx.
- [ ] The frontend `Dockerfile`:
  - copy `pnpm-workspace.yaml` and every workspace `package.json` before `pnpm install`
  - generate the Prisma client through the workspace filter, then `next build`
  - migrations move to the `migrate` service, so the container only runs `node server.js`
- [ ] `docker-compose.yml`: `mosquitto-init`, `mosquitto`, `migrate`, `adapter-aarhus`, `backend`, `predictor` and `frontend` beside `postgres`. Give no `container_name` to a service you want to scale.
- [ ] In `package.json`, make `db:up` and `db:down` start and stop only `postgres` and `mosquitto`, for development.
- [ ] Check with `mosquitto_sub` and `mosquitto_pub` from the host, and with an MQTT.js client over `ws://localhost:9001`.

```yaml
mosquitto:
  image: eclipse-mosquitto:2.1.2-alpine
  depends_on:
    mosquitto-init: { condition: service_completed_successfully }
  ports: ["1883:1883", "9001:9001"]
  volumes:
    - ./infra/mosquitto/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro
    - ./infra/mosquitto/acl:/mosquitto/config/acl:ro
    - mosquitto-secrets:/mosquitto/secrets
    - mosquitto-data:/mosquitto/data
  healthcheck:
    test:
      [
        "CMD",
        "mosquitto_sub",
        "-t",
        "$$SYS/broker/uptime",
        "-C",
        "1",
        "-W",
        "15",
      ]
    interval: 10s

migrate:
  build: { context: ., dockerfile: services/Dockerfile }
  command: pnpm --filter @greenwave/db exec prisma migrate deploy
  environment:
    DATABASE_URL: postgresql://greenwave:greenwave@postgres:5432/greenwave
  depends_on:
    postgres: { condition: service_healthy }

backend:
  build: { context: ., dockerfile: services/Dockerfile }
  command: pnpm --filter @greenwave/backend start
  env_file: .env
  environment: # overrides the localhost values in .env
    DATABASE_URL: postgresql://greenwave:greenwave@postgres:5432/greenwave
    MQTT_URL: mqtt://mosquitto:1883
  depends_on:
    mosquitto: { condition: service_healthy }
    migrate: { condition: service_completed_successfully }
  restart: unless-stopped
```

Done when `docker compose up` brings everything up healthy, and the broker and deployment sections have a draft.

### WP3 · Adapter

**Bjoern · Mon 9 – Wed 11 Nov.**

- [ ] `services/adapter/src/tomtom.ts` (_new_):
  - `fetchRouteDetails` and `readRoute`, moved from `src/lib/traffic/tomtom-service.ts`, and the TomTom schemas from `src/lib/traffic/schema.ts`
  - drop the Next-only `next: { revalidate, tags }` fetch option
  - keep `segmentIdStr` and the `date` header (`CLAUDE.md` explains both)
- [ ] `src/normalize.ts`:
  - TomTom details become an observation, using `toPositions` and `toRouteLabel`, which move along
  - validate it with `observationSchema.parse` before publishing, so a format drift fails here rather than in the backend
- [ ] `src/main.ts`:
  - validate the environment with Zod
  - poll at the start of every minute, and skip a poll while the previous one is still running
  - read the routes with `Promise.all`, publish every route that answered, and log the ones that failed
- [ ] Fixture mode:
  - `pnpm --filter @greenwave/adapter record-fixtures` saves one response per route (13 calls, once)
  - `ADAPTER_SOURCE=fixture` replays them with speeds jittered by ±10%, `observedAt` set to now, and `source: "fixture"`. Live readings carry `source: "live"`
- [ ] Tests: a fixture becomes an observation with string ids, `[longitude, latitude]` pairs and the `CW_AU_` prefix trimmed.

```ts
const client = await mqtt.connectAsync(env.MQTT_URL, {
  protocolVersion: 5,
  clientId: `adapter-${env.CITY_ID}`,
  username: env.MQTT_USERNAME,
  password: env.MQTT_PASSWORD,
  keepalive: 15, // the broker notices a dead adapter within about 22 s
  will: {
    topic: statusTopic(env.CITY_ID),
    payload: offline(),
    qos: 1,
    retain: true,
  },
});
await client.publishAsync(statusTopic(env.CITY_ID), online(), {
  qos: 1,
  retain: true,
});

// once per route per poll
await client.publishAsync(
  observationTopic(cityId, routeId),
  JSON.stringify(observation),
  { qos: 1 },
);
```

On SIGTERM, publish `offline` yourself and then call `endAsync()`: a clean disconnect doesn't fire the Last Will, so `docker compose stop` would otherwise leave the adapter showing online.

Environment:

- `CITY_ID=aarhus`
- `ROUTE_IDS`: today's `MONITORED_ROUTE_IDS`, comma-separated
- `POLL_INTERVAL_SECONDS=60`
- `ADAPTER_SOURCE`: `tomtom` or `fixture`
- `TOMTOM_API_KEY`, `MQTT_URL`, `MQTT_USERNAME` and `MQTT_PASSWORD`

Done when `mosquitto_sub` shows 13 observations a minute, killing the container turns the status `offline`, and the adapter section has a draft.

### WP4 · Backend

**Christian · Mon 9 – Fri 13 Nov; row lock Tue 17 – Wed 18 Nov.**

- [ ] `services/backend` (_new_): connect, subscribe, process, publish.
- [ ] Pure, unit-tested functions:
  - `routeIsCongested`: at least `CONGESTED_LENGTH_SHARE` of the route's length is moderate, heavy or closed
  - `routeIsSlowerThanUsual`: `travelTimeSec ≥ SLOWER_THAN_USUAL_RATIO × typicalTravelTimeSec`
  - `nextFlag(previous, on, observedAt)`, used for both flags: on after `FLAG_SWITCH_READINGS` readings in a row, off after as many
  - `isNewer`
- [ ] One transaction per observation, then the retained publish (below).
- [ ] Every 10 seconds, log the messages processed, the duplicates, and lag at p50 and p95 (lag = now − `observedAt`). WP7 uses these numbers.
- [ ] In week 47, `SELECT … FOR UPDATE` on the route-state row, so that `--scale backend=3` keeps the streaks correct.

```ts
const client = await mqtt.connectAsync(env.MQTT_URL, {
  protocolVersion: 5,
  clientId: `backend-${os.hostname()}`, // stable across restarts of one container
  clean: false,
  properties: { sessionExpiryInterval: 3600, receiveMaximum: 32 },
  username: "backend",
  password: env.MQTT_BACKEND_PASSWORD,
});

// MQTT.js sends the PUBACK when `done` is called, so ack only after the commit.
// One message at a time, which is also the backpressure.
client.handleMessage = (packet, done) => {
  processObservation(packet).then(
    () => done(),
    (error) => handleFailure(error, done),
  );
};

await client.subscribeAsync(SHARED_OBSERVATIONS, { qos: 1 });
```

`handleFailure` handles two cases:

- **Invalid JSON or schema.** Log it and call `done()`: it would fail the same way every time it came back.
- **A database error.** Log it and `process.exit(1)`. Compose restarts the backend, and the broker redelivers the unacked message from the persistent session.

The transaction:

1. Insert the receipt (`createMany` with `skipDuplicates`). No row means a duplicate: stop.
2. Upsert the route, and `createMany` its segments with `skipDuplicates`, so geometry is stored once.
3. Lock and read the route state.
4. If the reading is newer than the stored `observedAt`: classify every segment, update both flags, and write the route and segment state.
5. Unless the observation's `source` is `fixture`, add the reading to its 15-minute bucket, with one statement for all segments. A reading that arrives out of order still counts in its bucket; only the state has to be the newest.

```ts
await tx.$executeRaw`
  INSERT INTO traffic_segment_history ("bucketStart", "cityId", "routeId", "segmentId", "sampleCount", "currentSpeedSum", ...)
  SELECT ${bucketStart}, ${cityId}, ${routeId}, s.id, 1, s.current, ...
  FROM unnest(${segmentIds}::text[], ${currentSpeeds}::int[], ...) AS s(id, current, ...)
  ON CONFLICT ("bucketStart", "cityId", "routeId", "segmentId") DO UPDATE SET
    "sampleCount" = traffic_segment_history."sampleCount" + 1,
    "currentSpeedSum" = traffic_segment_history."currentSpeedSum" + EXCLUDED."currentSpeedSum", ...`;
```

After the commit, if the state changed:

```ts
await client.publishAsync(stateTopic(cityId, routeId), JSON.stringify(state), {
  qos: 1,
  retain: true,
  properties: { messageExpiryInterval: 300 },
});
```

A crash between the commit and the publish loses that one publish. The redelivered message is a duplicate and isn't republished, but the next minute's reading republishes the state.

Done when restarting the backend while the adapter runs loses and doubles nothing (as many receipts as messages published), and the backend section has a draft.

### WP5 · Live map

**bd-nis · Thu 5 – Fri 13 Nov; forecast slider Mon 23 – Thu 26 Nov.**

- [ ] `src/lib/traffic/queries.ts` (_new_): the latest network for a city. One Prisma query with `include` reads routes, segments with geometry, route state and segment state.
- [ ] `src/lib/traffic/serialization.ts`:
  - build today's `NetworkTraffic` shape from those rows, so `TrafficMap`, `RouteSummaryList` and `SegmentPopup` keep working
  - the congestion level comes from the stored state
  - `summary` gains `observedAt`, `congestedSince` and `slowerThanUsualSince`
  - add `toRouteTraffic(state)`, the same conversion for a state message
- [ ] `src/lib/traffic/data-access.ts`: `getNetworkTraffic()` reads Postgres instead of TomTom, still behind `requireAuth()`.
- [ ] Add `MQTT_WS_URL` to `src/lib/config/env.ts`. `src/app/(app)/map/page.tsx` reads it and passes it down like the Mapbox token. It's a server-side variable, not `NEXT_PUBLIC_`, so the Docker image is built once and configured when it starts.
- [ ] `src/hooks/traffic/use-live-traffic.ts` (_new_) replaces `useNetworkTraffic` in `traffic-map-panel.tsx`:

```ts
const query = useQuery({
  queryKey: TRAFFIC_QUERY_KEY,
  queryFn: skipToken,
  initialData,
});

useEffect(() => {
  let client: MqttClient | undefined;
  void import("mqtt").then(({ default: mqtt }) => {
    client = mqtt.connect(mqttUrl, {
      protocolVersion: 5,
      reconnectPeriod: 5_000,
    });
    client.subscribe([ALL_STATES, ALL_STATUSES], { qos: 0 });
    client.on("message", (topic, payload) => {
      // stateSchema.safeParse(JSON.parse(payload.toString())), then:
      // queryClient.setQueryData(TRAFFIC_QUERY_KEY, (old) => applyRouteState(old, toRouteTraffic(state)))
    });
  });
  return () => void client?.end();
}, [mqttUrl, queryClient]);
```

- The TanStack query stays the store. `skipToken` means it never fetches, and the first paint is the RSC's data.
- `applyRouteState` is pure and unit-tested. It replaces a route only when the message's `observedAt` is newer.
- Browsers subscribe at QoS 0. A missed update is replaced a minute later, a reconnect gets the retained state again, and the broker doesn't wait for every viewer's ack.
- Importing MQTT.js inside the effect keeps it out of the server render and the first bundle.
- [ ] The route list gets two badges: "Congested since 07:42" and "Slower than usual since 07:50".
- [ ] A banner shows while an adapter is offline.
- [ ] Routes whose `observedAt` is older than `STATE_TTL_SECONDS` are drawn grey, as "no data". The check runs on a 30-second tick, so a stale first paint from Postgres turns grey too.
- [ ] The forecast slider, in week 48:
  - `getLatestForecast()` lives in a new `src/lib/forecasts/` domain (`queries.ts`, `data-access.ts`, `serialization.ts`), read by the map page.
  - The slider runs from "Now" through every remaining 15-minute slot until midnight.
  - On a forecast slot, segments are recoloured with `classifyCongestion` on the predicted relative speed.
  - The popup shows the predicted km/h, and a label says when the forecast was made.
  - The payload is `slotStarts` plus, per segment, integer arrays aligned with it: about 1,100 segments × at most 95 slots. That's the same pattern `/history` already uses.

Done when:

- the map updates every minute without a reload
- it turns grey when the pipeline stops
- the slider recolours it
- the frontend section has a draft

### WP6 · Prediction

**bd-nis · data Mon 2 – Wed 4 Nov, job Mon 16 – Fri 20 Nov, evaluation Mon 23 – Fri 27 Nov.**

Data, in week 45 and then every Monday:

- [ ] Import Neon's history into the local database. Christian shares the Neon URL. The local `traffic_history` is only a staging copy, so empty it first:

  ```bash
  psql "$LOCAL_URL" -c 'TRUNCATE traffic_history'
  pg_dump --data-only --table=traffic_history "$NEON_URL" | psql "$LOCAL_URL"
  psql "$LOCAL_URL" -f scripts/backfill-history.sql
  ```

  `scripts/backfill-history.sql` (_new_) copies the rows into `traffic_segment_history` as buckets with `"sampleCount" = 1` and `ON CONFLICT DO NOTHING`. Once Neon's usage passes 80% of its quota, delete exported rows older than 7 days there.

- [ ] Fill `TrafficStatsRouteLink`:
  - a short script matches each of the 13 live route names to one of the 20 Traffic Stats `routeName`s
  - check the matches by hand
- [ ] Look at the data: each route's Traffic Stats weekday curve now, and our own curve per weekday as it builds up.
- [ ] Add the forecast models (`TrafficForecastRun`, `TrafficSegmentForecast`) in a PR on top of WP1's schema.

The job, `services/predictor` (_new_), in week 47:

- [ ] Run every 15 minutes with croner, just after a bucket closes: `new Cron("2,17,32,47 * * * *", () => runForecast(new Date()))`.
- [ ] **Profile** P(segment, day type, slot):
  - The day type is weekday or weekend.
  - The slot is the local 15-minute slot in Europe/Copenhagen time: `AT TIME ZONE 'Europe/Copenhagen'` in SQL, `Intl.DateTimeFormat` in TypeScript.
  - Average the daily bucket means rather than the raw samples: take `sum / sampleCount` per bucket, then the mean over days. A bucket the pipeline recorded holds about 15 samples and one from the Vercel recorder holds 1, and each day should count once.
- [ ] **Fallbacks**, for a cell with fewer than 3 days of data:
  1. the same slot, pooled across both day types
  2. between 06:00 and 18:00, the segment's mean, scaled by the weekday shape of its linked Traffic Stats route (each slot's median travel time against the route's mean)
  3. otherwise, the segment's mean
- [ ] **Forecast** for every remaining slot today, where h is the minutes ahead:

  F(target) = P(target) + (current − P(now)) · e^(−h/τ)

  - Compute it for relative speed, which the colours use, and for km/h, which the popup shows.
  - Clamp it between 0 and the highest speed observed.

- [ ] Write each run in one transaction, and delete runs older than 24 hours.
- [ ] Tests:
  - the formula
  - the slot and day-type helpers, including across a DST change
  - the order of the fallbacks

The evaluation, in week 48:

- [ ] `pnpm --filter @greenwave/predictor backtest --days 7`:
  - For every bucket of the last 7 days, forecast from the history before that day and compare with what happened.
  - Report MAE in km/h, and the share of segments in the right congestion level.
  - Use the horizons +15 min, +30 min, +1 h, +2 h, +4 h and the rest of the day.
  - Compare three methods: persistence (F = current), profile only (F = P), and ours with τ ∈ {15, 30, 60, 120} minutes. Pick τ from the results.
  - Write the results as CSV under `docs/report/`.

Done when:

- forecasts arrive every 15 minutes
- the backtest beats both baselines at some horizon, or the report explains why not
- the prediction and evaluation sections have drafts

### WP7 · Load and resilience tests

**Bjoern · Mon 16 – Fri 27 Nov.**

- [ ] `services/loadgen` (_new_), using MQTT.js as user `loadgen`:
  - publishes copies of a fixture observation for synthetic cities `load-01` to `load-NN`
  - gives each copy a fresh `eventId`, `observedAt` = now and `source: "loadtest"`. The backend still writes their history, so the test measures the full write path
  - sends `RATE` messages a second for `DURATION`
- [ ] A `loadtest` Compose profile, run as its own Compose project so its data lands in separate volumes:

  ```bash
  docker compose -p greenwave-loadtest --profile loadtest up --scale backend=3
  ```

- [ ] Measure, each to CSV:
  - messages sent per second (loadgen)
  - messages processed and lag (the backend's metrics log)
  - database commits per second (`xact_commit` from `pg_stat_database`, sampled every 10 seconds)
  - broker load (`$SYS/broker/load/messages/received/1min`, as `monitor`)
- [ ] Scenarios:
  1. Aarhus as it is: 13 messages a minute.
  2. A ramp with one backend: 10, 25, 50, 100, then 200 messages a second, until the lag keeps growing.
  3. The same ramp with `--scale backend=3`, on the shared subscription.
  4. A backend restart under load: as many receipts in Postgres as messages published, and no bucket counted twice.
- [ ] The checks from Presentation 2, which also feature in the demo:
  - `mosquitto_sub -v -t 'greenwave/v1/#' -u backend -P …` shows every message. Anonymous clients see only state and status.
  - `docker compose kill adapter-aarhus`: the status turns `offline` within about 20 seconds, and the map shows its banner.
  - `docker compose restart backend`: nothing is lost or doubled.
  - Stop the adapter and the backend for 5 minutes: the retained state expires, and a newly opened map shows no live state.

Done when the CSVs and two or three charts exist, and the scalability and load-test sections have drafts.

### WP8 · Clean up the proof of concept

**Christian · part 1 Tue 17 – Fri 20 Nov; part 2 after 4 Dec.**

Part 1, once the live map works:

- [ ] Remove:
  - `src/lib/traffic/tomtom-service.ts`, which now lives in the adapter
  - `src/app/api/traffic/` and its test
  - `refresh-traffic-button.tsx` and `record-snapshot-button.tsx`
  - `recordRouteSnapshotsAction` from `actions.ts`
  - `src/hooks/traffic/use-traffic.ts`: `useNetworkTraffic` was replaced by `use-live-traffic.ts`, and `useRecordNetworkSnapshot` goes
  - `trafficMutations`
  - `history-service.ts` and `src/app/api/cron/traffic-history/`
  - the `api/cron` exclusion in `src/proxy.ts`, and its test
  - `TOMTOM_API_KEY` and `CRON_SECRET` from `src/lib/config/env.ts` and `.env.example`
- [ ] Rewrite the traffic sections of `CLAUDE.md` for the new design, including the hooks rule: the live hook writes into the query cache from MQTT.

The frozen Vercel deployment keeps its own copy of the cron route, so the recording continues.

Part 2, after the hand-in:

- [ ] Remove `.github/workflows/traffic-history.yml`, `vercel.json`, the `build-vercel` script, and the Vercel section of `README.md`.
- [ ] Disconnect the Vercel project, after a last Neon export if one is still wanted.

Part 1 is done when the app makes no TomTom call any more.

### WP9 · Report and demo

**Everyone · drafts as each package lands, then week 49.**

| Section                                          | Owner     | Draft by   |
| ------------------------------------------------ | --------- | ---------- |
| Architecture and MQTT design                     | Christian | Fri 6 Nov  |
| The pivot: from traffic lights to real-time data | Christian | Fri 13 Nov |
| Broker, deployment and adapter                   | Bjoern    | Fri 13 Nov |
| Backend                                          | Christian | Fri 20 Nov |
| Frontend                                         | bd-nis    | Fri 20 Nov |
| Prediction method                                | bd-nis    | Fri 20 Nov |
| Scalability and load test                        | Bjoern    | Fri 27 Nov |
| Evaluation                                       | bd-nis    | Mon 30 Nov |
| Discussion and conclusion                        | everyone  | Thu 3 Dec  |

- Credit Asbjørn (Aarhus Kommune), and give the contact email.
- Explain the Vercel recorder as a temporary data collector that is still running at hand-in, and why (WP0).
- Reuse the diagrams in `docs/architecture/`.

The demo runs live on Christian's laptop on Fri 4 Dec, unless the 30 Nov meeting moves it:

1. `docker compose up`: the map shows all 13 routes at once, from the retained state.
2. `mosquitto_sub`: observations come in, state goes out.
3. A route changes colour live, and the slider shows the afternoon peak coming.
4. Kill the adapter and the map shows it offline. Restart the backend and nothing is lost.
5. The load-test charts and the backtest table.

If something fails on the day, there's the backup video from Wed 2 Dec. If TomTom can't be reached, `ADAPTER_SOURCE=fixture` keeps the pipeline running, though Mapbox tiles still need the internet.

## Libraries and tools

| What                                                | Version | Where to get it                                                                                                               | How we get it                                                              | Used by                                       |
| --------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------- |
| MQTT.js (`mqtt`)                                    | 5.16    | [npm](https://www.npmjs.com/package/mqtt), [docs](https://github.com/mqttjs/MQTT.js)                                          | `pnpm add mqtt --filter <package>`, and at the root for the app            | adapter, backend, loadgen, frontend           |
| Eclipse Mosquitto                                   | 2.1.2   | [Docker Hub](https://hub.docker.com/_/eclipse-mosquitto), [config reference](https://mosquitto.org/man/mosquitto-conf-5.html) | image `eclipse-mosquitto:2.1.2-alpine`                                     | broker                                        |
| PostgreSQL                                          | 18      | [Docker Hub](https://hub.docker.com/_/postgres)                                                                               | image `postgres:18-alpine`, in use                                         | everything                                    |
| Prisma, `@prisma/adapter-pg`, `pg`                  | 7.10.x  | [docs](https://www.prisma.io/docs)                                                                                            | in use; moves to `packages/db`. npm's `latest` is an 8.0 RC, so pin 7.10   | `packages/db`                                 |
| Zod                                                 | 4.6     | [npm](https://www.npmjs.com/package/zod)                                                                                      | in use; `pnpm add zod --filter @greenwave/contracts`                       | contracts, every service's settings           |
| pino                                                | 10.4    | [getpino.io](https://getpino.io)                                                                                              | `pnpm add pino --filter <service>`; `pino-pretty` for reading logs locally | services                                      |
| croner                                              | 11      | [GitHub](https://github.com/Hexagon/croner)                                                                                   | `pnpm add croner --filter @greenwave/predictor`                            | predictor                                     |
| tsx                                                 | 4.23    | [tsx.is](https://tsx.is)                                                                                                      | in use; `pnpm add -D tsx --filter <service>`                               | runs the services, `tsx watch` in development |
| Vitest                                              | 4.1     | [projects guide](https://vitest.dev/guide/projects)                                                                           | in use                                                                     | tests                                         |
| Next.js 16, Mapbox GL, react-map-gl, TanStack Query | in use  | local docs in `node_modules/next/dist/docs/`; read them before changing Next code (`AGENTS.md`)                               | in use                                                                     | frontend                                      |
| Docker Desktop                                      | current | [docker.com](https://www.docker.com/products/docker-desktop/)                                                                 | install                                                                    | everyone                                      |
| MQTTX (optional)                                    | current | [mqttx.app](https://mqttx.app)                                                                                                | install                                                                    | poking at the broker by hand                  |

The MQTT 5 specification covers shared subscriptions (§4.8.2), message expiry and session expiry: [docs.oasis-open.org](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html).

## How the parts connect

### Topics

| Topic                                               | Publisher                  | Subscribers                         | QoS                             | Flags                         |
| --------------------------------------------------- | -------------------------- | ----------------------------------- | ------------------------------- | ----------------------------- |
| `greenwave/v1/{city}/routes/{routeId}/observations` | adapter                    | backend, through `$share/backend/…` | 1                               | not retained                  |
| `greenwave/v1/{city}/routes/{routeId}/state`        | backend                    | browsers                            | published at 1, browsers take 0 | retained, expires after 300 s |
| `greenwave/v1/{city}/adapter/status`                | adapter, and its Last Will | browsers                            | 1                               | retained                      |

### MQTT users

| User                              | May                                          | Password                |
| --------------------------------- | -------------------------------------------- | ----------------------- |
| anonymous (browsers, healthcheck) | read state, status and `$SYS/broker/uptime`  | none                    |
| `adapter-aarhus`                  | write `greenwave/v1/aarhus/#`                | `MQTT_ADAPTER_PASSWORD` |
| `backend`                         | read and write `greenwave/v1/#`              | `MQTT_BACKEND_PASSWORD` |
| `loadgen`                         | write `greenwave/v1/+/routes/+/observations` | `MQTT_LOADGEN_PASSWORD` |
| `monitor`                         | read `$SYS/#`                                | `MQTT_MONITOR_PASSWORD` |

### Ports

The frontend is on 3000, Postgres on 5432, MQTT on 1883 and MQTT over WebSocket on 9001. Inside Compose, services reach each other by name (`postgres:5432`, `mqtt://mosquitto:1883`). The browser runs on the host and uses `ws://localhost:9001`.

### Environment

| Variable                                                          | Used by                                    | Value                                                                                                       |
| ----------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                    | frontend, backend, predictor, migrate      | `postgresql://greenwave:greenwave@postgres:5432/greenwave` in Compose; `localhost` in `.env` for `pnpm dev` |
| `MQTT_URL`                                                        | adapter, backend, loadgen                  | `mqtt://mosquitto:1883`                                                                                     |
| `MQTT_WS_URL`                                                     | frontend, handed to the browser            | `ws://localhost:9001`                                                                                       |
| `MQTT_ADAPTER_PASSWORD` and the other `MQTT_*_PASSWORD`s          | `mosquitto-init`, and the matching service | random strings in `.env`                                                                                    |
| `CITY_ID`, `ROUTE_IDS`, `POLL_INTERVAL_SECONDS`, `ADAPTER_SOURCE` | adapter                                    | `aarhus`, the 13 ids, `60`, and `fixture` in development                                                    |
| `TOMTOM_API_KEY`                                                  | adapter, and the frozen Vercel app         | only where the live adapter runs (integration day, the demo laptop) or fixtures are recorded                |
| `MAPBOX_PUBLIC_TOKEN`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`    | frontend                                   | as today                                                                                                    |
| `CRON_SECRET`                                                     | the frozen Vercel app only                 | leaves the app's env in WP8                                                                                 |

`.env.example` lists them all.

### Startup order

1. `postgres` becomes healthy, then `migrate` runs and exits.
2. `mosquitto-init` writes the passwords and exits, then `mosquitto` becomes healthy.
3. `adapter-aarhus`, `backend`, `predictor` and `frontend` start.

In development, `pnpm db:up` starts postgres and mosquitto. Each service then runs with `pnpm --filter @greenwave/<name> dev` (`tsx watch`), and the app with `pnpm dev`.

## Tests

- Unit tests with Vitest sit next to the code in every package:
  - contracts: the schemas against the fixtures
  - adapter: normalizing
  - backend: classification, both flags, newer-only
  - frontend: the merge
  - predictor: the formula, the slots and the fallbacks
- The existing tests keep passing. Tests of removed code go with the code (WP8).
- The pipeline checks in WP7 run at M2, and again before the rehearsal.

## Risks

| Risk                                                      | What we do                                                                                |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Too little history for prediction                         | Recording starts 2 Nov (WP0), backfilled weekly, with Traffic Stats as a fallback         |
| Neon fills up: about 12 MB a day, roughly 400 MB by 4 Dec | Export weekly, and prune exported rows once usage passes 80%                              |
| GitHub delays or drops scheduled runs                     | Accept the gaps; a profile cell needs only 3 days                                         |
| The workspace move breaks tooling or the Vercel build     | It goes first, in one PR, after the freeze                                                |
| Integration slips                                         | Contracts are merged by 3 Nov, and the integration day is fixed on 16 Nov                 |
| No buffer before the hand-in                              | Drafts as we go, a feature freeze on 27 Nov, and the report finished on Thu 3 Dec         |
| The live demo fails                                       | Fixture mode, and the backup video                                                        |
| Someone is ill or blocked                                 | Every package has a reviewer who knows it, and packages meet only at contracts and tables |

## Ways of working

- One branch per package (`wp4-backend`), merged into `main` by PR. Several small PRs beat one big one.
- There's no CI. The Husky hooks run `lint-staged`, `ls-lint` and `fallow audit`, and the reviewer runs `pnpm lint && pnpm typecheck && pnpm test --run && pnpm analyze` before approving.
- `packages/contracts` and the Prisma schema change only through a PR that both others review.
- Prerequisites:
  - Docker Desktop
  - Node 24 LTS, whose corepack provides the pinned pnpm 12.6; newer Node releases no longer bundle corepack, so install pnpm 12.6 directly there
  - your own Mapbox token
  - the TomTom key only where the live adapter runs or fixtures are recorded; use fixtures otherwise
