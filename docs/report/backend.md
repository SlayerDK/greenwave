# Backend report draft

Owner: Bjoern. Built in #14; fixed and verified against the real adapter and broker on 18 November 2026 in #16. This is a section draft for the group's report. It covers the backend with the Aarhus adapter in fixture mode and the Mosquitto broker from `compose.yaml`, and is not evidence that the live map works.

## Responsibility and protocol

The backend, Compose service `backend`, is the only component that writes traffic data. It holds one normal MQTT 5 subscription to `greenwave/v1/+/routes/+/observations` at QoS 1, under the fixed client id `backend-1`, with `clean: false` and a 3,600-second session expiry. The broker therefore keeps the subscription while the backend is away, and queues readings for it for up to an hour. The client id must not change: a container recreated under a new id would start an empty session, and the readings queued for the old one would never be processed.

The backend handles one message at a time and acknowledges it (PUBACK) only after its database transaction has committed. If the process dies before the commit, the reading stays unacknowledged and the broker delivers it again after the reconnect.

After a commit that moves a route forward, the backend publishes the route's state to `greenwave/v1/{city}/routes/{routeId}/state` at QoS 1, retained, with a 300-second message expiry. Retained means a browser gets the current state as soon as it subscribes. The expiry removes a route's state five minutes after the backend stops updating it, so the map never shows old traffic as current. The broker's ACL lets the `backend` account read observations and write state, nothing else.

MQTT.js handles a client's incoming packets one at a time: the next packet, including the broker's PUBACK for the backend's own state message, waits until the handler calls `done()`. The backend therefore starts the state publish and calls `done()` without waiting for that PUBACK. The first version awaited it, and every state publish hung until the keepalive dropped the connection; a unit test now guards this.

## Data handling

Each observation is one transaction:

1. **Receipt.** Insert the `eventId` (`{cityId}:{routeId}:{observedAt}`) into `traffic_observation_receipt`. If it is already there, the message is a redelivery: nothing else is written, and the message is acknowledged and counted as a duplicate.
2. **Geometry.** Upsert the route; insert its segments' coordinates the first time they are seen.
3. **History.** Unless the reading is a fixture, add each segment's speeds to its 15-minute UTC bucket in `traffic_segment_history`, as sums plus a `sampleCount` (the mean is sum ÷ count). One `INSERT … ON CONFLICT` covers every segment. A reading that arrives late still counts in its own bucket.
4. **State.** Only if the reading is newer than the stored one:
   - classify every segment from free to closed by its speed relative to free flow;
   - update the route's two flags, congested (at least 20% of the route's length moderate or worse) and slower than usual (travel time at least 1.3 × typical), each switching on or off after three readings in a row;
   - write the route and segment state.

   The flags and their streaks live in Postgres, so a restart does not reset them. An older reading leaves the state alone and publishes nothing.

A message that is not JSON, or fails `observationSchema`, is logged with its topic and first issue, counted as invalid, and acknowledged: it would fail again on every redelivery.

Every 10 seconds the backend logs one metrics line: readings processed, duplicates, invalid messages, states published, and the lag from `observedAt` to the commit (p50 and p95). WP7 uses it for the baseline.

## Failure behaviour

- **The database fails:** the process exits 1 without acknowledging the reading. Compose restarts it and the broker redelivers the reading from the session.
- **The broker refuses a state publish:** the process exits 1. The route's next reading publishes its state again.
- **The broker is unreachable:** MQTT.js reconnects every second. Readings the adapter publishes meanwhile queue in the backend's session.
- **SIGTERM** (`docker compose stop`, `restart`): the backend stops taking messages, finishes the one in flight, and disconnects. A message that arrives after the signal is left unacknowledged, so the broker redelivers it to the next process. A second signal exits at once.
- **A crash between commit and publish** loses that one state publish; the route's next reading publishes it again.

## Evidence

Tests:

