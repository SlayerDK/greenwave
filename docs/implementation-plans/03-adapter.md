# 03 · Adapter: `adapter-aarhus`

**Compose service `adapter-aarhus`, package `@greenwave/adapter` in `adapter/`.** [WP3](../work-plan/wp3-adapter.md) · Christian · 9–11 Nov · Needs [00](00-foundation.md), [01](01-broker.md), [02](02-migrate.md) · Unblocks [04](04-backend.md) end to end, [07](07-loadgen.md). · [← Plans](README.md)

## Goal

Poll TomTom's Route Monitoring API for each of Aarhus's 13 routes at the start of every minute, turn each answer into an observation message, and publish it at QoS 1. Announce the adapter's own liveness on a retained status topic, with a Last Will that marks it `offline` if it dies. In development, replay recorded responses instead of calling TomTom.

The adapter absorbs every TomTom quirk (string segment ids, `{latitude, longitude}` points, the `CW_AU_` prefix, the `date` header), so nothing downstream knows TomTom exists.

## Read first

- [`CLAUDE.md`](../../CLAUDE.md) → _Traffic_, especially the **three things that silently produce wrong output**: `segmentIdStr`, `[longitude, latitude]`, and `observedAt` from the `date` header.
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) → _MQTT design_ (the observation message and its field table).
- `frontend/src/lib/traffic/tomtom-service.ts`, `frontend/src/lib/traffic/schema.ts`, `frontend/src/lib/traffic/serialization.ts` (`toPositions`, `toRouteLabel`), `frontend/src/lib/traffic/fixtures/route-details.json`.
- [00 · Foundation](00-foundation.md) → `observationSchema`, `toEventId`, the topic builders, `onlineStatus`/`offlineStatus`.

## Interfaces

| Direction | What                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------ |
| In        | `GET https://api.tomtom.com/routemonitoring/3/routes/{id}/details?key=…`, or the fixtures        |
| Out       | `greenwave/v1/aarhus/routes/{routeId}/observations`: QoS 1, not retained, `observationSchema`    |
| Out       | `greenwave/v1/aarhus/adapter/status`: QoS 1, retained, `adapterStatusSchema`; also the Last Will |

