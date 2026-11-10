# WP2 · Compose and the broker

**bd-nis (broker); Bjoern (migrate and shared Dockerfile pattern) · Mon 2 – Fri 6 Nov; wiring Thu 12 – Fri 13 Nov.** · [← Work plan](../WORK-PLAN.md)

> **Implementation plan:** [01 · Broker](../implementation-plans/01-broker.md) and [02 · Migrate](../implementation-plans/02-migrate.md). They have the step-by-step detail for handing this off; this file keeps the owner, dates and summary.

Ownership updated 9 Nov: bd-nis owns [01 · Broker](../implementation-plans/01-broker.md), Bjoern keeps [02 · Migrate](../implementation-plans/02-migrate.md), and each service owner adds their own Compose block. The frontend image belongs to bd-nis under [05 phase B](../implementation-plans/05-frontend.md). Dates remain the original targets.

Users, ports and variables are in [Libraries and connections](libraries-and-connections.md).

- [x] `broker/mosquitto.conf` (_new_): the config in `ARCHITECTURE.md`, with `password_file /mosquitto/secrets/passwords`. Keep the default 1,000-message queue; the backend session expires after one hour.
- [x] `broker/acl` (_new_): anonymous reads of state/status and `$SYS/broker/uptime`; adapter writes only Aarhus observations/status; backend reads observations and writes state. No loadgen or monitor account.
- [x] `mosquitto-init`: a one-shot container that uses `mosquitto_passwd -c -b` for the first user and `-b` without `-c` for the second, with passwords from `.env`. Atomically install the file in `mosquitto-secrets`, owned by `mosquitto:mosquitto`, mode `0600`. No password lands in git.
- [ ] `database/Dockerfile` (_new_) for `migrate`, and the pattern every Node container's own Dockerfile copies: built from the repo root, `pnpm fetch`, an offline install filtered to the one package, only that package's sources copied, generate Prisma, run with `node --import tsx`.
- [ ] `frontend/Dockerfile`: the same pattern, plus `outputFileTracingRoot` now that the app is not at the root ([05](../implementation-plans/05-frontend.md) phase B). Migrations move to `migrate`, so the container only runs `node frontend/server.js`.
- [ ] `compose.yaml` (broker/init implemented; remaining service owners add their blocks, renamed from `docker-compose.yml`): `mosquitto-init`, `mosquitto`, `migrate`, `adapter-aarhus`, `backend`, `predictor`, `frontend` beside `postgres`. The required pipeline runs one backend; each service owner adds their own block.
- [x] `db:up` / `db:down` in `package.json` start only `postgres` and `mosquitto`, for development.
- [x] Broker checks: `pnpm broker:verify` passed all 28 checks on 10 Nov, using clients in the pinned image for MQTT and WebSocket, isolated from local services. Actual frontend/backend integration remains separate.

```yaml
mosquitto:
  image: eclipse-mosquitto:2.1.2-alpine
  depends_on:
    mosquitto-init: { condition: service_completed_successfully }
  ports: ["127.0.0.1:1883:1883", "127.0.0.1:9001:9001"]
  volumes:
    - ./broker/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro
    - ./broker/acl:/mosquitto/config/acl:ro
    - mosquitto-secrets:/mosquitto/secrets:ro
    - mosquitto-data:/mosquitto/data
  healthcheck:
    test: ["CMD-SHELL", "mosquitto_sub -t '$$SYS/broker/uptime' -C 1 -W 15"]
    interval: 10s
    timeout: 20s
    retries: 5

migrate:
  build: { context: ., dockerfile: database/Dockerfile }
  environment:
    DATABASE_URL: postgresql://greenwave:greenwave@postgres:5432/greenwave
  depends_on:
    postgres: { condition: service_healthy }

backend:
  build: { context: ., dockerfile: backend/Dockerfile }
  init: true # the Dockerfile runs node directly; init forwards SIGTERM
  environment: # only what the service reads, never the whole .env
    DATABASE_URL: postgresql://greenwave:greenwave@postgres:5432/greenwave
    MQTT_URL: mqtt://mosquitto:1883
    BACKEND_CLIENT_ID: backend-1
    MQTT_BACKEND_PASSWORD: ${MQTT_BACKEND_PASSWORD:?set it in .env}
  depends_on:
    mosquitto: { condition: service_healthy }
    migrate: { condition: service_completed_successfully }
  restart: unless-stopped
```

**Done when** long-running services are healthy, init/migrate exit 0, and [01](../implementation-plans/01-broker.md)'s permission, restart, WebSocket and credential checks pass. Broker and deployment drafts follow their separate WP9 owners. Password changes also require recreating affected client containers; see 01's operations section.
