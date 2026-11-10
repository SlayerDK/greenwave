# 01 · Broker: `mosquitto-init` and `mosquitto`

**Compose services `mosquitto-init` (one-shot) and `mosquitto`.** [WP2](../work-plan/wp2-compose-and-broker.md) · bd-nis · original target 2–6 Nov, wiring 12–13 Nov · Needs nothing · Unblocks [03](03-adapter.md), [04](04-backend.md), [05](05-frontend.md). · [← Plans](README.md)

## Goal

One local Mosquitto 2.1.2 broker, one Aarhus adapter and one backend. Services use `mqtt://mosquitto:1883` inside Compose; host tools use `mqtt://localhost:1883`; browsers use `ws://localhost:9001`. Publish both host ports on `127.0.0.1` only. Each service has its own user, browsers have anonymous read-only access, and retained state and sessions survive a graceful broker restart. No password goes in Git.

This is the limited scope approved on 9 Nov. No shared subscriptions, multiple backend workers, load-generator or monitor accounts, queue tuning, TLS, cloud hosting or clustering. The existing prediction and frontend plans are unchanged. [WP7](../work-plan/wp7-load-tests.md) supplies focused failure evidence and scalability reasoning, not a new service.

## Read first

- [`ARCHITECTURE.md`](../../ARCHITECTURE.md), MQTT design and deployment.
- [Libraries and connections](../work-plan/libraries-and-connections.md), users, ports and variables.
- `compose.yaml` and `package.json`. Postgres and the broker are implemented in Compose; other services remain with their owners.
- [Mosquitto configuration](https://mosquitto.org/man/mosquitto-conf-5.html), [client options](https://mosquitto.org/man/mosquitto_sub-1.html), and [Docker port publishing](https://docs.docker.com/reference/compose-file/services/#ports).

## Interfaces

| Provides                                                  | Consumer                            |
| --------------------------------------------------------- | ----------------------------------- |
| `mqtt://mosquitto:1883` / `mqtt://localhost:1883`         | adapter and backend / host tools    |
| `ws://localhost:9001`                                     | browsers                            |
| User `adapter-aarhus`                                     | `MQTT_ADAPTER_PASSWORD` from `.env` |
| User `backend`                                            | `MQTT_BACKEND_PASSWORD` from `.env` |
| Anonymous reads of state, status and `$SYS/broker/uptime` | browsers and healthcheck            |

The backend uses a normal `greenwave/v1/+/routes/+/observations` subscription and the fixed client ID `backend-1`, including after container recreation. Only one backend may use this broker. See [04](04-backend.md).

## Files

```text
broker/mosquitto.conf   new
broker/acl              new
broker/init.sh          creates the password file
broker/verify.mjs       reproducible isolated acceptance checks
broker/README.md        setup, operations and verification
docs/report/broker.md   broker report draft
compose.yaml           broker services and volumes
package.json           db:up / db:down
.env.example           two passwords and connection URLs
```

## Steps

- [x] `broker/mosquitto.conf`:

  ```conf
  listener 1883
  protocol mqtt

  listener 9001
  protocol websockets

  # Global auth applies to both listeners. Anonymous clients are read-only by ACL.
  allow_anonymous true
  password_file /mosquitto/secrets/passwords
  acl_file /mosquitto/config/acl

  persistence true
  persistence_location /mosquitto/data/
  autosave_interval 60

  # Keep the default queue limit of 1,000 per client. No custom tuning.
  sys_interval 10
  log_dest stdout
  log_type error
  log_type warning
  log_type notice
  log_type information
  ```

- [x] `broker/acl`. Rules before the first `user` apply to anonymous clients. Give each publisher only its actual outputs:

  ```conf
  topic read greenwave/v1/+/routes/+/state
  topic read greenwave/v1/+/adapter/status
  topic read $SYS/broker/uptime

  user adapter-aarhus
  topic write greenwave/v1/aarhus/routes/+/observations
  topic write greenwave/v1/aarhus/adapter/status

  user backend
  topic read greenwave/v1/+/routes/+/observations
  topic write greenwave/v1/+/routes/+/state
  ```

  The status write rule also authorizes the adapter's retained Last Will. The adapter cannot publish processed state; the backend cannot publish observations or impersonate the adapter's status.

- [x] `broker/init.sh`, run by `mosquitto-init`:

  ```sh
  #!/bin/sh
  set -eu
  umask 077

  # Reject either missing/empty secret before touching the working password file.
  for name in MQTT_ADAPTER_PASSWORD MQTT_BACKEND_PASSWORD; do
    case "$name" in
      MQTT_ADAPTER_PASSWORD) password=${MQTT_ADAPTER_PASSWORD:-} ;;
      MQTT_BACKEND_PASSWORD) password=${MQTT_BACKEND_PASSWORD:-} ;;
    esac
    [ -n "$password" ] || { echo "empty password: $name" >&2; exit 1; }
  done
  unset password

  file=/mosquitto/secrets/passwords
  dir=$(mktemp -d /mosquitto/secrets/.init.XXXXXX)
  tmp="$dir/passwords"
  trap 'rm -f "$tmp"; rmdir "$dir"' EXIT
  trap 'exit 1' HUP INT TERM

  # -c is only for the first account. Install both users together, atomically.
  mosquitto_passwd -c -b "$tmp" adapter-aarhus "$MQTT_ADAPTER_PASSWORD"
  mosquitto_passwd -b "$tmp" backend "$MQTT_BACKEND_PASSWORD"
  chown mosquitto:mosquitto "$tmp"
  chmod 0600 "$tmp"
  mv "$tmp" "$file"
  ```

  Use a private temporary directory and `-c` only for the first account. With the pinned image, repeating `-c` refuses the existing file and leaves later accounts uncreated. Rerunning this script replaces the complete file atomically; an empty password fails before replacing the working file.

- [x] Merge these services and root-level volumes into `compose.yaml`; preserve the existing `postgres` service and volume. The snippet is a Compose fragment, not a replacement file:

  ```yaml
  services:
    mosquitto-init:
      image: eclipse-mosquitto:2.1.2-alpine
      entrypoint: ["/bin/sh", "/init.sh"]
      user: root
      environment:
        MQTT_ADAPTER_PASSWORD: ${MQTT_ADAPTER_PASSWORD:?set it in .env}
        MQTT_BACKEND_PASSWORD: ${MQTT_BACKEND_PASSWORD:?set it in .env}
      volumes:
        - ./broker/init.sh:/init.sh:ro
        - mosquitto-secrets:/mosquitto/secrets

    mosquitto:
      image: eclipse-mosquitto:2.1.2-alpine
      restart: unless-stopped
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

  volumes:
    mosquitto-secrets:
    mosquitto-data:
  ```

- [x] `package.json`: `"db:up": "docker compose up -d postgres mosquitto"`; `"db:down": "docker compose down"`; `"broker:verify": "node broker/verify.mjs"`.
- [x] Add to `.env.example`:

  ```bash
  MQTT_URL="mqtt://localhost:1883"
  MQTT_WS_URL="ws://localhost:9001"
  MQTT_ADAPTER_PASSWORD=""
  MQTT_BACKEND_PASSWORD=""
  BACKEND_CLIENT_ID="backend-1"
  ```

  Generate the two passwords separately with `openssl rand -hex 16`. Each teammate sets their own `.env`. [04](04-backend.md) passes the fixed client ID into the backend container.

## Tests

`pnpm broker:verify` automates these checks against the actual Compose configuration in a disposable project, including Postgres health, file permissions, init reruns, missing/empty-secret rejection, role/city denials and cleanup. It generates test credentials and requires no `.env`. See [`broker/README.md`](../../broker/README.md).

The manual probes below are an alternative. Run against a disposable local broker with adapter/backend services stopped; these probe payloads are not production traffic. Use the clients inside the pinned image, so no host installation or scratch Node package is needed. Paste results, never credentials, in the PR.

```bash
source .env
mqtt_pub() { docker compose exec -T mosquitto mosquitto_pub -h localhost -V mqttv5 "$@"; }
mqtt_sub() { docker compose exec -T mosquitto mosquitto_sub -h localhost -V mqttv5 "$@"; }
state=greenwave/v1/aarhus/routes/broker-check/state
observation=greenwave/v1/aarhus/routes/broker-check/observations

# 1. Anonymous can read retained state, but cannot read observations.
mqtt_pub -u backend -P "$MQTT_BACKEND_PASSWORD" -q 1 -r -t "$state" -m visible
mqtt_sub -t "$state" -C 1 -W 5                         # visible
mqtt_pub -u adapter-aarhus -P "$MQTT_ADAPTER_PASSWORD" -q 1 -r -t "$observation" -m private
mqtt_sub -t "$observation" -W 2                       # no payload; timeout exit 27

# 2. Each denied publish must report PUBACK reason 135 (0x87), not a network error.
mqtt_pub -q 1 -d -t "$state" -m denied                # anonymous cannot write
mqtt_pub -u adapter-aarhus -P "$MQTT_ADAPTER_PASSWORD" -q 1 -d -t "$state" -m denied
mqtt_pub -u adapter-aarhus -P "$MQTT_ADAPTER_PASSWORD" -q 1 -d \
  -t greenwave/v1/odense/routes/broker-check/observations -m denied
mqtt_pub -u backend -P "$MQTT_BACKEND_PASSWORD" -q 1 -d -t "$observation" -m denied

# 3. Wrong credentials are refused, not treated as anonymous.
mqtt_sub -u backend -P deliberately-wrong -t "$observation" -W 2

# 4. Retained expiry: visible immediately, absent after expiry.
mqtt_pub -u backend -P "$MQTT_BACKEND_PASSWORD" -q 1 -r -t "$state" -m expires \
  -D publish message-expiry-interval 2
mqtt_sub -t "$state" -C 1 -W 2                         # expires
sleep 3
mqtt_sub -t "$state" -W 2                             # no payload; exit 27

# 5. Retained state AND an offline persistent session survive a graceful restart.
# Remove the temporary retained observation before creating the session.
mqtt_pub -u adapter-aarhus -P "$MQTT_ADAPTER_PASSWORD" -q 1 -r -n -t "$observation"
mqtt_pub -u backend -P "$MQTT_BACKEND_PASSWORD" -q 1 -r -t "$state" -m kept
mqtt_sub -u backend -P "$MQTT_BACKEND_PASSWORD" -q 1 -c -x 3600 \
  -i broker-check-backend -t "$observation" -E -W 5
mqtt_pub -u adapter-aarhus -P "$MQTT_ADAPTER_PASSWORD" -q 1 -t "$observation" -m queued
docker compose restart mosquitto
docker compose up -d --wait mosquitto                  # wait for healthy, not just started
mqtt_sub -t "$state" -C 1 -W 5                         # kept
mqtt_sub -u backend -P "$MQTT_BACKEND_PASSWORD" -q 1 -c -x 3600 \
  -i broker-check-backend -t "$observation" -C 1 -W 5    # queued

# 6. WebSocket transport: anonymous subscription receives the same state.
docker compose exec -T mosquitto mosquitto_sub -h localhost -p 9001 --ws \
  -V mqttv5 -t "$state" -C 1 -W 5                      # kept

# Clean the test retained messages and session.
mqtt_pub -u backend -P "$MQTT_BACKEND_PASSWORD" -q 1 -r -n -t "$state"
mqtt_sub -u backend -P "$MQTT_BACKEND_PASSWORD" -i broker-check-backend \
  -x 0 -t "$observation" -E -W 5
```

The pinned publisher can exit 0 even when a publication is denied: assert PUBACK reason 135, not its exit status. Expected refusals/timeouts are successful negative checks, not commands to run under an unqualified `set -e`. Give every subscriber a `-W` timeout; do not leave background clients running. [WP7](../work-plan/wp7-load-tests.md) verifies the actual adapter Last Will, stale-map behaviour, and backend recreation once those components exist.

## Operations and limits

- Config or ACL edit: restart Mosquitto and wait for healthy. Keep passwords out of logs and Git.
- Password edit: update `.env`, run `docker compose run --rm --no-deps mosquitto-init`, restart Mosquitto and wait for healthy, then recreate the affected clients with `docker compose up -d --force-recreate adapter-aarhus backend`. Restarting existing client containers does not update their environment. Omit a service not yet implemented; after a backend recreation its client ID must still be `backend-1`.
- Buffering applies only after the backend's first successful subscription, with the same client ID, for less than the 3,600-second session expiry and within the 1,000-message queue. At 13 messages/minute, one hour is about 780 readings. Queue overflow, expired sessions and observations sent before the first subscription are not recovered by this design.
- Graceful restart is not power-loss durability. An abrupt broker crash can lose changes since the last persistence save. The accepted commit-to-state-publish gap is described in [04](04-backend.md).
- `allow_anonymous true` does not make a broker local. The loopback-only host port mappings enforce the intended access boundary. Internal Compose clients still connect by service name. Browsers do not authenticate with the application's login; read access to this local traffic feed is intentional.
- File-based authentication is supported by the pinned Mosquitto 2.1.2 image. Do not add a dynamic-security service or persistence plugin for this task. Revisit configuration if the broker version changes.

## Done when

Verified 10 Nov 2026 with `pnpm broker:verify`: 28 checks passed and all test-owned resources were removed. [Recorded evidence and limits](../report/broker.md#evidence).

- [x] `docker compose up -d --wait postgres mosquitto` starts both healthy with only two MQTT passwords configured. Verified in the disposable project, with isolated volumes, no Postgres host port and ephemeral loopback MQTT ports.
- [x] The six checks above have the stated results; rejected publications and both user logins are verified.
- [x] Host listeners bind only to `127.0.0.1`; the adapter cannot publish state or another city's observations.
- [x] Restart retains state and the offline test reading. Init can run twice without losing either user; an empty password fails without replacing the working file.
- [ ] Together with [02](02-migrate.md), `migrate` exits 0. It is a one-shot job, not a healthy long-running service.
- [x] The [broker report section](../report/broker.md) has a draft ([WP9](../work-plan/wp9-report-and-demo.md)).

## Not in this plan

- The Dockerfile pattern and `migrate`: [02](02-migrate.md), Bjoern.
- Each service's Compose block: its own owner and plan.
- Dedicated load generation, monitoring users, multiple backend workers, shared subscriptions, managed cloud infrastructure, TLS and clustering.
