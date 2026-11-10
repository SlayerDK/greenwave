# Local MQTT broker

Mosquitto `2.1.2-alpine` is implemented. The adapter, backend and live frontend remain separate work packages. No broker deployment or production exposure is configured here.

## Start

Set `MQTT_ADAPTER_PASSWORD` and `MQTT_BACKEND_PASSWORD` in the root `.env`, generating each separately with `openssl rand -hex 16`. Do not commit `.env` or log its contents.

```sh
pnpm db:up
docker compose up -d --wait postgres mosquitto
```

`mosquitto-init` must exit successfully before the broker starts. It atomically installs both password hashes into the secrets volume, owned by `mosquitto`, mode `0600`. A missing or empty password does not replace the working file. The existing Postgres service and data volume are unchanged.

| Client             | Connection              | Permissions                                       |
| ------------------ | ----------------------- | ------------------------------------------------- |
| Host tools         | `mqtt://localhost:1883` | Use the relevant role below                       |
| Compose services   | `mqtt://mosquitto:1883` | Use the relevant role below                       |
| Anonymous browsers | `ws://localhost:9001`   | Read state, adapter status and broker uptime only |
| `adapter-aarhus`   | `MQTT_ADAPTER_PASSWORD` | Write Aarhus observations and adapter status only |
| `backend`          | `MQTT_BACKEND_PASSWORD` | Read observations, write state only               |

The same authentication and ACL apply to TCP and WebSocket. Host MQTT ports bind only to `127.0.0.1`. Anonymous traffic access is intentional and independent of the application's login. This is local-only, with no TLS. See [`acl`](acl) for exact topics.

## Verify

```sh
pnpm broker:verify
```

Requires Docker Compose 2.24.4+, Node 24 and the two pinned Docker images. No host MQTT client, `.env`, application services, database migrations or extra package installation is needed. The script uses the root `compose.yaml` with a small [test-only override](verify.compose.yaml), retaining the real config, ACL, init script and healthchecks. The override clears the fixed Postgres container name and host port and replaces the MQTT host ports with ephemeral loopback ports. A unique Compose project provides fresh volumes and random test passwords. The script starts only Postgres/init/broker, never teammates' services or existing data volumes. Compose handles the override directly instead of the verifier constructing a second configuration. The script saves Compose's resolved result privately for the run so concurrent edits cannot change startup or cleanup.

The bounded checks cover both logins; anonymous state/status reads; observation privacy; role and city publish denials with MQTT 5 PUBACK reason 135; wrong credentials; WebSocket reads and denials; retained expiry; a retained message and an already-subscribed offline QoS 1 session through graceful restart; password-file permissions; init reruns; and missing/empty-secret failure without replacing the file. The script fails on an unexpected exit or payload, then removes its own containers, volumes and network and verifies cleanup. Test secrets are redacted from errors.

These probes are not a running adapter/backend or browser UI test. Actual Last Will behaviour, backend recreation and end-to-end persistence are still the service owners' integration work. See [plan 01](../docs/implementation-plans/01-broker.md#tests) for manual probes and [the report draft](../docs/report/broker.md) for recorded results and limits.

## Operate

- After a config or ACL edit, restart Mosquitto and wait for health.
- After editing a password in `.env`, run `docker compose run --rm --no-deps mosquitto-init`, then `docker compose restart mosquitto` and `docker compose up -d --wait mosquitto`. Recreate affected adapter/backend containers once implemented so their environment picks up the new password. A simple client restart does not update it.
- `pnpm db:down` runs `docker compose down`, stopping this Compose project without removing its named volumes. Do not add `--volumes` to normal shutdowns.
- The one backend uses fixed client ID `backend-1`, a normal observations subscription and a 3,600-second session expiry. Recovery starts only after its first successful subscription, below the default 1,000-message queue limit. Readings before that subscription, overflow and expired sessions are not recovered.
- Retained state and sessions survive a graceful broker restart. A crash can lose changes since the last persistence save, configured every 60 seconds. There is no power-loss or end-to-end exactly-once guarantee.
