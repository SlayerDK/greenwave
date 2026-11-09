# 07 · Load generator: `loadgen`

**Compose service `loadgen` under the `loadtest` profile, package `@greenwave/loadgen` in `loadgen/`, plus measurement scripts.** [WP7](../work-plan/wp7-load-tests.md) · Bjoern · 16–27 Nov · Needs [03](03-adapter.md) (scenario 1 and the resilience checks), [04](04-backend.md) (metrics line) · Unblocks the scalability report section and the demo's resilience steps. · [← Plans](README.md)

## Goal

Show with measurements where the pipeline's limits are and that it scales by adding backend copies, and prove the resilience claims in [`ARCHITECTURE.md`](../../ARCHITECTURE.md): nothing lost or doubled across restarts, a dead adapter is flagged, a stalled pipeline shows no data rather than stale data.

## Read first

- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) → _Scalability_, _Shared subscriptions_, _Pros and cons_.
- [04 · Backend](04-backend.md) → _Metrics_ (the log line this plan parses) and _Pitfalls_ (sessions and shared subscriptions).
- [00 · Foundation](00-foundation.md) → `observationSchema`, `toEventId`, and the observation fixture.
- [01 · Broker](01-broker.md) → the `loadgen` and `monitor` users.

## Interfaces

| Direction | What                                                                              |
| --------- | --------------------------------------------------------------------------------- |
| In        | `shared/src/fixtures/observation-56634.json`, read from disk                      |
| Out       | `greenwave/v1/load-NN/routes/{routeId}/observations`, QoS 1, `source: "loadtest"` |
| Reads     | the backend's metrics lines, `pg_stat_database`, `$SYS/broker/load/#`             |
| Out       | CSVs and charts under `docs/report/loadtest/`                                     |

| Variable                | Value                                             |
| ----------------------- | ------------------------------------------------- |
| `MQTT_URL`              | `mqtt://mosquitto:1883` in Compose                |
| `MQTT_LOADGEN_PASSWORD` | the `loadgen` user's password                     |
| `RATE`                  | messages per second, e.g. `50`                    |
| `DURATION_SECONDS`      | e.g. `300`                                        |
| `CITY_COUNT`            | synthetic cities `load-01` … `load-NN`, e.g. `10` |

## Files

```
loadgen/
  Dockerfile  package.json  tsconfig.json
  src/env.ts  src/generate.ts  src/main.ts  src/generate.test.ts
loadgen/scripts/
  run-scenario.sh          one scenario end to end; writes a timestamped folder
  backend-metrics.sh       docker compose logs → backend.csv
  pg-commits.sh            pg_stat_database every 10 s → db.csv
  broker-load.sh           $SYS as `monitor` → broker.csv
  charts.ts                CSVs → SVG charts (or a spreadsheet; see below)
compose.yaml         loadgen with profiles: ["loadtest"]
docs/report/loadtest/      results, committed
```

## Steps

### 1 · The generator

- [ ] `generate.ts`, pure: read 00's observation fixture once (by path, with `fs`; a service may not import another service's code, so not the adapter's normalizer) and use it as the template for every message. For message _n_, pick city `load-${pad(1 + n % CITY_COUNT)}` and route `r${pad(1 + Math.floor(n / CITY_COUNT) % 13)}`, which gives 13 routes per city like Aarhus; set `observedAt` to the current time **with milliseconds**, `source: "loadtest"`, and `eventId = toEventId(cityId, routeId, observedAt)`. Parse with `observationSchema` once per fixture in a test, not per message.
  - Milliseconds matter: above one message a second per route, a second-resolution `observedAt` would repeat an `eventId`, the backend would drop the copy as a duplicate, and the measurement would undercount.
- [ ] `main.ts`: connect as `loadgen` (MQTT 5, `clean: true`), then publish at `RATE` per second for `DURATION_SECONDS`, paced in 100 ms batches so the rate is even. Await each `publishAsync` (QoS 1), so the generator itself feels backpressure. Every 10 s print a CSV line to stdout: `t,sent,acked,ratePerS`. Exit 0 at the end.
- [ ] The backend writes these readings' history and state, so the test covers the full write path. Their routes and segments appear under `load-*` cities, which is why the load test runs as a separate Compose project with its own volumes.

### 2 · Compose