| Variable                | Value                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `CITY_ID`               | `aarhus`                                                                                                                   |
| `ROUTE_IDS`             | `56634,56628,313719,313720,313721,313722,313723,313724,313725,313726,313727,313728,313729` (today's `MONITORED_ROUTE_IDS`) |
| `POLL_INTERVAL_SECONDS` | `60`                                                                                                                       |
| `ADAPTER_SOURCE`        | `tomtom` or `fixture` (`fixture` in development)                                                                           |
| `TOMTOM_API_KEY`        | required only when `ADAPTER_SOURCE=tomtom`                                                                                 |
| `MQTT_URL`              | `mqtt://localhost:1883`; `mqtt://mosquitto:1883` in Compose                                                                |
| `MQTT_ADAPTER_PASSWORD` | the `adapter-aarhus` user's password. The username is `adapter-${CITY_ID}`                                                 |

## Files

```
adapter/
  Dockerfile  package.json  tsconfig.json
  fixtures/route-<routeId>.json      13 recorded TomTom responses (raw, as TomTom sent them)
  src/
    env.ts                Zod-validated environment
    tomtom.ts             fetchRouteDetails, readRoute, the TomTom schemas, TrafficError
    normalize.ts          TomTom details → Observation
    fixtures.ts           load and jitter a recorded response
    record-fixtures.ts    one-off script: save one live response per route
    scheduler.ts          start-of-minute ticks, never overlapping
    mqtt.ts               connect with the Last Will, publish helpers
    main.ts               wires it together; SIGTERM handling
    normalize.test.ts  fixtures.test.ts  scheduler.test.ts  env.test.ts
```

`package.json`:

```json
{
  "name": "@greenwave/adapter",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch --env-file=../.env src/main.ts",
    "start": "tsx src/main.ts",
    "record-fixtures": "tsx --env-file=../.env src/record-fixtures.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@greenwave/shared": "workspace:*",
    "mqtt": "catalog:",
    "pino": "catalog:",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "pino-pretty": "catalog:",
    "tsx": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

## Steps

### 1 · TomTom client

- [ ] `src/tomtom.ts`: **copy**, don't move, from `frontend/src/lib/traffic/tomtom-service.ts` and `schema.ts`: `tomtomRouteDetailsSchema` and its point/segment schemas, `tomtomErrorBodySchema`, `TrafficError`, `toErrorCode`, `toErrorMessage`, `toFetchedAt`, `fetchRouteDetails`, `readRoute`. Then:
  - drop `import "server-only"` and `import { env }`; `fetchRouteDetails(routeId, apiKey)` takes the key as a parameter;
  - drop the Next-only `next: { revalidate, tags }` fetch option and the `revalidateSeconds` parameter, `TRAFFIC_REFRESH_SECONDS` and `trafficTag`;
  - route ids are strings here (`ROUTE_IDS` is a string list); build the URL with them as they are;
  - keep `segmentId` **out** of the schema and keep the `AbortSignal.timeout(8_000)`.

  The Next app keeps its own copy until [05](05-frontend.md) phase D deletes it. Copying keeps this PR independent of that one.

### 2 · Normalization

- [ ] `src/normalize.ts`: copy `toPositions` and `toRouteLabel` (with their comments) from `frontend/src/lib/traffic/serialization.ts`, then:

  ```ts
  export const toObservation = (
    details: TomTomRouteDetails,
    {
      cityId,
      observedAt,
      source,
    }: { cityId: string; observedAt: string; source: Observation["source"] },
  ): Observation => {
    const routeId = String(details.routeId);

    return observationSchema.parse({
      eventId: toEventId(cityId, routeId, observedAt),
      schemaVersion: 1,
      source,
      cityId,
      routeId,
      observedAt,
      route: {
        name: toRouteLabel(details.routeName),
        lengthM: details.routeLength,
        travelTimeSec: details.travelTime,
        typicalTravelTimeSec: details.typicalTravelTime,
        delaySec: details.delayTime,
        passable: details.passable,
      },
      segments: details.detailedSegments.map((segment) => ({
        id: segment.segmentIdStr,
        lengthM: segment.segmentLength,
        currentSpeedKmh: segment.currentSpeed,
        averageSpeedKmh: segment.averageSpeed,
        typicalSpeedKmh: segment.typicalSpeed,
        relativeSpeedPct: segment.relativeSpeed,
        confidencePct: segment.confidence,
        coordinates: toPositions(segment.shape),
      })),
    });
  };
  ```

  `observationSchema.parse` runs **before** publishing, so a TomTom format change fails here with a clear error instead of in the backend. A parse failure is logged and that route skipped, like a `TrafficError`.

### 3 · Fixtures

- [ ] `src/record-fixtures.ts`: for every id in `ROUTE_IDS`, fetch the raw JSON with the key and write it **unparsed** to `fixtures/route-<id>.json` (`JSON.parse` would round `segmentId`; write the response text as it came). Print one line per route. Run it once: `pnpm --filter @greenwave/adapter record-fixtures`.
- [ ] Commit the 13 files. Two already exist as a start (`frontend/src/lib/traffic/fixtures/route-details.json` is route 56634; `route-details-313727.json` is 313727). Recording the rest needs `TOMTOM_API_KEY`: Christian has it, so either he runs the script or shares the key privately. Never commit the key.
- [ ] `src/fixtures.ts`: load a fixture through `tomtomRouteDetailsSchema`, then jitter each segment's `currentSpeed` by a factor in [0.9, 1.1], recompute `relativeSpeed` with the same factor (rounded, both integers), and leave everything else alone. Take the random source as a parameter so tests are deterministic. `observedAt` is the tick time and `source` is `"fixture"`, which keeps these readings out of the history ([04](04-backend.md)).

### 4 · Scheduler and main

- [ ] `src/env.ts`

  ```ts
  const base = z.object({
    CITY_ID: z.string().regex(/^[a-z0-9-]+$/),
    ROUTE_IDS: z
      .string()
      .transform((s) =>
        s
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.string()).min(1)),
    POLL_INTERVAL_SECONDS: z.coerce.number().int().min(10).default(60),
    MQTT_URL: z.url(),
    MQTT_ADAPTER_PASSWORD: z.string().min(1),
  });
  export const envSchema = z.discriminatedUnion("ADAPTER_SOURCE", [
    base.extend({
      ADAPTER_SOURCE: z.literal("tomtom"),
      TOMTOM_API_KEY: z.string().min(1),
    }),
    base.extend({ ADAPTER_SOURCE: z.literal("fixture") }),
  ]);
  ```

- [ ] `src/scheduler.ts`: fire at each multiple of `POLL_INTERVAL_SECONDS` on the wall clock (at :00 for 60 s), recomputing the delay from `Date.now()` every time so it does not drift. If the previous tick is still running, skip this one and log it. Export it in a form a test can drive with fake timers.
- [ ] One tick: read every route in parallel with `Promise.all` (the explicit-arrow note in `tomtom-service.ts` applies), then publish each route that answered and log each one that failed with its `TrafficError` message. **`observedAt` is TomTom's `date` header** (`toFetchedAt`), in tomtom mode; in fixture mode it is the tick time.
- [ ] `src/mqtt.ts`

  ```ts
  const client = await mqtt.connectAsync(env.MQTT_URL, {
    protocolVersion: 5,
    clientId: `adapter-${env.CITY_ID}`,
    username: `adapter-${env.CITY_ID}`,
    password: env.MQTT_ADAPTER_PASSWORD,
    keepalive: 15, // the broker notices a dead adapter within about 22 s
    reconnectPeriod: 5_000,
    will: {
      topic: statusTopic(env.CITY_ID),
      payload: offlineStatus(),
      qos: 1,
      retain: true,
    },
  });

  const publishOnline = () =>
    client.publishAsync(statusTopic(env.CITY_ID), onlineStatus(), {
      qos: 1,
      retain: true,
    });

  // The initial connect event already fired before connectAsync resolved.
  // Publish explicitly now, and publish again on later reconnects.
  client.on("connect", () => {
    void publishOnline().catch(logMqttError);
  });
  await publishOnline();
  ```

  `logMqttError` records publication failures without exposing credentials. Verify online status on the first connection as well as after a Last Will/reconnect.

  Publish each observation with `client.publishAsync(observationTopic(cityId, routeId), JSON.stringify(observation), { qos: 1 })`. While disconnected, MQTT.js queues publishes in memory and sends them on reconnect.

- [ ] `src/main.ts`: parse the env (exit 1 with the Zod message on failure), connect, start the scheduler. On `SIGTERM` and `SIGINT`: stop the scheduler, publish `offlineStatus()` retained, then `await client.endAsync()` and exit 0. A clean disconnect does **not** fire the Last Will, so without this `docker compose stop` would leave the city showing online.
- [ ] Log with pino: one line per tick (`{ msg: "tick", published, failed, ms }`), one per failed route, and the connect/reconnect events.

### 5 · Compose

- [ ] `adapter/Dockerfile`: [02](02-migrate.md#the-dockerfile-pattern)'s pattern, copying `shared/` and `adapter/`, with `--filter "@greenwave/adapter..."`, `WORKDIR /app/adapter` and `CMD ["node", "--import", "tsx", "src/main.ts"]`.
- [ ] `compose.yaml`:

  ```yaml
  adapter-aarhus:
    build: { context: ., dockerfile: adapter/Dockerfile }
    init: true # forwards SIGTERM to node and reaps children
    environment:
      CITY_ID: aarhus
      ROUTE_IDS: 56634,56628,313719,313720,313721,313722,313723,313724,313725,313726,313727,313728,313729
      POLL_INTERVAL_SECONDS: 60
      ADAPTER_SOURCE: ${ADAPTER_SOURCE:-fixture}
      TOMTOM_API_KEY: ${TOMTOM_API_KEY:-}
      MQTT_URL: mqtt://mosquitto:1883
      MQTT_ADAPTER_PASSWORD: ${MQTT_ADAPTER_PASSWORD:?set it in .env}
    depends_on:
      mosquitto: { condition: service_healthy }
    restart: unless-stopped
    stop_grace_period: 10s
  ```

  It needs no database, so it does not wait for `migrate`. `ADAPTER_SOURCE=tomtom docker compose up` switches to live data.

- [ ] `.env.example`: add `ADAPTER_SOURCE="fixture"`, and change the `TOMTOM_API_KEY` comment to "only for the live adapter and `record-fixtures`".

## Tests

- `normalize.test.ts`, from the 56634 fixture: the result passes `observationSchema`; every segment id is a string equal to the fixture's `segmentIdStr` (164 of the 165 differ from `String(segmentId)` after `JSON.parse`, which is the rounding being avoided); the first coordinate is `[10.218…, 56.188…]` (longitude first); a `CW_AU_` name from the 313727 fixture comes out trimmed; `eventId` is `aarhus:56634:<observedAt>`.
- `fixtures.test.ts`: with a fixed random source, speeds stay within ±10% and integral; geometry and ids are unchanged; `source` is `fixture`.
- `scheduler.test.ts` (fake timers): the first tick is at the next minute boundary; a tick that takes 90 s causes the next to be skipped, not queued.
- `env.test.ts`: `tomtom` without a key fails; `fixture` without one passes; `ROUTE_IDS` with spaces splits cleanly.

## Pitfalls

- **Never read `segmentId`**, and never `JSON.parse` then `JSON.stringify` a raw TomTom response you want to keep (fixtures): both corrupt 164 of 165 ids on 56634.
- **`[longitude, latitude]`.** Everything goes through `toPositions`.
- **`observedAt` from the `date` header**, not `new Date()`, in tomtom mode. The two differ when TomTom serves a cached answer.
- TomTom's quota: 13 calls a minute is about 19,000 a day. Do not poll faster than every 60 s, and use fixtures for development and the load test.
- The Last Will's `at` is the connect time, not the death time. The frontend only shows "offline", so that is acceptable; do not try to make it exact.

## Done when

- [ ] `pnpm --filter @greenwave/adapter dev` with `ADAPTER_SOURCE=fixture` and `mosquitto_sub -v -u backend -P "$MQTT_BACKEND_PASSWORD" -t 'greenwave/v1/aarhus/#'` shows 13 observations at the start of every minute and a retained `online` status.
- [ ] The same with `ADAPTER_SOURCE=tomtom` shows live data (run once, by whoever holds the key).
- [ ] `docker compose kill adapter-aarhus` turns the status `offline` within about 25 s; `docker compose stop adapter-aarhus` turns it `offline` at once; starting it again turns it `online`.
- [ ] The adapter section of the report has a draft ([WP9](../work-plan/wp9-report-and-demo.md)).

## Not in this plan

- Validation, deduplication and everything downstream: [04](04-backend.md).
- Removing the Next app's copy of the TomTom client: [05](05-frontend.md) phase D.
- A second city: a second `adapter-<city>` service, user and ACL entry, after the hand-in.
