# 04 · Backend: `backend`

**Compose service `backend`, package `@greenwave/backend` in `backend/`.** [WP4](../work-plan/wp4-backend.md) · Christian · 9–13 Nov, row lock 17–18 Nov · Needs [00](00-foundation.md), [01](01-broker.md), [02](02-migrate.md) · Unblocks [05](05-frontend.md) live data, [06](06-predictor.md)'s job, [07](07-loadgen.md). · [← Plans](README.md)

## Goal

The only writer of traffic data. For every observation on the shared subscription: validate it, drop duplicates, classify every segment, keep the two route flags, write geometry, state and the 15-minute history in one transaction, acknowledge the message only after the commit, and publish the route's state retained. It must survive restarts and `--scale backend=3` without losing or double-counting a reading.

## Read first

- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) → _MQTT design_ (the state message), _Backend_, _Shared subscriptions_.
- [00 · Foundation](00-foundation.md) → the contracts and **every model under "The schema"**: this plan is the only writer of all of them.
- `frontend/src/lib/traffic/history-service.ts` (`toQuarterHourSlot`) and `frontend/src/lib/traffic/mutations.ts` (`recordHistory`): the same bucket idea and `createMany` style.
- [MQTT 5 §4.8.2](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html) on shared subscriptions; MQTT.js's `handleMessage`.

## Interfaces

| Direction | What                                                                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| In        | `$share/backend/greenwave/v1/+/routes/+/observations` (`SHARED_OBSERVATIONS`), QoS 1                                                                 |
| Out       | `greenwave/v1/{city}/routes/{routeId}/state`: QoS 1, retained, `messageExpiryInterval: STATE_TTL_SECONDS`, `stateSchema`                             |
| Out       | Rows in `traffic_observation_receipt`, `traffic_route`, `traffic_segment`, `traffic_route_state`, `traffic_segment_state`, `traffic_segment_history` |
| Out       | The metrics log line (below), read by [07](07-loadgen.md)                                                                                            |

| Variable                | Value                                            |
| ----------------------- | ------------------------------------------------ |
| `DATABASE_URL`          | `postgres:5432` in Compose                       |
| `MQTT_URL`              | `mqtt://mosquitto:1883` in Compose               |
| `MQTT_BACKEND_PASSWORD` | the `backend` user's password                    |
| `BACKEND_CLIENT_ID`     | optional; defaults to `backend-${os.hostname()}` |

## Files

```
backend/
  Dockerfile  package.json  tsconfig.json
  src/
    env.ts
    rules.ts                  pure: classification, flags, ordering, buckets
    state-message.ts          pure: observation + derived fields → RouteState
    process-observation.ts    the transaction
    metrics.ts                counters and the 10 s log line
    mqtt.ts                   connect, subscribe, handleMessage, publish
    main.ts
    rules.test.ts  state-message.test.ts  process-observation.test.ts
```

`package.json` as in [03](03-adapter.md), named `@greenwave/backend`, with `@greenwave/database` added to the dependencies.

## Steps

### 1 · Pure rules (`rules.ts`), first and fully tested

```ts
export const classifySegments = (segments: ObservationSegment[]) =>
  segments.map((segment) => ({
    ...segment,
    congestion: classifyCongestion({ currentSpeed: segment.currentSpeedKmh, relativeSpeed: segment.relativeSpeedPct }),
  }));

/** ≥ CONGESTED_LENGTH_SHARE of the route's length is moderate, heavy or closed. Weighted by length, not count. */
export const routeIsCongested = (segments: { lengthM: number; congestion: CongestionLevel }[]) => { … };

/** travelTimeSec ≥ SLOWER_THAN_USUAL_RATIO × typicalTravelTimeSec. False when the typical time is 0. */
export const routeIsSlowerThanUsual = (route: { travelTimeSec: number; typicalTravelTimeSec: number }) => { … };

export type Flag = { since: Date | null; pendingSince: Date | null; streak: number };

/**
 * A reading that agrees with the flag resets the streak. One that disagrees
 * extends it; at FLAG_SWITCH_READINGS the flag switches. Switching on sets
 * `since` to the first reading of the run, so the map says when it started,
 * not when we became sure.
 */
export const nextFlag = (flag: Flag, on: boolean, observedAt: Date): Flag => { … };

export const isNewer = (observedAt: Date, stored: Date | undefined) => !stored || observedAt > stored;

/** UTC quarter hour of observedAt; same arithmetic as toQuarterHourSlot in history-service.ts. */
export const toBucketStart = (observedAt: Date) => { … };
```