- [ ] `loadgen/Dockerfile`: [02](02-migrate.md#the-dockerfile-pattern)'s pattern, copying `shared/` and `loadgen/`, with `--filter "@greenwave/loadgen..."`, `WORKDIR /app/loadgen` and `CMD ["node", "--import", "tsx", "src/main.ts"]`.
- [ ] `compose.yaml`:

  ```yaml
  loadgen:
    profiles: ["loadtest"]
    build: { context: ., dockerfile: loadgen/Dockerfile }
    init: true # forwards SIGTERM to node and reaps children
    environment:
      MQTT_URL: mqtt://mosquitto:1883
      MQTT_LOADGEN_PASSWORD: ${MQTT_LOADGEN_PASSWORD:?set it in .env}
      RATE: ${RATE:-10}
      DURATION_SECONDS: ${DURATION_SECONDS:-300}
      CITY_COUNT: ${CITY_COUNT:-10}
    depends_on:
      mosquitto: { condition: service_healthy }
  ```

- [ ] Run it as its own project, naming the services so the adapter and frontend stay down (no TomTom calls, no port 3000):

  ```bash
  docker compose down                      # the dev stack: the load test binds the same host ports
  RATE=50 docker compose -p greenwave-loadtest --profile loadtest up --scale backend=3 \
    postgres mosquitto-init mosquitto migrate backend loadgen
  docker compose -p greenwave-loadtest down -v   # afterwards: drop its volumes
  ```

### 3 · Measurements

Each script writes a CSV with a `t` column in seconds since the scenario started, so the four line up in one chart.

- [ ] `backend-metrics.sh`: `docker compose -p greenwave-loadtest logs --no-log-prefix -f backend | jq -r 'select(.msg=="metrics") | …'` → `t,copy,processed,duplicates,lagP50Ms,lagP95Ms`. With three copies, keep each copy's lines (the container name is in the `docker compose logs` prefix if you drop `--no-log-prefix`; parse it).
- [ ] `pg-commits.sh`: every 10 s, `SELECT xact_commit FROM pg_stat_database WHERE datname = 'greenwave'`, and write the difference: `t,commitsPerS`.
- [ ] `broker-load.sh`: `mosquitto_sub -u monitor -P "$MQTT_MONITOR_PASSWORD" -t '$SYS/broker/load/messages/received/1min' -t '$SYS/broker/load/messages/sent/1min' -v` → `t,receivedPerMin,sentPerMin`.
- [ ] `run-scenario.sh <name> <rate> <backends>`: starts the stack, the three collectors and the generator; waits for the generator to exit plus 60 s of drain; stops the collectors; writes everything to `docs/report/loadtest/<name>-<timestamp>/`.
- [ ] Charts: lag p95 against offered rate, one line per backend count; DB commits/s against rate; processed/s against sent/s. A small `charts.ts` emitting SVG is fine, as is a spreadsheet; commit the images either way.

### 4 · Scenarios

1. **Aarhus as is:** the real adapter in fixture mode, 13 messages a minute, one backend. The baseline: lag and commits at rest.
2. **Ramp, one backend:** 10, 25, 50, 100, 200 msg/s, 5 minutes each, until lag keeps growing within a step. That rate is the single-copy limit.
3. **Ramp, three backends:** the same steps with `--scale backend=3`. Expect a higher limit, until Postgres is the bottleneck (watch commits/s flatten).
4. **Restart under load:** 50 msg/s, `docker compose -p greenwave-loadtest restart backend` halfway. Then check:

   ```sql
   SELECT count(*) FROM traffic_observation_receipt;           -- = messages acked by loadgen
   SELECT max("sampleCount") FROM traffic_segment_history;      -- no bucket above its real readings
   ```

   With three copies, restart one and expect about a third of the messages to be **delayed** until it returns (Mosquitto queues them on its persistent session; see [04](04-backend.md)'s pitfalls), not lost. Record the delay.

### 5 · Resilience checks (also in the demo)

Run against the normal stack (`docker compose up`), not the load-test project.

- [ ] `mosquitto_sub -v -t 'greenwave/v1/#' -u backend -P "$MQTT_BACKEND_PASSWORD"` shows every message; the same without `-u` shows only state and status.
- [ ] `docker compose kill adapter-aarhus`: the status turns `offline` within about 25 s and the map shows its banner.
- [ ] `docker compose restart backend`: nothing lost or doubled (the scenario 4 queries, against the receipts the adapter's log says it published).
- [ ] Adapter and backend stopped for 5 minutes: retained state expires, a newly opened map shows no live state, and an already open one turns grey.

Write each check's commands and what you saw into `docs/report/loadtest/resilience.md`; the demo script reuses it.

## Tests

- `generate.test.ts`: messages pass `observationSchema`; `eventId`s are unique across 10,000 messages generated within the same second; cities and routes cycle as described; `source` is always `loadtest`.

## Pitfalls

- **Host ports.** `-p greenwave-loadtest` gives separate containers and volumes but the same host ports (5432, 1883, 9001). Stop the dev stack first.
- **Never point the load generator at the dev database.** Its `load-*` routes would show up on nobody's map, but in the history the predictor reads.
- **Measure the backend, not the laptop.** Close other heavy programs, note the machine in the report, and run each scenario twice.
- Mosquitto's `$SYS` load figures are per minute, averaged; the first minute of each step is warm-up.

## Done when

- [ ] Scenarios 1–4 have CSVs and the charts exist under `docs/report/loadtest/`.
- [ ] The resilience checks pass and are written up.
- [ ] The scalability and load-test report section has a draft ([WP9](../work-plan/wp9-report-and-demo.md)).

## Not in this plan

- Fixing what the load test finds in the backend: a PR against [04](04-backend.md)'s code, reviewed by its owner.
