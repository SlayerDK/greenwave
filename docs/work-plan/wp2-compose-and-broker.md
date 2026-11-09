# WP2 · Compose and the broker

**Bjoern · Mon 2 – Fri 6 Nov; wiring Thu 12 – Fri 13 Nov.** · [← Work plan](../WORK-PLAN.md)

> **Implementation plan:** [01 · Broker](../implementation-plans/01-broker.md) and [02 · Migrate](../implementation-plans/02-migrate.md). They have the step-by-step detail for handing this off; this file keeps the owner, dates and summary.

Users, ports and variables are in [Libraries and connections](libraries-and-connections.md).

- [ ] `broker/mosquitto.conf` (_new_): the config in `ARCHITECTURE.md`, plus `max_queued_messages 5000` (the default 1,000 is only about 75 minutes of readings for a restarting backend) and `password_file /mosquitto/secrets/passwords`.
- [ ] `broker/acl` (_new_): the rules in `ARCHITECTURE.md`, plus anonymous read of `$SYS/broker/uptime` (healthcheck), and the `loadgen` and `monitor` users.
- [ ] `mosquitto-init`: a one-shot container that runs `mosquitto_passwd -c -b` for each user with passwords from `.env`, into a `mosquitto-secrets` volume, then `chown mosquitto:mosquitto` and `chmod 0700`. No password lands in git.
- [x] `database/Dockerfile` (_new_) for `migrate`, and the pattern every Node container's own Dockerfile copies: built from the repo root, `pnpm fetch`, an offline install filtered to the one package, only that package's sources copied, generate Prisma, run with `node --import tsx`.
- [ ] `frontend/Dockerfile`: the same pattern, plus `outputFileTracingRoot` now that the app is not at the root ([05](../implementation-plans/05-frontend.md) phase B). Migrations move to `migrate`, so the container only runs `node frontend/server.js`.
- [ ] `compose.yaml` (renamed from `docker-compose.yml`): `mosquitto-init`, `mosquitto`, `migrate`, `adapter-aarhus`, `backend`, `predictor`, `frontend` beside `postgres`. No `container_name` on anything you want to scale.
- [ ] `db:up` / `db:down` in `package.json` start only `postgres` and `mosquitto`, for development.
- [ ] Check with `mosquitto_sub` / `mosquitto_pub` from the host, and an MQTT.js client over `ws://localhost:9001`.

```yaml
mosquitto:
  image: eclipse-mosquitto:2.1.2-alpine
  depends_on:
    mosquitto-init: { condition: service_completed_successfully }
  ports: ["1883:1883", "9001:9001"]
  volumes:
    - ./broker/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro
    - ./broker/acl:/mosquitto/config/acl:ro
    - mosquitto-secrets:/mosquitto/secrets
    - mosquitto-data:/mosquitto/data
  healthcheck:
    test: mosquitto_sub -t '$$SYS/broker/uptime' -C 1 -W 15
    interval: 10s

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
    MQTT_BACKEND_PASSWORD: ${MQTT_BACKEND_PASSWORD:?set it in .env}
  depends_on:
    mosquitto: { condition: service_healthy }
    migrate: { condition: service_completed_successfully }
  restart: unless-stopped
```

**Done when** `docker compose up` brings everything up healthy, and the broker and deployment sections have a draft.