- [ ] `nextFlag` cases to cover: off + 1 or 2 congested readings stays off; the 3rd switches on with `since` = the 1st reading's time; on + 2 clear + 1 congested stays on and resets the streak; on + 3 clear switches off with `since: null`; alternating readings never switch.

### 2 · State message (`state-message.ts`)

- [ ] `toRouteState(observation, classified, congestedFlag, slowerFlag): RouteState`: the observation with `segments` replaced by `classified`, plus `route.congestedSince` and `route.slowerThanUsualSince` as ISO strings or `null`. Run it through `stateSchema.parse` in tests, not at runtime.

### 3 · The transaction (`process-observation.ts`)

One interactive transaction per message: `prisma.$transaction(async (tx) => …)`. It returns the state to publish, or `null`.

1. **Receipt.** `tx.trafficObservationReceipt.createMany({ data: [{ eventId }], skipDuplicates: true })`. A count of 0 is a duplicate: count it and return `null`.
2. **Route.** Upsert `traffic_route` (name, `lengthM`).
3. **Lock.** `SELECT 1 FROM traffic_route WHERE "cityId" = $1 AND id = $2 FOR UPDATE`. The route row exists after step 2, which is why the lock is on it and not on `traffic_route_state` (absent on a route's first reading). Concurrent copies processing the same route now queue here, which keeps the streaks correct under `--scale backend=3`. Week 47 per the work plan, but it costs one line; add it from the start.
4. **Geometry.** `tx.trafficSegment.createMany({ data, skipDuplicates: true })` with `ordinal` = the index in the message. Geometry is stored once.
5. **State.** Read `traffic_route_state`. If `isNewer(observedAt, state?.observedAt)`:
   - classify the segments; compute both flags with `nextFlag` from the stored flags (or `{ since: null, pendingSince: null, streak: 0 }`);
   - upsert `traffic_route_state` with the reading and both flags' three fields;
   - write every `traffic_segment_state` row in **one** statement, not 165 upserts:

     ```ts
     await tx.$executeRaw`
       INSERT INTO traffic_segment_state ("cityId", "routeId", "segmentId", "observedAt", "currentSpeedKmh",
         "averageSpeedKmh", "typicalSpeedKmh", "relativeSpeedPct", "confidencePct", congestion)
       SELECT ${cityId}, ${routeId}, s.id, ${observedAt}, s.cur, s.avg, s.typ, s.rel, s.conf, s.lvl::traffic_congestion
       FROM unnest(${ids}::text[], ${cur}::int[], ${avg}::int[], ${typ}::int[], ${rel}::int[], ${conf}::int[], ${lvl}::text[])
         AS s(id, cur, avg, typ, rel, conf, lvl)
       ON CONFLICT ("cityId", "routeId", "segmentId") DO UPDATE SET
         "observedAt" = EXCLUDED."observedAt", "currentSpeedKmh" = EXCLUDED."currentSpeedKmh",
         "averageSpeedKmh" = EXCLUDED."averageSpeedKmh", "typicalSpeedKmh" = EXCLUDED."typicalSpeedKmh",
         "relativeSpeedPct" = EXCLUDED."relativeSpeedPct", "confidencePct" = EXCLUDED."confidencePct",
         congestion = EXCLUDED.congestion`;
     ```

   - build the state message.

   Otherwise (an older reading arriving late) leave state alone and publish nothing.

6. **History,** unless `source` is `fixture`. Out-of-order readings still count; only the state must be newest. `loadtest` readings are written, so the load test covers the whole write path.

   ```ts
   await tx.$executeRaw`
     INSERT INTO traffic_segment_history ("bucketStart", "cityId", "routeId", "segmentId", "sampleCount",
       "currentSpeedSum", "averageSpeedSum", "typicalSpeedSum", "relativeSpeedSum")
     SELECT ${toBucketStart(observedAt)}, ${cityId}, ${routeId}, s.id, 1, s.cur, s.avg, s.typ, s.rel
     FROM unnest(${ids}::text[], ${cur}::int[], ${avg}::int[], ${typ}::int[], ${rel}::int[]) AS s(id, cur, avg, typ, rel)
     ON CONFLICT ("bucketStart", "cityId", "routeId", "segmentId") DO UPDATE SET
       "sampleCount" = traffic_segment_history."sampleCount" + 1,
       "currentSpeedSum" = traffic_segment_history."currentSpeedSum" + EXCLUDED."currentSpeedSum",
       "averageSpeedSum" = traffic_segment_history."averageSpeedSum" + EXCLUDED."averageSpeedSum",
       "typicalSpeedSum" = traffic_segment_history."typicalSpeedSum" + EXCLUDED."typicalSpeedSum",
       "relativeSpeedSum" = traffic_segment_history."relativeSpeedSum" + EXCLUDED."relativeSpeedSum"`;
   ```

The congestion level goes in as `text` and is cast in SQL, which bypasses the Prisma-enum drift guard. Keep the guard by typing the `lvl` array through the generated enum: `const lvl: TrafficCongestion[] = classified.map((s) => s.congestion)`.

### 4 · MQTT (`mqtt.ts`, `main.ts`)

```ts
const client = await mqtt.connectAsync(env.MQTT_URL, {
  protocolVersion: 5,
  clientId: env.BACKEND_CLIENT_ID ?? `backend-${os.hostname()}`, // stable across restarts of one container
  clean: false,
  properties: { sessionExpiryInterval: 3600, receiveMaximum: 32 },
  username: "backend",
  password: env.MQTT_BACKEND_PASSWORD,
});

// MQTT.js sends the PUBACK when `done` is called, so ack only after the commit.
// One message at a time, which is also the backpressure.
client.handleMessage = (packet, done) => {
  processMessage(packet).then(
    () => done(),
    (error) => handleFailure(error, done),
  );
};

await client.subscribeAsync(SHARED_OBSERVATIONS, { qos: 1 });
```

- [ ] `processMessage`: `JSON.parse` → `observationSchema.safeParse` → `processObservation` → if it returned a state, `publishAsync(stateTopic(cityId, routeId), JSON.stringify(state), { qos: 1, retain: true, properties: { messageExpiryInterval: STATE_TTL_SECONDS } })`.
- [ ] `handleFailure`: invalid JSON or schema → log with the topic and the first issue, count it, and call `done()`; it would fail again every time. Anything else (the database) → log and `process.exit(1)`. Compose restarts the container and the broker redelivers the unacknowledged message from the persistent session.
- [ ] A crash between commit and publish loses that one publish. The next minute's reading republishes; accept it.
- [ ] `SIGTERM`: stop taking messages, wait for the one in flight, `endAsync()`, `prisma.$disconnect()`.
- [ ] Log every message at `debug` with its `eventId`, so a reading can be traced through adapter, backend and browser.

### Metrics

- [ ] `metrics.ts`: every 10 s, one pino line at `info`, then reset the counters. **This exact shape is [07](07-loadgen.md)'s input**; change it only together with that plan.

  ```json
  {
    "msg": "metrics",
    "windowS": 10,
    "processed": 13,
    "duplicates": 0,
    "invalid": 0,
    "published": 13,
    "lagP50Ms": 410,
    "lagP95Ms": 890
  }
  ```

  Lag is `now − observedAt` at commit, for processed (not duplicate) messages. Fixture readings are stamped "now", so their lag is the pipeline's own; live readings add TomTom's age.

### 5 · Compose

- [ ] `backend/Dockerfile`: [02](02-migrate.md#the-dockerfile-pattern)'s pattern, copying `shared/` and `database/` and `backend/`, with `--filter "@greenwave/backend..."`, `WORKDIR /app/backend` and `CMD ["node", "--import", "tsx", "src/main.ts"]`.
- [ ] `compose.yaml`:

  ```yaml
  backend:
    build: { context: ., dockerfile: backend/Dockerfile }
    init: true # forwards SIGTERM to node and reaps children
    environment:
      DATABASE_URL: postgresql://greenwave:greenwave@postgres:5432/greenwave
      MQTT_URL: mqtt://mosquitto:1883
      MQTT_BACKEND_PASSWORD: ${MQTT_BACKEND_PASSWORD:?set it in .env}
    depends_on:
      mosquitto: { condition: service_healthy }
      migrate: { condition: service_completed_successfully }
    restart: unless-stopped
  ```

  No `container_name`: `--scale backend=3` needs three names.

## Tests

- `rules.test.ts`: every rule above, including the length weighting (one long heavy segment beats many short free ones), the flag sequences, `isNewer` with equal timestamps (not newer), and `toBucketStart` at :14:59.999 and :15:00.
- `state-message.test.ts`: the result parses with `stateSchema`; the flags render as ISO strings or `null`.
- `process-observation.test.ts`, against the local Postgres (`pnpm db:up`), skipped when `DATABASE_URL` is unset. Truncate the six tables before each test.
  - the same observation twice: second call returns `null`, one receipt, `sampleCount` 1;
  - an older reading after a newer one: state unchanged, history `sampleCount` 2 in its own bucket;
  - a `fixture` reading: state written, no history rows;
  - three congested readings: `congestedSince` equals the first one's `observedAt`.

## Pitfalls

- **Ack after commit, never before.** Acking first turns a crash into a lost reading.
- **`clientId` from the hostname survives `docker compose restart`, not `--force-recreate` or `down`/`up`.** A recreated container gets a new hostname, and the old session keeps its queued messages for up to the hour of `sessionExpiryInterval`. With one copy that only wastes broker memory; set `BACKEND_CLIENT_ID=backend-1` when you need a fixed one.
- **Shared subscriptions and offline members.** Mosquitto may hand a shared message to a copy that is offline with a persistent session, where it waits until that copy returns. With three copies and one stopped, about a third of the readings are delayed, not lost. [07](07-loadgen.md)'s scenario 4 should see exactly this.
- **Round-robin delivery.** A route's readings land on different copies, so never keep flags or streaks in memory. Everything lives in `traffic_route_state` under the row lock.
- The receipts table grows by about 19,000 rows a day. Leave it; prune with `DELETE … WHERE "receivedAt" < now() - interval '1 day'` if it ever matters (duplicates can only arrive within the session expiry).

## Done when

- [ ] With the adapter in fixture mode, every minute: 13 receipts, 13 retained state messages (`mosquitto_sub -t 'greenwave/v1/+/routes/+/state' -v` as anonymous), and no history rows (fixtures). With `ADAPTER_SOURCE=tomtom`, history buckets fill: `sampleCount` reaches 15 per quarter hour.
- [ ] `docker compose restart backend` under a running adapter loses and doubles nothing: receipts = observations published, and no bucket's `sampleCount` exceeds the readings in it.
- [ ] `docker compose up --scale backend=3` (week 48): the same holds, and the three copies' metrics lines add up to 13 a minute.
- [ ] M2 (Mon 16 Nov): real readings reach the browser map every minute, with [05](05-frontend.md).
- [ ] The backend section of the report has a draft ([WP9](../work-plan/wp9-report-and-demo.md)).

## Not in this plan

- Reading the tables for the map: [05](05-frontend.md). For forecasts: [06](06-predictor.md).
- Tuning `SLOWER_THAN_USUAL_RATIO` and `CONGESTED_LENGTH_SHARE` against `traffic_route_history` (week 48 per the work plan): a follow-up PR to `shared/`.
