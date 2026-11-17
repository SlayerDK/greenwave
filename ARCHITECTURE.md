# GreenWave architecture

Live traffic for Aarhus's main roads on a Mapbox map, with every road segment coloured by its current speed, and a forecast of where the traffic is heading. This is the target architecture for the SWIoT course project.

The project started as adaptive traffic-light control (presentation 1). With real TomTom data from Aarhus Kommune it works with real-time data instead: it shows the current traffic state and predicts the future state.

> **Status (2026-11-09):** target design with a merged workspace/contracts/database foundation; the broker is implemented on 10 Nov, but the adapter/backend/live-frontend pipeline is not implemented yet. [`docs/WORK-PLAN.md`](docs/WORK-PLAN.md) says who builds what before the hand-in on 4 December 2026. Today the app is a single Next.js proof of concept that calls TomTom's API directly over HTTP (see `README.md`). Its Vercel cron records the traffic history until the hand-in.

At a glance:

- **Goal:** show the current traffic state live, and predict the future state.
- **Protocols:** HTTP from each city's API into our adapter, MQTT 5 between our services, MQTT over WebSocket to the browser.
- **Broker:** one Mosquitto instance, one topic tree per city.
- **Runs on:** Docker Compose on one machine.
- **Current scale:** one Aarhus adapter and one backend. More cities/workers are scalability discussion and future work, not delivery requirements.

## Overview

Each city's adapter polls its traffic API and publishes the readings over MQTT. The backend turns them into processed state, stores it in Postgres and publishes it back to the broker, and the frontend draws the map from Postgres and receives live updates over a WebSocket. A prediction job learns from the stored history and writes forecasts that the frontend shows beside the live state.

| Component              | Responsibility                                                                                                   | Built with                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Adapter (one per city) | Polls the city's API, converts the data into our message format, publishes it                                    | Node.js, TypeScript, MQTT.js, Zod              |
| MQTT broker            | Routes messages by topic; keeps retained state, Last Will messages and sessions                                  | Mosquitto 2                                    |
| Backend                | Classifies congestion, stores state and history, publishes processed state. The only writer of traffic data      | Node.js, TypeScript, MQTT.js, Prisma           |
| Postgres               | Geometry, latest state, history, forecasts, the Traffic Stats import, user accounts                              | PostgreSQL 18                                  |
| Frontend               | The existing Next.js app: renders the map and forecasts, handles login, reads Postgres, subscribes to live state | Next.js 16, Mapbox GL, TanStack Query, MQTT.js |
| Prediction job         | Learns from the recorded history and the Traffic Stats import, writes forecasts for the frontend                 | Node.js, TypeScript, Prisma, croner            |

## Decisions

### An adapter per city, not a broker per city

The per-city component polls an HTTP API, validates the data and converts it into GeoJSON and our message format, which makes it an adapter (L8 slide 12, L7 slide 23); a broker only routes messages. Each adapter absorbs its city's quirks, so a future city would need an adapter plus an explicit MQTT user/ACL entry and configuration. Only Aarhus is in the current delivery scope.

### One broker, one topic tree per city

All adapters publish to one broker under `greenwave/v1/{city}/…`. A broker per city would make the backend connect to every broker, and with the city in every topic, brokers can still be split later.

### The adapter normalizes, the backend classifies

Congestion thresholds live only in the backend, so "congested" means the same thing in every city (L8 slides 9 and 13).

### The backend writes, the frontend reads

The frontend's server side renders pages, handles login and reads Postgres, but holds no business rules. Login needs Postgres anyway, so a REST API on the backend would add little.

### Live updates straight from the broker

The browser subscribes to state over MQTT on a WebSocket, with anonymous read-only access locally. The first paint is server-rendered from Postgres, so the map still loads if the live connection drops. Relaying updates through Next.js instead would put an MQTT connection in the frontend.

### Docker Compose

The backend and the broker hold long-lived connections, and everything runs with Docker Compose on one machine.

### MQTT only, no CoAP

