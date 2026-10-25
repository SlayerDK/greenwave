# GreenWave architecture

Live traffic for Aarhus's main roads on a Mapbox map, with every road segment coloured by its current speed, and a forecast of where the traffic is heading. This is the target architecture for the SWIoT course project.

The project started as adaptive traffic-light control (presentation 1). With real TomTom data from Aarhus Kommune it works with real-time data instead: it shows the current traffic state and predicts the future state.

> **Status (2026-10-25):** agreed design, not implemented yet. Prediction is part of the goal, but its method isn't chosen. Today the app is a single Next.js proof of concept that calls TomTom's API directly over HTTP (see `README.md`).

At a glance:

- **Goal:** show the current traffic state live, and predict the future state.
- **Protocols:** HTTP from each city's API into our adapter, MQTT 5 between our services, MQTT over WebSocket to the browser.
- **Broker:** one Mosquitto instance, one topic tree per city.
- **Runs on:** Docker Compose on one machine.
- **Scales by:** an adapter per city and more backend copies.

## Overview

Each city's adapter polls its traffic API and publishes the readings over MQTT. The backend turns them into processed state, stores it in Postgres and publishes it back to the broker, and the frontend draws the map from Postgres and receives live updates over a WebSocket. A prediction job learns from the stored history and writes forecasts that the frontend shows beside the live state.

| Component              | Responsibility                                                                                                   | Built with                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Adapter (one per city) | Polls the city's API, converts the data into our message format, publishes it                                    | Node.js, TypeScript, MQTT.js, Zod              |
| MQTT broker            | Routes messages by topic; keeps retained state, Last Will messages and sessions                                  | Mosquitto 2                                    |
| Backend                | Classifies congestion, stores state and history, publishes processed state. The only writer of traffic data      | Node.js, TypeScript, MQTT.js, Prisma           |
| Postgres               | Geometry, latest state, history, forecasts, the Traffic Stats import, user accounts                              | PostgreSQL 18                                  |
| Frontend               | The existing Next.js app: renders the map and forecasts, handles login, reads Postgres, subscribes to live state | Next.js 16, Mapbox GL, TanStack Query, MQTT.js |
| Prediction job         | Learns from the recorded history and the Traffic Stats import, writes forecasts for the frontend                 | A batch job; method not chosen yet             |

## Decisions

### An adapter per city, not a broker per city

The per-city component polls an HTTP API, validates the data and converts it into GeoJSON and our message format, which makes it an adapter (L8 slide 12, L7 slide 23); a broker only routes messages. Each adapter absorbs its city's quirks, so adding a city means adding an adapter and nothing else.

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

The requirement is MQTT. CoAP suits constrained devices; a CoAP gateway and traffic signs are out of scope.

### Distributed and event-driven, not microservices

There are four deployable parts, each split off for a reason: the adapter scales per city and holds API keys, the backend needs a long-lived MQTT connection, the frontend scales with viewers, and the broker is shared infrastructure. Splitting further would add contracts and harder tracing for no gain (L8 slides 5 and 24). Kafka isn't needed because Postgres holds the history (L8 slide 28).

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
- **QoS 1 and a persistent session:** the broker queues readings while the backend restarts, and the backend drops duplicates by `eventId`.
- **No event topic:** congestion is part of the state (`congestedSince`), because the map only needs to know whether a route is congested now. A `…/events/congestion` topic is worth adding once something has to react to the moment congestion starts, such as notifications.

### Observation message

One message per route per poll. This is the real Ringvejen fixture, cut down to one segment:

```json
{
  "eventId": "aarhus:56634:2026-10-19T09:41:00Z",
  "schemaVersion": 1,
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

| Field                      | Meaning                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `eventId`                  | `{cityId}:{routeId}:{observedAt}`, so a repeated reading gets the same id and is dropped                         |
| `schemaVersion`            | Version of the message format                                                                                    |
| `cityId`, `routeId`        | Which route. All ids are strings                                                                                 |
| `observedAt`               | When TomTom produced the data (its `date` response header), not when we received it (L8 slide 9)                 |
| `route`                    | Name without TomTom's `CW_AU_` prefix, length, current and typical travel time, delay, and whether it's passable |
| `segments[].id`            | TomTom's segment id, a string because the number exceeds JavaScript's safe integer range                         |
| `segments[]` speeds        | Current, average and typical speed in km/h, and current speed as a percentage of free-flow speed                 |
| `segments[].confidencePct` | TomTom's confidence in the reading, 0–100                                                                        |
| `segments[].coordinates`   | GeoJSON `[longitude, latitude]` pairs, converted from TomTom's `{latitude, longitude}` objects                   |

The state message is the observation plus what the backend derives: a congestion level per segment (free, light, moderate, heavy or closed) and `route.congestedSince`, which is when the route became congested, or `null`.

## Backend

For each observation, the backend:

1. Validates it and drops duplicates by `eventId`.
2. Classifies each segment with today's `classifyCongestion` thresholds.
3. Marks the route congested after several congested readings in a row, and clears it the same way, so the status doesn't flap.
4. Saves the geometry if it changed, the latest state if it's newer than what's stored, and the reading in the hourly history.
5. Publishes the route's state, retained.

| Problem (L8 slide 35)                              | Fix                                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| Duplicate deliveries from QoS 1 or adapter retries | Deterministic `eventId` and unique keys                                     |
| An older reading arriving after a newer one        | State is written only if `observedAt` is newer; the browser checks the same |
| Overload                                           | The broker buffers; MQTT 5 Receive Maximum caps unacknowledged messages     |
| Two writers to the same data                       | Only the backend writes traffic data                                        |

## Shared subscriptions

With a normal subscription, three backend copies would each get every reading. Subscribing to `$share/backend/greenwave/v1/+/routes/+/observations` makes the copies one group, and the broker gives each message to only one of them (MQTT 5 specification, section 4.8.2). Publishers don't change.

- Browsers subscribe normally, because every open map needs every update.
- If a copy dies holding a message, the broker can hand it to another copy. That's one more reason duplicates are dropped by `eventId`.
- Mosquitto hands out messages round-robin, so one route's readings land on different copies and step 3 can't keep them in memory. Either split cities between copies, or keep each route's recent readings in Postgres and update them in a transaction (L8 slide 34). We start with one copy.

## Deployment

| Service          | What it is                                                | Host port                     |
| ---------------- | --------------------------------------------------------- | ----------------------------- |
| `postgres`       | Already in `docker-compose.yml`                           | 5432                          |
| `mosquitto`      | The broker                                                | 1883 (MQTT), 9001 (WebSocket) |
| `migrate`        | Runs `prisma migrate deploy`, then exits                  | none                          |
| `adapter-aarhus` | City id, routes and TomTom key from environment variables | none                          |
| `backend`        | The MQTT consumer                                         | none                          |
| `frontend`       | The Next.js app, built from the existing `Dockerfile`     | 3000                          |

- Healthchecks and `depends_on` start the services in order; the backend and frontend wait for `migrate`.
- Services reach each other by name (`mqtt://mosquitto:1883`). The browser runs on the host and uses `ws://localhost:9001`.
- `docker compose up --scale backend=3` scales the backend, and a new city is a new `adapter-<city>` service.

