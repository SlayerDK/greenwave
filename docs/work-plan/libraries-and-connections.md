# Libraries and connections

Reference for every work package. · [← Work plan](../WORK-PLAN.md)

## Libraries and tools

| What                                                | Version | Get it                                                                                                       | Used by                             |
| --------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| MQTT.js (`mqtt`)                                    | 5.16    | `pnpm add mqtt --filter <package>` · [docs](https://github.com/mqttjs/MQTT.js)                               | adapter, backend, loadgen, frontend |
| Eclipse Mosquitto                                   | 2.1.2   | image `eclipse-mosquitto:2.1.2-alpine` · [config reference](https://mosquitto.org/man/mosquitto-conf-5.html) | broker                              |
| PostgreSQL                                          | 18      | image `postgres:18.6-alpine`, pinned in [00](../implementation-plans/00-foundation.md)                       | everything                          |
| Prisma, `@prisma/adapter-pg`, `pg`                  | 7.10.x  | in use; pin 7.10, since npm's `latest` is an 8.0 RC · [docs](https://www.prisma.io/docs)                     | `database/`                         |
| Zod                                                 | 4.6     | in use                                                                                                       | contracts, service settings         |
| pino                                                | 10.4    | `pnpm add pino --filter <service>`; `pino-pretty` locally · [getpino.io](https://getpino.io)                 | services                            |
| croner                                              | 11      | `pnpm add croner --filter @greenwave/predictor` · [GitHub](https://github.com/Hexagon/croner)                | predictor                           |
| tsx                                                 | 4.23    | in use; `pnpm add -D tsx --filter <service>`                                                                 | runs services, `tsx watch` in dev   |
| Vitest                                              | 4.1     | in use · [projects guide](https://vitest.dev/guide/projects)                                                 | tests                               |
| Next.js 16, Mapbox GL, react-map-gl, TanStack Query | in use  | read `node_modules/next/dist/docs/` before changing Next code (`AGENTS.md`)                                  | frontend                            |
| Docker Desktop                                      | current | [docker.com](https://www.docker.com/products/docker-desktop/)                                                | everyone                            |
| MQTTX (optional)                                    | current | [mqttx.app](https://mqttx.app)                                                                               | poking at the broker                |

The [MQTT 5 specification](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html) covers shared subscriptions (§4.8.2), message expiry and session expiry.

## Topics

| Topic                                               | Publisher                 | Subscribers                     | QoS                    | Flags                      |
| --------------------------------------------------- | ------------------------- | ------------------------------- | ---------------------- | -------------------------- |
| `greenwave/v1/{city}/routes/{routeId}/observations` | adapter                   | backend, via `$share/backend/…` | 1                      | —                          |
| `greenwave/v1/{city}/routes/{routeId}/state`        | backend                   | browsers                        | 1 out, browsers take 0 | retained, expires in 300 s |
| `greenwave/v1/{city}/adapter/status`                | adapter and its Last Will | browsers                        | 1                      | retained                   |

## MQTT users

| User                              | May                                          | Password                |
| --------------------------------- | -------------------------------------------- | ----------------------- |
| anonymous (browsers, healthcheck) | read state, status and `$SYS/broker/uptime`  | none                    |
| `adapter-aarhus`                  | write `greenwave/v1/aarhus/#`                | `MQTT_ADAPTER_PASSWORD` |
| `backend`                         | read and write `greenwave/v1/#`              | `MQTT_BACKEND_PASSWORD` |
| `loadgen`                         | write `greenwave/v1/+/routes/+/observations` | `MQTT_LOADGEN_PASSWORD` |
| `monitor`                         | read `$SYS/#`                                | `MQTT_MONITOR_PASSWORD` |

## Ports

Frontend 3000, Postgres 5432, MQTT 1883, MQTT over WebSocket 9001. Inside Compose, services use names (`postgres:5432`, `mqtt://mosquitto:1883`); the browser uses `ws://localhost:9001`.

## Environment

All listed in `.env.example`.

| Variable                                                          | Used by                                   | Value                                                                                    |
| ----------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                    | frontend, backend, predictor, migrate     | `postgres:5432` in Compose, `localhost` in `.env` for `pnpm dev`                         |
| `MQTT_URL`                                                        | adapter, backend, loadgen                 | `mqtt://mosquitto:1883`                                                                  |
| `MQTT_WS_URL`                                                     | frontend, handed to the browser           | `ws://localhost:9001`                                                                    |
| `MQTT_*_PASSWORD`                                                 | `mosquitto-init` and the matching service | random strings                                                                           |
| `CITY_ID`, `ROUTE_IDS`, `POLL_INTERVAL_SECONDS`, `ADAPTER_SOURCE` | adapter                                   | `aarhus`, the 13 ids, `60`, `fixture` in development                                     |
| `BACKEND_CLIENT_ID`                                               | backend                                   | optional; defaults to `backend-<hostname>` ([04](../implementation-plans/04-backend.md)) |
| `CITY_IDS`, `FORECAST_TAU_MINUTES`, `HISTORY_DAYS`                | predictor                                 | `aarhus`, from the backtest (`60` until then), `28`                                      |
| `RATE`, `DURATION_SECONDS`, `CITY_COUNT`                          | loadgen                                   | per scenario ([07](../implementation-plans/07-loadgen.md))                               |
| `SKIP_ENV_VALIDATION`                                             | frontend image build only                 | `1` in the `Dockerfile`'s builder stage                                                  |
| `TOMTOM_API_KEY`                                                  | adapter, frozen Vercel app                | only where the live adapter runs or fixtures are recorded                                |
| `MAPBOX_PUBLIC_TOKEN`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`    | frontend                                  | as today                                                                                 |
| `CRON_SECRET`                                                     | frozen Vercel app only                    | leaves the app's env in [WP8](wp8-clean-up.md)                                           |

## Startup order

1. `postgres` healthy → `migrate` runs and exits.
2. `mosquitto-init` writes the passwords → `mosquitto` healthy.
3. `adapter-aarhus`, `backend`, `predictor` and `frontend` start.

In development, `pnpm db:up` starts postgres and mosquitto; run each service with `pnpm --filter @greenwave/<name> dev` and the app with `pnpm dev`.