- `rules.test.ts` and `state-message.test.ts`: 7 unit tests of the rules.
- `message-handler.test.ts`: 9 unit tests. Awaiting the PUBACK before `done()` makes the two publish tests fail.
- `process-observation.test.ts`: 4 integration tests against a separate `greenwave_test` database. A redelivery is written once. A late reading counts in the history but leaves the state alone. A fixture reading writes state but no history. The congested flag is dated from the first of three readings. Moving the history write back behind the newer-than check makes the late-reading test fail.

The runs below used Compose: `postgres`, `mosquitto`, `migrate`, `backend`, and `adapter-aarhus` with `ADAPTER_SOURCE=fixture`. Times are UTC, 18 November 2026.

| Run                                                          | Observed result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1: fixture mode, 4 minutes                                   | `backend-1` connected with `sessionPresent: false` (its first session). Every minute from 13:32 to 13:35: 13 receipts, a metrics line `processed 13, duplicates 0, published 13`, and 13 state messages on an anonymous `mosquitto_sub`, all valid against `stateSchema`. No `traffic_segment_history` rows. The last of a minute's 13 states arrived 0.3–0.8 s after `observedAt`; over the whole session, every ordinary minute's metrics showed lag p50 0.19–0.42 s and p95 0.24–0.81 s. The first batch took 9 s: the Mac had just woken from a 109-second sleep (macOS power log), which suspended the Docker VM, and that batch also stored every segment's geometry for the first time |
| 2: duplicate                                                 | The 13:37:00 reading of route 56634, re-sent as `adapter-aarhus` three seconds later: metrics `processed 13, duplicates 1, published 13`; that minute still has exactly 13 receipts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 3: `docker compose restart backend` 2 s before a poll        | The backend disconnected cleanly at 13:38:58 (broker: "connection closed by client") and was back at 13:39:00.302 as `backend-1` with `sessionPresent: true`. The adapter had published the 13:39 poll at 13:39:00.024, before the reconnect: those 13 readings queued in the session and were committed between 13:39:00.64 and 00.97. Receipts 117 = 9 polls × 13, nothing missing or twice                                                                                                                                                                                                                                                                                                 |
| 4: stop for two polls, then `--force-recreate` the container | Stopped cleanly at 13:41:20. The adapter's polls at 13:42:21 (late: the Mac slept 23 s) and 13:43:00 queued 26 readings. `docker compose up -d --force-recreate --no-deps backend` at 13:43:17 replaced container `84d902ad1550` with `321d8457f793`, which connected at 13:43:18.7 as `backend-1` with `sessionPresent: true` and committed all 26 between 13:43:18.9 and 19.9: metrics `processed 26, duplicates 0, published 26`, lag p50 57 s (the queue's age). Receipts 156 = 12 polls × 13, and all 13 route states hold the newest reading, 13:43:00                                                                                                                                  |

Not yet run: live TomTom readings for a full quarter hour, which would show the history buckets reaching `sampleCount` 15. Plan 04 also asks for automated MQTT tests against a disposable broker; runs 3 and 4 cover the same two cases, a resumed queue and a recreated container, by hand.

## Limits

- **Replay window:** the broker buffers only after the backend's first subscription, only for the 3,600-second session expiry, and only up to Mosquitto's default 1,000 queued messages. At 13 readings a minute an hour is about 780 readings; a longer outage loses readings.
- **Broker crash:** the broker saves its state every 60 seconds, so an abrupt crash can lose the queue's newest minute.
- **QoS 1** is at least once on each hop. The receipt makes each reading count once in the database, but it is not end-to-end exactly-once delivery: a reading lost before the broker queued it is gone.
- **One instance only.** A host backend and a Compose backend share `backend-1` and keep taking the session from each other.
- **Receipts are never pruned.** About 19,000 rows a day; a duplicate can only arrive within the session expiry, so pruning rows older than a day would be safe.
- **Fixture data is not traffic data.** It is kept out of the history, and a demo that uses it must say so.

Implementation: [`backend/`](../../backend/), [`compose.yaml`](../../compose.yaml). Plan: [04 · Backend](../implementation-plans/04-backend.md).
