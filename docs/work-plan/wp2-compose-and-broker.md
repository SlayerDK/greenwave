# WP2 · Compose and the broker

**Bjoern · Mon 2 – Fri 6 Nov; wiring Thu 12 – Fri 13 Nov.** · [← Work plan](../WORK-PLAN.md)

Users, ports and variables are in [Libraries and connections](libraries-and-connections.md).

- [ ] `infra/mosquitto/mosquitto.conf` (_new_): the config in `ARCHITECTURE.md`, plus `max_queued_messages 5000` (the default 1,000 is only about 75 minutes of readings for a restarting backend) and `password_file /mosquitto/secrets/passwords`.
- [ ] `infra/mosquitto/acl` (_new_): the rules in `ARCHITECTURE.md`, plus anonymous read of `$SYS/broker/uptime` (healthcheck), and the `loadgen` and `monitor` users.
- [ ] `mosquitto-init`: a one-shot container that runs `mosquitto_passwd -c -b` for each user with passwords from `.env`, into a `mosquitto-secrets` volume, then `chown mosquitto:mosquitto` and `chmod 0700`. No password lands in git.
- [ ] `services/Dockerfile` (_new_): one Node 24 image for adapter, backend, predictor, loadgen and migrate. `pnpm install --frozen-lockfile`, generate Prisma, run each service with tsx.
- [ ] Frontend `Dockerfile`: copy `pnpm-workspace.yaml` and every workspace `package.json` before `pnpm install`; generate Prisma through the workspace filter. Migrations move to `migrate`, so the container only runs `node server.js`.
- [ ] `docker-compose.yml`: `mosquitto-init`, `mosquitto`, `migrate`, `adapter-aarhus`, `backend`, `predictor`, `frontend` beside `postgres`. No `container_name` on anything you want to scale.
- [ ] `db:up` / `db:down` in `package.json` start only `postgres` and `mosquitto`, for development.
- [ ] Check with `mosquitto_sub` / `mosquitto_pub` from the host, and an MQTT.js client over `ws://localhost:9001`.

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
    test: mosquitto_sub -t '$$SYS/broker/uptime' -C 1 -W 15
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

**Done when** `docker compose up` brings everything up healthy, and the broker and deployment sections have a draft.