MQTT is required by [Brightspace L6](https://brightspace.au.dk/d2l/le/content/220544/Home?itemIdentifier=D2L.LE.Content.ContentObject.ModuleCO-2843971). A CoAP gateway and traffic signs are out of scope.

### Distributed and event-driven, not microservices

The live pipeline separates adapter, backend, frontend and broker for a reason: the adapter scales per city and holds API keys, the backend needs a long-lived MQTT connection, the frontend scales with viewers, and the broker is shared infrastructure. Splitting further would add contracts and harder tracing for no gain (L8 slides 5 and 24). Kafka isn't needed because Postgres holds the history (L8 slide 28).

### Historical data kept separate

Historical analysis and prediction meet the live pipeline only in Postgres: the prediction job reads the history and writes forecasts back, without touching MQTT. See [Historical data and prediction](#historical-data-and-prediction).

## MQTT design

| Topic                                               | Kind      | From → to                      | Settings                                 |
| --------------------------------------------------- | --------- | ------------------------------ | ---------------------------------------- |
| `greenwave/v1/{city}/routes/{routeId}/observations` | telemetry | adapter → backend              | QoS 1, not retained                      |
| `greenwave/v1/{city}/routes/{routeId}/state`        | state     | backend → frontend             | QoS 1, retained, expires after 5 minutes |
| `greenwave/v1/{city}/adapter/status`                | liveness  | adapter's Last Will → frontend | QoS 1, retained                          |

- **Self-contained messages:** every message carries its segments' geometry, so a reading never travels without its location and there is no separate geometry topic. The geometry adds about 50%: the Ringvejen fixture's 165 segments are 25 KB without it and 38 KB with it.
- **Retained state** gives a newly opened map every route at once. The expiry makes a stalled pipeline show "no data" instead of stale green roads.
- **Last Will:** if an adapter dies, the broker publishes `offline` on its status topic.
- **QoS 1 and a persistent session:** an already-subscribed backend with fixed client ID `backend-1` can recover a short outage within its one-hour session expiry and the broker's 1,000-message queue. The backend drops duplicates by `eventId`; this is not end-to-end exactly-once or power-loss durability.
- **No event topic:** congestion is part of the state (`congestedSince`), because the map only needs to know whether a route is congested now. A `…/events/congestion` topic is worth adding once something has to react to the moment congestion starts, such as notifications.

### Observation message

One message per route per poll. This is the real Ringvejen fixture, cut down to one segment:

```json
{
  "eventId": "aarhus:56634:2026-10-19T09:41:00Z",
  "schemaVersion": 1,
  "source": "live",
  "cityId": "aarhus",
  "routeId": "56634",
  "observedAt": "2026-10-19T09:41:00Z",
  "route": {
    "name": "Ringvejen sydgående",
    "lengthM": 9637,
    "travelTimeSec": 1017,
    "typicalTravelTimeSec": 977,
    "delaySec": 323,
    "passable": true
  },
  "segments": [
    {
      "id": "1170420026289651713",
      "lengthM": 10,
      "currentSpeedKmh": 38,
      "averageSpeedKmh": 35,
      "typicalSpeedKmh": 35,
      "relativeSpeedPct": 88,
      "confidencePct": 100,
      "coordinates": [
        [10.21815, 56.18899],
        [10.21801, 56.18894]
      ]
    }
  ]
}
```

| Field                      | Meaning                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `eventId`                  | `{cityId}:{routeId}:{observedAt}`, so a repeated reading gets the same id and is dropped                               |
| `schemaVersion`            | Version of the message format                                                                                          |
| `source`                   | `live`, `fixture` (recorded responses replayed in development) or `loadtest`. Fixture readings stay out of the history |
| `cityId`, `routeId`        | Which route. All ids are strings                                                                                       |
| `observedAt`               | When TomTom produced the data (its `date` response header), not when we received it (L8 slide 9)                       |
| `route`                    | Name without TomTom's `CW_AU_` prefix, length, current and typical travel time, delay, and whether it's passable       |
| `segments[].id`            | TomTom's segment id, a string because the number exceeds JavaScript's safe integer range                               |
| `segments[]` speeds        | Current, average and typical speed in km/h, and current speed as a percentage of free-flow speed                       |
| `segments[].confidencePct` | TomTom's confidence in the reading, 0–100                                                                              |
| `segments[].coordinates`   | GeoJSON `[longitude, latitude]` pairs, converted from TomTom's `{latitude, longitude}` objects                         |

The state message is the observation plus what the backend derives:

- a congestion level per segment: free, light, moderate, heavy or closed
- `route.congestedSince`: when at least a fifth of the route's length became moderate or worse
- `route.slowerThanUsualSince`: when its travel time first ran 30% above TomTom's typical travel time for that time of day

Both route fields are `null` when they don't apply. The first matches the map's colours, while the second shows whether today is worse than usual.

## Backend

For each observation, the backend:

1. Validates it and drops duplicates by `eventId`.
2. Classifies each segment with today's `classifyCongestion` thresholds.
3. Sets the route's two flags, congested and slower than usual, after three readings in a row, and clears them the same way, so the status doesn't flap.
4. Saves the geometry of new segments, the latest state if it's newer than what's stored, and the reading in its 15-minute history bucket (except replayed fixtures).
5. Publishes the route's state, retained.

| Problem (L8 slide 35)                              | Fix                                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| Duplicate deliveries from QoS 1 or adapter retries | Deterministic `eventId` and unique keys                                     |
| An older reading arriving after a newer one        | State is written only if `observedAt` is newer; the browser checks the same |
| Overload                                           | The broker buffers; MQTT 5 Receive Maximum caps unacknowledged messages     |
| Two writers to the same data                       | Only the backend writes traffic data                                        |

## Single backend and session identity

The required pipeline has one backend, processing one message at a time on the normal `greenwave/v1/+/routes/+/observations` filter. Use the existing `observationTopic("+", "+")` builder, not the legacy shared-subscription export. Store congestion streaks in Postgres so a process restart does not reset them.

Keep client ID `backend-1` through restart and container recreation. A hostname-derived identity changes after recreation; an abandoned persistent shared session can keep receiving readings that the replacement does not process. Do not run a second backend with either a new shared identity or the same fixed identity. Multiple workers would need a separate assignment/concurrency design and are future work.

## Deployment

| Service          | What it is                                                | Host port                     |
| ---------------- | --------------------------------------------------------- | ----------------------------- |
| `postgres`       | Already in `compose.yaml`                                 | 5432                          |
| `mosquitto`      | The broker                                                | 1883 (MQTT), 9001 (WebSocket) |
| `migrate`        | Runs `prisma migrate deploy`, then exits                  | none                          |
| `adapter-aarhus` | City id, routes and TomTom key from environment variables | none                          |
| `backend`        | The MQTT consumer                                         | none                          |
| `frontend`       | The Next.js app, built from the existing `Dockerfile`     | 3000                          |

- Healthchecks and `depends_on` start the services in order; the backend and frontend wait for `migrate`.
- Services reach each other by name (`mqtt://mosquitto:1883`). The browser runs on the host and uses `ws://localhost:9001`.
- Run one backend only, with `BACKEND_CLIENT_ID=backend-1` in development and Compose. Publish broker host ports as `127.0.0.1:1883:1883` and `127.0.0.1:9001:9001`; internal services still use `mosquitto:1883`.

The [broker implementation plan](docs/implementation-plans/01-broker.md) owns the exact config, init script, Compose blocks and smoke commands. It uses a persistent data volume and two users only. Anonymous clients read state/status and healthcheck uptime; the adapter writes only Aarhus observations/status; the backend reads observations and writes state. Passwords come from `.env` through a one-shot init job, never Git.

The default 1,000-message queue is enough for the one-hour Aarhus session at 13 messages/minute (about 780 readings). Replay requires an existing subscription and the same client ID. Queue overflow, session expiry, observations before the first subscription, abrupt broker crashes and the commit-to-publish gap are documented limits, not solved by QoS 1. See [operations and limits](docs/implementation-plans/01-broker.md#operations-and-limits).

## Scalability

We implement one city and one backend. [WP7](docs/work-plan/wp7-load-tests.md) records a short baseline and explains 100× growth; it does not claim a measured capacity limit or horizontal scaling.

| Growth              | What must be reassessed                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| Cities/routes       | More adapters and explicit credentials/ACLs, API quotas, message volume and database write cost |
| Messages/processing | Per-message processing time, bounded queue and lag; one backend can become the bottleneck       |
| Data                | History growth, retention and database capacity; aggregation bounds samples per stored bucket   |
| Viewers             | Broker fan-out and network/browser work; viewer growth does not multiply TomTom polling         |

At the planned rate, Aarhus sends 13 observations/minute. 100 equivalent cities would offer about 1,300/minute (21.7/second), before considering payload bytes and storage. This is arithmetic, not a benchmark. The existing 15-minute history and prediction plans add substantive data handling without requiring a worker cluster. Explain why extra workers, regional brokers or managed infrastructure might become relevant later, rather than implementing them now.

## Pros and cons

Pros:

- A future city can reuse the topic/message design, with its own adapter and explicit user/ACL configuration.
- Parts fail separately: the Last Will flags a dead adapter, the broker queues an established backend session's readings during a bounded short outage, and the map marks stale state rather than treating it as current.
- Load on the city APIs doesn't grow with viewers.
- One `docker compose up` runs everything, and `mosquitto_sub` shows every message.
- A standard protocol keeps the parts replaceable.

Cons:

- More moving parts than today's single app.
- A reading crosses three services, so tracing it means following its `eventId` through the logs (L8 slide 24).
- Eventually consistent: the map can briefly lag the database.
- The single broker is a single point of failure.
- Local only: anonymous browser access and no TLS.

| Alternative                        | Why not now                                                                      | Better when                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Today's Next.js app calling TomTom | No MQTT, API calls tied to page views, nowhere for live processing               | One city, no live analysis                                           |
| A broker per city                  | The backend must connect to every broker                                         | Cities run their own brokers and bridge topics to us                 |
| Adapters POSTing to the backend    | No fan-out, retained state or Last Will; adapters must know where the backend is | One producer, one consumer                                           |
| Kafka                              | Heavy to run, and replay isn't needed                                            | Many consumers replaying history                                     |
| Azure IoT Hub or AWS IoT Core      | Cloud-only, while we run locally                                                 | Real devices needing identity and fleet management (L7 slides 33–37) |
| Microservices                      | More contracts and tracing for no gain                                           | Large teams, very different scaling needs                            |

## Historical data and prediction

Prediction is part of the goal: the map should show where traffic is heading, not only where it is now. It stays apart from the live pipeline; the two sides meet only in Postgres.

- The Traffic Stats export (20 routes, about 1,700 segments) averages 199 school-term weekdays into one typical weekday of 24 time slots, 06:00–18:00. It's imported once with `pnpm db:import-traffic-stats` and shown on `/history`.
- The history the backend records grows every day and is what predictions learn from. It is kept as 15-minute averages, about 100,000 rows a day for Aarhus. Every Traffic Stats slot starts and ends on a quarter hour, so the two line up.
- Until the hand-in, the proof of concept's Vercel cron also records a 15-minute sample into Neon, which is imported into the same table. It started on 2 November, before the pipeline exists.
- Live data and Traffic Stats don't share ids, so comparing them needs a table mapping each live route to its Traffic Stats route.
- Prediction runs as a batch job every 15 minutes. It reads the history and writes a forecast for every 15-minute slot until midnight to a table the frontend reads. A slider on the map shows them beside the live state.
- The method starts from a typical speed per segment, day type (weekday or weekend) and 15-minute slot, taken from our own history. Where our data is thin, Traffic Stats' weekday shape fills in. To that profile it adds today's deviation from it, which fades the further ahead the forecast looks. A backtest compares this with two baselines: the current speed, and the profile alone.

## Out of scope

A CoAP gateway and traffic signs, production deployment (TLS, broker login for browsers, backups), broker clustering, multiple backend workers, shared subscriptions, synthetic-city load generation and dedicated monitoring services.

## Implementation overview

Owners, dates and implementation details for each item are in [`docs/WORK-PLAN.md`](docs/WORK-PLAN.md).

- [ ] **Workspace:** a pnpm workspace with one directory per container (`frontend/`, `adapter/`, `backend/`, `predictor/`, `broker/`, `database/` for Prisma and `migrate`) and `shared/` (message schemas, topics, and the congestion thresholds from `src/lib/traffic/serialization.ts`). The Next.js app moves into `frontend/`.

- [ ] **Compose:** `mosquitto` with its config and access rules, `migrate`, `adapter-aarhus`, `backend` and `frontend`, with healthchecks.

- [ ] **Adapter:** move `src/lib/traffic/tomtom-service.ts` into it, poll each route every minute, and publish observations and the Last Will status.

- [ ] **Database:** city ids, a latest-state table, and 15-minute averaged history instead of hourly samples.

- [ ] **Backend:** one normal subscription, fixed client ID, validation, deduplication, classification, congestion status, Postgres writes and retained state.

- [ ] **Frontend:** first paint from Postgres, plus a hook that merges live state into the TanStack Query cache.

- [ ] **Clean-up:** remove the direct TomTom calls, `/api/traffic`, the Refresh and snapshot buttons, `TrafficSnapshot`, the cron route and workflow, `vercel.json` and `build-vercel`; update `README.md` and `CLAUDE.md`. The workflow and `vercel.json` go last, after the hand-in, because until then they keep the frozen Vercel deployment recording history.

- [ ] **Verification:** a short measured baseline, focused permission/restart/recreation/staleness checks, and a justified 100× scalability discussion. No required load-generator service.

- [ ] **Prediction:** a forecasts table, a first forecast job on the recorded history and Traffic Stats, a backtest against two baselines, and a forecast slider on the map.
