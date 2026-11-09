# 01 · Broker: `mosquitto-init` and `mosquitto`

**Compose services `mosquitto-init` (one-shot) and `mosquitto`.** [WP2](../work-plan/wp2-compose-and-broker.md) · Bjoern · 2–6 Nov, wiring 12–13 Nov · Needs nothing · Unblocks [03](03-adapter.md), [04](04-backend.md), [05](05-frontend.md), [07](07-loadgen.md). · [← Plans](README.md)

## Goal

One Mosquitto 2.1 broker that the services reach on `mqtt://mosquitto:1883` and browsers on `ws://localhost:9001`. Every service logs in as its own user, browsers connect anonymously and may only read state and status, retained state survives a broker restart, and no password is in git.

## Read first

- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) → _MQTT design_ and _Deployment_ (the config and ACL this plan starts from).
- [Libraries and connections](../work-plan/libraries-and-connections.md) → _MQTT users_, _Ports_, _Startup order_.
- `compose.yaml` (renamed from `docker-compose.yml` by [00](00-foundation.md); only `postgres` today) and the `db:up`/`db:down` scripts in `package.json`.
- The [mosquitto.conf reference](https://mosquitto.org/man/mosquitto-conf-5.html), sections _listener_, _acl_file_ and _max_queued_messages_.

## Interfaces

| Provides                                                             | To                                                    |
| -------------------------------------------------------------------- | ----------------------------------------------------- |
| `mqtt://mosquitto:1883` (in Compose), `mqtt://localhost:1883` (host) | adapter, backend, loadgen, measurement scripts        |
| `ws://localhost:9001`                                                | browsers                                              |
| Users `adapter-aarhus`, `backend`, `loadgen`, `monitor`              | each with password `MQTT_<USER>_PASSWORD` from `.env` |
| Anonymous read of state, status and `$SYS/broker/uptime`             | browsers, the healthcheck                             |

## Files

```
broker/mosquitto.conf   (new)
broker/acl              (new)
broker/init.sh          (new) writes the password file
compose.yaml                     mosquitto-init, mosquitto, volumes
package.json                     db:up / db:down
.env.example                     MQTT_* variables
```

## Steps

- [ ] `broker/mosquitto.conf`:

  ```conf
  # Settings below apply to both listeners.
  per_listener_settings false

  listener 1883
  protocol mqtt

  listener 9001
  protocol websockets

  # Browsers connect anonymously; the ACL limits them to reading state and status.
  allow_anonymous true
  password_file /mosquitto/secrets/passwords
  acl_file /mosquitto/config/acl

  # Retained state and persistent sessions survive a broker restart.
  persistence true
  persistence_location /mosquitto/data/
  autosave_interval 60

  # The default 1,000 is about 75 minutes of Aarhus readings for a stopped backend.
  max_queued_messages 5000

  # $SYS every 10 s: the healthcheck and the load test read it.
  sys_interval 10

  log_dest stdout
  log_type error
  log_type warning
  log_type notice
  log_type information
  ```

- [ ] `broker/acl`. Rules before the first `user` line apply to anonymous clients. Mosquitto checks them when it delivers, not when a client subscribes, so `$share/…` needs no rule of its own.

  ```conf
  # Anonymous: browsers and the healthcheck
  topic read greenwave/v1/+/routes/+/state
  topic read greenwave/v1/+/adapter/status
  topic read $SYS/broker/uptime

  user adapter-aarhus
  topic write greenwave/v1/aarhus/#

  user backend
  topic readwrite greenwave/v1/#

  user loadgen
  topic write greenwave/v1/+/routes/+/observations

  user monitor
  topic read $SYS/#
  ```

  The adapter's Last Will is published by the broker on its behalf, but Mosquitto checks it against the adapter's own write rule at connect, which `aarhus/#` covers.

- [ ] `broker/init.sh`, run by `mosquitto-init`:

  ```sh
  #!/bin/sh
  # Writes the broker's password file from .env into the mosquitto-secrets volume.
  set -eu

  file=/mosquitto/secrets/passwords
  tmp="$file.tmp"
  rm -f "$tmp"

  add() { # user, password; -c only for the first, since -c recreates the file
    [ -n "$2" ] || { echo "empty password for $1" >&2; exit 1; }
    if [ -f "$tmp" ]; then mosquitto_passwd -b "$tmp" "$1" "$2"
    else mosquitto_passwd -c -b "$tmp" "$1" "$2"; fi
  }

  add adapter-aarhus "$MQTT_ADAPTER_PASSWORD"
  add backend "$MQTT_BACKEND_PASSWORD"
  add loadgen "$MQTT_LOADGEN_PASSWORD"
  add monitor "$MQTT_MONITOR_PASSWORD"

  mv "$tmp" "$file"
  chown mosquitto:mosquitto "$file"
  chmod 0700 "$file"
  ```

- [ ] `compose.yaml`. Leave `postgres` as it is (00 pins its minor version); it keeps its `container_name` because it is never scaled. **No `container_name` on anything else.**

  ```yaml
  mosquitto-init:
    image: eclipse-mosquitto:2.1.2-alpine
    entrypoint: ["/bin/sh", "/init.sh"]
    user: root
    environment: # interpolated from .env; Compose refuses to start if one is missing
      MQTT_ADAPTER_PASSWORD: ${MQTT_ADAPTER_PASSWORD:?set it in .env}
      MQTT_BACKEND_PASSWORD: ${MQTT_BACKEND_PASSWORD:?set it in .env}
      MQTT_LOADGEN_PASSWORD: ${MQTT_LOADGEN_PASSWORD:?set it in .env}
      MQTT_MONITOR_PASSWORD: ${MQTT_MONITOR_PASSWORD:?set it in .env}
    volumes:
      - ./broker/init.sh:/init.sh:ro
      - mosquitto-secrets:/mosquitto/secrets

  mosquitto:
    image: eclipse-mosquitto:2.1.2-alpine
    restart: unless-stopped
    depends_on:
      mosquitto-init: { condition: service_completed_successfully }
    ports: ["1883:1883", "9001:9001"]
    volumes:
      - ./broker/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro
      - ./broker/acl:/mosquitto/config/acl:ro
      - mosquitto-secrets:/mosquitto/secrets
      - mosquitto-data:/mosquitto/data
    healthcheck:
      test: ["CMD-SHELL", "mosquitto_sub -t '$$SYS/broker/uptime' -C 1 -W 15"]
      interval: 10s
      timeout: 20s
      retries: 5

  volumes:
    postgres-data:
    mosquitto-secrets:
    mosquitto-data:
  ```

- [ ] `package.json`: `"db:up": "docker compose up -d postgres mosquitto"` (Compose starts `mosquitto-init` as its dependency) and `"db:down": "docker compose down"`.
- [ ] `.env.example`, a new block:

  ```bash
  # MQTT. Services reach the broker on localhost in development and on
  # mosquitto:1883 inside Compose (set there). Generate each password with
  # openssl rand -hex 16.
  MQTT_URL="mqtt://localhost:1883"
  MQTT_WS_URL="ws://localhost:9001"
  MQTT_ADAPTER_PASSWORD=""
  MQTT_BACKEND_PASSWORD=""
  MQTT_LOADGEN_PASSWORD=""
  MQTT_MONITOR_PASSWORD=""
  ```

- [ ] Tell the others in the PR description to add the four passwords to their own `.env`.

## Tests

The broker has no unit tests; the verification commands below are the tests. Paste their output in the PR. Install the clients with `brew install mosquitto`, or run them inside the container with `docker compose exec mosquitto …`.

```bash
source .env   # for the passwords

# 1. Anonymous may read state, but not observations
mosquitto_sub -h localhost -t 'greenwave/v1/+/routes/+/state' -v &
mosquitto_pub -h localhost -u backend -P "$MQTT_BACKEND_PASSWORD" \
  -t greenwave/v1/aarhus/routes/1/state -m '{"x":1}'           # printed by the subscriber
mosquitto_sub -h localhost -t 'greenwave/v1/#' -v -W 5 &         # anonymous
mosquitto_pub -h localhost -u backend -P "$MQTT_BACKEND_PASSWORD" \
  -t greenwave/v1/aarhus/routes/1/observations -m '{}'          # NOT printed

# 2. The adapter may not write another city (MQTT 5 shows reason 0x87, not authorized)
mosquitto_pub -V mqttv5 -q 1 -d -h localhost -u adapter-aarhus -P "$MQTT_ADAPTER_PASSWORD" \
  -t greenwave/v1/odense/routes/1/observations -m '{}'

# 3. Retained state expires
mosquitto_pub -V mqttv5 -h localhost -u backend -P "$MQTT_BACKEND_PASSWORD" -r \
  -D publish message-expiry-interval 10 -t greenwave/v1/aarhus/routes/1/state -m '{}'
sleep 15 && mosquitto_sub -h localhost -t 'greenwave/v1/aarhus/routes/1/state' -W 3  # nothing

# 4. Retained state survives a broker restart
mosquitto_pub -h localhost -u backend -P "$MQTT_BACKEND_PASSWORD" -r -t greenwave/v1/aarhus/routes/2/state -m kept
docker compose restart mosquitto && mosquitto_sub -h localhost -t greenwave/v1/aarhus/routes/2/state -C 1  # "kept"

# 5. WebSocket: from a scratch directory with mqtt installed
node -e "require('mqtt').connect('ws://localhost:9001').on('connect', c => { console.log('ws ok', c.returnCode ?? 0); process.exit(0) })"
```

Clean up the test retained messages afterwards: publish an empty retained message (`-r -n`) to each topic.

## Pitfalls

- **`mosquitto_passwd -c` recreates the file.** Using it for every user leaves only the last one.
- **Escape `$` in Compose.** `$SYS` in a healthcheck must be `$$SYS`, or Compose interpolates it to an empty string.
- **`allow_anonymous true` is local only**: [`ARCHITECTURE.md`](../../ARCHITECTURE.md) lists TLS and browser logins as out of scope.
- A denied publish at QoS 0 fails silently; test ACLs with `-q 1 -V mqttv5 -d` to see the reason code.
- Changing the ACL or config needs `docker compose restart mosquitto`; changing a password needs `docker compose up mosquitto-init` and then a restart.

## Done when

- [ ] `docker compose up -d postgres mosquitto` brings both up healthy (`docker compose ps`).
- [ ] The five checks above behave as described.
- [ ] M1 (Fri 6 Nov, now late): together with [02](02-migrate.md), `docker compose up` starts postgres, mosquitto and migrate healthy.
- [ ] The broker and deployment report sections have a draft ([WP9](../work-plan/wp9-report-and-demo.md)).

## Not in this plan

- The Dockerfile pattern and `migrate`: [02](02-migrate.md).
- Each service's Compose block: its own plan.