```conf
# mosquitto.conf
listener 1883
listener 9001
protocol websockets

allow_anonymous true
password_file /mosquitto/config/passwords
acl_file /mosquitto/config/acl

persistence true
persistence_location /mosquitto/data/
```

```conf
# acl: rules before the first "user" line apply to anonymous clients (the browsers)
topic read greenwave/v1/+/routes/+/state
topic read greenwave/v1/+/adapter/status

user adapter-aarhus
topic write greenwave/v1/aarhus/#

user backend
topic readwrite greenwave/v1/#
```

Mosquitto checks these rules when it delivers a message, not when a client subscribes, so `$share` subscriptions need no rule of their own.

## Scalability

The system grows by adding instances where the load is (L7 slides 40–43):

| Growth     | Response                                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Cities     | One more adapter. Calls to a city's API grow with its routes, not with viewers                                                          |
| Messages   | One Mosquitto handles far more than this. Beyond that, bridge regional brokers or switch to a clustering broker, with no client changes |
| Processing | More backend copies on the shared subscription                                                                                          |
| Data       | Latest state is one row per segment; history is aggregated, with retention or partitioning later                                        |
| Viewers    | The broker fans out the retained state. For very large audiences, send geometry once and only speeds after that                         |

It holds up because every part under load is either stateless (adapters, frontend) or partitioned by a key it already has (city, route), and every part speaks one protocol and one message format.

In numbers: Aarhus produces 13 messages and about 250 KB a minute, which is trivial for Mosquitto. The real limits are TomTom's quota and Postgres. Per-minute history would be about 1.6 million rows a day for Aarhus alone, hence hourly aggregates (about 26,000 rows a day). Mosquitto tops out at one CPU core, but the backend and database hit their limits first (L7 slide 42). A load generator under a `loadtest` Compose profile can show this with measurements: messages per second, backend lag (now minus `observedAt`) and database write rate.

## Pros and cons

Pros:

- A new city is just a new adapter.
- Parts fail separately: the Last Will flags a dead adapter, the broker queues readings for a restarting backend, and the map keeps its last state.
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
- The history the backend records grows every day and is what predictions learn from. Hourly averages keep it small (about 26,000 rows a day for Aarhus); 5-minute averages would suit forecasting better (about 310,000). Which one to record is still open.
- Live data and Traffic Stats don't share ids, so comparing them needs a table mapping each live route to its Traffic Stats route.
- Prediction runs as a batch job that reads the history and writes forecasts to a table the frontend reads, so the map can show them beside the live state.
- The method isn't chosen. We start from what we have, the typical weekday from Traffic Stats and our own recorded history, and pick a method from there.

## Out of scope

A CoAP gateway and traffic signs, production deployment (TLS, broker login for browsers, backups) and broker clustering.

## Implementation overview

- [ ] **Workspace:** a pnpm workspace with `services/adapter`, `services/backend`, `packages/contracts` (message schemas, topics, and the congestion thresholds from `src/lib/traffic/serialization.ts`) and `packages/db` (Prisma).

- [ ] **Compose:** `mosquitto` with its config and access rules, `migrate`, `adapter-aarhus`, `backend` and `frontend`, with healthchecks.

- [ ] **Adapter:** move `src/lib/traffic/tomtom-service.ts` into it, poll each route every minute, and publish observations and the Last Will status.

- [ ] **Database:** city ids, a latest-state table, and averaged history instead of hourly samples, at the resolution prediction needs.

- [ ] **Backend:** shared subscription, validation, deduplication, classification, congestion status, Postgres writes and retained state.

- [ ] **Frontend:** first paint from Postgres, plus a hook that merges live state into the TanStack Query cache.

- [ ] **Clean-up:** remove the direct TomTom calls, `/api/traffic`, the Refresh and snapshot buttons, `TrafficSnapshot`, the cron route and workflow, `vercel.json` and `build-vercel`; update `README.md` and `CLAUDE.md`.

- [ ] **Load test:** a load generator under a `loadtest` profile, and measurements for the report.

- [ ] **Prediction:** a forecasts table, a first forecast job on the recorded history and Traffic Stats, and forecasts on the map.
