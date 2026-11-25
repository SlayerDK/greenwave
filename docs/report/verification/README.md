# WP7 verification runs, 25 November 2026

Owner: Bjoern. Evidence for [WP7](../../work-plan/wp7-load-tests.md) and [plan 07](../../implementation-plans/07-loadgen.md): one Aarhus adapter, one broker, one backend and the map, running from `compose.yaml` at commit `9915dc8` (plus the `broker/verify.mjs` fix below). Every time is UTC. Every number below was observed in these runs unless it is marked as an estimate. The report section built on them is [resilience and scalability](../resilience-and-scalability.md).

**Environment:** Windows 11 laptop, Docker Desktop 28.3.2, Compose 2.39.1, Node 26.10.0, pnpm 12.6.0; images rebuilt from the commit before the runs. Services: `postgres`, `mosquitto`, `migrate`, `backend`, `adapter-aarhus` with `ADAPTER_SOURCE=fixture` (except where noted), and `frontend`. Local Postgres only, never the Neon database behind the Vercel history recorder.

## Results

| #   | Case                    | Expected                                                                    | Observed                                                                                                                         | Result                   |
| --- | ----------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1   | Baseline, fixture       | 13 readings a minute processed once, low lag                                | 8 polls, each 13 published, 0 failed; backend 13 processed, 0 duplicates, 0 invalid each minute; lag p50 0.38–1.07 s             | Pass                     |
| 2   | Real TomTom data        | Live readings reach Postgres, the history and the map                       | TomTom answered `unauthorized` for all 13 routes; nothing published. Last real-data run: backend run 5, 18 Nov (not via the map) | **Not shown today**      |
| 3   | Permissions             | Roles limited by the ACL                                                    | `pnpm broker:verify` 28/28 PASS; on the running stack, `backend` reads observations, anonymous and `adapter-aarhus` cannot       | Pass                     |
| 4   | Adapter Last Will       | `offline` on kill, banner on the map, `online` after start                  | Last Will 0.55 s and 1.0 s after `kill`; banner on the open map; `online` 3.9 s and 8.5 s after `start`                          | Pass                     |
| 5   | Staleness               | No expired retained state for a new subscriber; open and reloaded maps grey | 13 retained states at TTL −20 s, 0 at TTL +14 s; open map grey without reload; reloaded map grey                                 | Pass                     |
| 6   | Backend stop/restart    | Every known event ID gets one receipt after the restart                     | 26 known IDs, the same 26 new receipts, `sessionPresent: true`, 0 duplicates                                                     | Pass                     |
| 7   | Container recreation    | New container resumes `backend-1`'s session, nothing lost                   | Container `06a112f24bdf` → `a85b951a931b`, `sessionPresent: true`, all 13 IDs of the overlapping poll received once              | Pass                     |
| 8   | Duplicates and ordering | A redelivery writes nothing new; a late reading leaves state alone          | 4 integration tests pass against `greenwave_test`; whole suite 260 tests in 34 files pass                                        | Pass                     |
| 9   | Graceful broker restart | Retained state and an offline session's queue survive                       | Broker restored 14 retained messages, 1 client and 13 queued client messages; backend processed exactly those 13                 | Pass                     |
| –   | Connection ≠ fresh data | An `online` adapter with failing API calls must not look fresh              | Adapter `online`, banner gone, every route stayed grey while TomTom refused the key                                              | Pass (found by accident) |

Screenshots are in [`screenshots/`](screenshots/), cropped from a headless Edge session signed in as a throwaway local user and kept on `/map` through runs 4–5.

## Method

**Event-ID observer.** Known event IDs come from a separate subscriber that uses the `backend` account under its own client ID, `wp7-observer`, with a clean session, so it never touches `backend-1`'s session. It runs in its own container so it survives a broker restart:

```bash
set -a; . ./.env; set +a
docker run -d -t --name wp7-observer --network greenwave_default -e PW="$MQTT_BACKEND_PASSWORD" \
  eclipse-mosquitto:2.1.2-alpine sh -c 'exec mosquitto_sub -h mosquitto -V mqttv5 -u backend -P "$PW" \
  -i wp7-observer -q 1 -t "greenwave/v1/+/routes/+/observations" -F "%U %p"'
```

`-t` and the absence of a pipe matter. The first observer piped through `sed`, and `mosquitto_sub` then block-buffered its output: the first comparison in run 6 read "25 known, 25 receipts" because the 26th line was still in the pipe. It appeared, with its correct receive time, on the next poll. The observer was at fault, not the pipeline. The comparison helpers:

```bash
observer_ids() { docker logs wp7-observer | tr -d '\r' | sed -E 's/^([0-9.]+) .*"eventId":"([^"]*)".*/\1 \2/'; }
observed_between() { observer_ids | awk -v a="$1" -v b="$2" '$1>=a && $1<b {print $2}' | sort -u; }
psql_q() { docker compose exec -T postgres psql -U greenwave -d greenwave -tAc "$1"; }
receipts_between() { psql_q "select \"eventId\" from traffic_observation_receipt
  where \"receivedAt\" >= to_timestamp($1) and \"receivedAt\" < to_timestamp($2) order by 1" | sort -u; }
# A case passes when the IDs observed while the backend was away equal the receipts written after it returned:
diff <(observed_between "$STOP" "$START") <(receipts_between "$START" "$((START + 30))")
```

The comparison uses the receipts written in the window, never the table's total count. The table already held 2,301 receipts from earlier runs.

**Map.** A headless Edge (puppeteer-core, run from a scratch directory, not committed) signed up `wp7-check@example.test` through `/api/auth/sign-up/email`, opened `/map` once and checked every 5 s whether the page contained "The Aarhus adapter is offline". So a banner time is accurate to within 5 s. Screenshots were taken on demand; "reloaded" means `page.reload()`, which loads a new initial state from Postgres.

## 1 · Baseline (fixture)

**Input:** the stack above, untouched from 14:30 to 14:37. `docker compose logs adapter-aarhus | grep '"poll"'`, `docker compose logs backend | grep '"metrics"'`, receipts per minute from Postgres.

| Poll     | Adapter (`published`, `failed`, ms) | Backend window (processed, duplicates, invalid, published) | Lag p50 / p95 (ms) |
| -------- | ----------------------------------- | ---------------------------------------------------------- | ------------------ |
| 14:30:00 | 13, 0, 87                           | 13, 0, 0, 13                                               | 1,074 / 1,615      |
| 14:31:00 | 13, 0, 53                           | 13, 0, 0, 13                                               | 626 / 1,133        |
| 14:32:00 | 13, 0, 80                           | 13, 0, 0, 13                                               | 591 / 1,343        |
| 14:33:00 | 13, 0, 22                           | 13, 0, 0, 13                                               | 1,404 / 2,082 \*   |
| 14:34:00 | 13, 0, 20                           | 13, 0, 0, 13                                               | 379 / 708          |
| 14:35:00 | 13, 0, 17                           | 13, 0, 0, 13                                               | 406 / 711          |
| 14:36:00 | 13, 0, 26                           | 13, 0, 0, 13                                               | 436 / 818          |
| 14:37:00 | 13, 0, 54                           | 13, 0, 0, 13                                               | 461 / 741          |

\* The whole Vitest suite, including the database integration tests, was running on the same laptop during that minute.

- Postgres holds exactly 13 receipts for each minute 14:32–14:37. `traffic_segment_history` stayed at 2,084,706 rows through every fixture run: fixture readings write no history, as designed.
- Lag is from `observedAt` to the commit. The 13 readings of a poll arrive within about 10 ms and are processed one at a time. In the 14:35 poll the receipts span 14:35:00.031–00.662, so the backend took about 53 ms per reading.
- Sizes: the 13 observations of a poll total 236,791–236,797 bytes (as in the adapter's CUJ 1). The 13 retained states total 261,563 bytes, the largest 41,035 bytes; a state message carries the segments' coordinates too. The status message is 51 bytes.
- Idle snapshot (`docker stats`): backend 102 MiB, Postgres 261 MiB, frontend 127 MiB, adapter 44 MiB, Mosquitto 3.1 MiB; all below 0.1 % CPU between polls.

**Limit:** fixture throughput on one laptop. It is not live API performance and not a capacity test.

## 2 · Real TomTom data

**Input:** `ADAPTER_SOURCE=tomtom docker compose up -d --no-deps adapter-aarhus` at 14:27:48, after run 5.

**Observed:** started with `source: "tomtom"`. The 14:28:00 poll logged 13 × `unauthorized: You are missing valid authentication credentials (check TOMTOM_API_KEY)` and `published 0, failed 13`. The adapter was switched back to fixture mode at 14:29:09 to stop sending rejected calls. The key itself was not inspected.

**Status:** real data through the whole pipeline to the map is **not shown** by today's runs. The existing evidence for real data is backend run 5 on 18 November ([backend draft](../backend.md#evidence)): 20 live polls, `published 13, failed 0` each, 260 receipts, and history buckets with matching `sampleCount`s. That run did not include the map. **To do:** renew `TOMTOM_API_KEY`, then repeat this step for about 5 polls and take a screenshot of `/map`.

## 3 · Permissions

**Input:** `pnpm broker:verify` (isolated Compose project, disposable passwords). Then, on the running stack, three subscribers on `greenwave/v1/+/routes/+/observations` for 70 s across the 14:08:00 poll, and an anonymous read of the retained topics:

```bash
docker compose exec -T mosquitto mosquitto_sub -V mqttv5 -u backend -P "$MQTT_BACKEND_PASSWORD" -i wp7-perm-backend \
  -t 'greenwave/v1/+/routes/+/observations' -C 13 -W 70           # and again anonymously, and as adapter-aarhus
docker compose exec -T mosquitto mosquitto_sub -V mqttv5 -t 'greenwave/v1/+/routes/+/state' \
  -t 'greenwave/v1/+/adapter/status' -W 3 -F '%r %t'
```

**Observed:**

- `pnpm broker:verify` first failed before any check: `compose.yaml` gained the `frontend` service in `dba5573`, and Compose refuses to interpolate its required `BETTER_AUTH_SECRET` and `MAPBOX_PUBLIC_TOKEN` (or `ADAPTER_SOURCE`) from the verifier's empty env file. The verifier now sets placeholders for the three variables, since it never starts those services. After the fix, 28 of 28 checks passed, including the role/topic read and write denials (PUBACK 135), the WebSocket ACL, expiry, and the graceful-restart session.
- `backend` received the 13 observations of 14:08:00 (`aarhus:56634:2026-11-25T14:08:00.002Z` … `aarhus:313729:…00.008Z`). Anonymous and `adapter-aarhus` received nothing in 70 s (`Timed out`, exit 27).
- An anonymous subscriber received 13 retained states and 1 retained status, all with the retained flag set.

**Limit:** anonymous read access is public to anyone who can reach port 9001; the broker is bound to loopback only, and it has no TLS.

## 4 · Adapter failure and Last Will

**Input:** an anonymous subscriber on the status topic over the browser's WebSocket listener (`-p 9001 --ws -F '%U %r %p'`), then `docker compose kill adapter-aarhus` (SIGKILL: no clean DISCONNECT), then `docker compose start adapter-aarhus`. Run A without the browser, run B with `/map` open.

| Run | `kill` issued | `offline` received (delay) | Banner on open map | `start` issued | `online` received (delay) | Banner gone   |
| --- | ------------- | -------------------------- | ------------------ | -------------- | ------------------------- | ------------- |
| A   | 14:09:40.833  | 14:09:41.847 (1.0 s)       | –                  | 14:09:56.482   | 14:10:04.993 (8.5 s)      | –             |
| B   | 14:31:22.283  | 14:31:22.829 (0.55 s)      | by 14:31:25.5      | 14:31:39.823   | 14:31:43.701 (3.9 s)      | by 14:31:45.6 |

- After the kill, Compose listed the adapter as `Exited (137)` and its `restart: unless-stopped` policy did not start it again: Docker counts a `kill` as a manual stop. A process that exits on its own would be restarted by the policy; that was not tested here.
- The will's `at` is the time the adapter connected (14:06:10.551 in run A), not the time it died, as the adapter draft says.
- Screenshot [2](screenshots/2-adapter-killed-last-will.png): banner over still-coloured routes. Those readings were under a minute old, which the banner's text ("shows the last readings it sent") states.
- The 14:10:00 poll was missed in run A because the adapter was not yet connected; polling resumed on the next minute boundary.

**Limit:** a hung adapter keeps its connection until the keepalive runs out (the adapter's CUJ 4: 22 s after its last packet). A crash is detected within a second.

## 5 · Staleness

**Input:** `docker compose stop adapter-aarhus backend` at 14:21:10.3. Last reading: `max("observedAt")` over the 13 rows of `traffic_route_state` was 14:21:00.006, so the 300-second TTL ran out at about 14:26:00. Then a fresh anonymous subscriber at TTL −20 s and at TTL +14 s, the open map before and after the TTL, and a reload.

**Observed:**

| Time         | Observation                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 14:21:10.799 | The adapter's own `offline` (a graceful stop, not the will)                                                                                |
| 14:21:12.6   | Banner on the open map                                                                                                                     |
| 14:25:40.6   | New subscriber: 13 retained states                                                                                                         |
| 14:25:48     | Open map still coloured: readings 4 min 48 s old                                                                                           |
| 14:26:15.4   | New subscriber: **0** retained states; the status, which has no expiry, still `offline`                                                    |
| 14:26:48     | Open map: every route grey ("No recent data"), no message received ([screenshot 3](screenshots/3-open-map-after-ttl.png))                  |
| 14:27:09     | Reloaded map: grey from the Postgres initial state, banner from the retained status ([screenshot 4](screenshots/4-reloaded-after-ttl.png)) |

- The open map greys on its own clock (`useNow` ticks every 30 s), from `observedAt`, not because the broker's expiry told it anything: expiry only removes the retained copy for new subscribers.
- **Recovery:** the backend started 14:27:43. Next, run 2's live adapter connected (`online` 14:27:52.9, banner gone 14:27:54.3), but every TomTom call failed. After a reload at 14:28:40 the map was still entirely grey with no banner ([screenshot 5](screenshots/5-adapter-online-tomtom-401.png)). The adapter switched back to fixture mode; the 14:30:00 poll turned the open map back to colour by 14:30:15 without a reload ([screenshot 6](screenshots/6-recovered-open-map.png)).

**Limit:** the banner means "no MQTT connection", not "no fresh readings". The grey colour is what reports missing data, as the recovery shows. A route's grey can be up to 30 s late.

## 6 · Backend stop and restart

**Input:** observer running. `docker compose stop backend` at 14:11:20.6 (after the 14:11:00 poll), two polls, `docker compose start backend` at 14:13:23.0.

**Observed:**

- Broker: `Client backend-1 … disconnected.` at 14:11:21 (a normal DISCONNECT). On return: `disconnected: session taken over` for the stored session, then `New client connected … as backend-1 (p5, c0, k60, u'backend')`. `c0` means a clean start of 0: the session was resumed.
- Backend: `connected`, `clientId: backend-1`, `sessionPresent: true` at 14:13:29.7; next metrics window `processed 26, duplicates 0, invalid 0, published 26`, lag p50 90,124 ms, p95 90,692 ms (the age of the queue).
- The observer saw 26 event IDs while the backend was away: 13 at 14:12:00 and 13 at 14:13:00. Postgres wrote exactly those 26 receipts between 14:13:29.916 and 31.503 (`diff` empty), 61 ms per reading.

**Limit:** this holds only after `backend-1`'s first subscription, for the 3,600-second session expiry and up to the 1,000-message queue.

## 7 · Container recreation

**Input:** at 14:15:57.8, three seconds before a poll, `docker compose up -d --force-recreate --no-deps backend`. `--no-deps` keeps Compose from recreating the broker and Postgres along with the backend; that would be a different test.

**Observed:** container `06a112f24bdf` replaced by `a85b951a931b`. The old one disconnected normally at 14:15:59; the new one connected at 14:16:01.95 as `backend-1` with `sessionPresent: true`. So the two never overlapped. The 14:16:00 poll's 13 readings arrived while no backend was connected. They queued and got 13 receipts between 14:16:02.179 and 02.971, identical to the observer's 13 IDs. Metrics: `processed 13, duplicates 0, published 13`, lag p50 2,719 ms.

**Limit:** the fixed client ID is what makes this work; never run a second copy (a host backend included).

## 8 · Duplicates and ordering

**Input:**

```bash
docker compose exec -T postgres createdb -U greenwave greenwave_test
TEST_DATABASE_URL=postgresql://greenwave:greenwave@localhost:5432/greenwave_test \
  pnpm vitest run --project @greenwave/backend --reporter=verbose backend/src/process-observation.test.ts
```

**Observed:** all four ran (not skipped) and passed: "writes a redelivered reading once", "counts a late reading in the history but leaves the state alone", "writes a fixture reading's state but no history", "dates the congested flag from the first of three congested readings". The whole suite with the same variable: 34 files, 260 tests, all passing.

**Limit:** fixture traffic writes no history, so runtime fixture runs cannot prove the history path; these tests and backend run 5 do. The backend draft's earlier runtime duplicate (run 2, 18 Nov) remains the runtime evidence for a redelivered reading.

## 9 · Graceful broker restart

**Input:** `docker compose stop backend` at 14:17:20.2; the 14:18:00 poll queues 13 readings in `backend-1`'s session; `docker compose restart mosquitto` at 14:18:15.2, then `docker compose up -d --wait mosquitto`; a new anonymous subscriber on the state topics; `docker compose start backend` at 14:18:32.1.

**Observed:**

- Broker log: `mosquitto version 2.1.2 terminating`, `Saving in-memory database` (14:18:15), then `Restored 27 base messages`, `Restored 14 retained messages`, `Restored 1 clients`, `Restored 1 subscriptions`, `Restored 13 client messages` (14:18:17). Healthy at 14:18:28.5.
- The new subscriber received all 13 retained states, from the 14:17:00 poll, still within their TTL.
- The backend reconnected at 14:18:39.3 with `sessionPresent: true` and wrote 13 receipts between 14:18:39.547 and 40.267, identical to the observer's IDs. Metrics: `processed 13, duplicates 0, published 13`, lag p50 40,050 ms.

**Limit:** a graceful restart saves the database first. An abrupt crash loses whatever arrived since the last 60-second autosave. This is not evidence of power-loss durability.

## Processing cost from the backlogs

Each queued backlog drained at a steady pace, with the backend reading one message at a time. These are fixture readings, so no history writes:

| Run                 | Readings | First → last receipt  | Per reading |
| ------------------- | -------- | --------------------- | ----------- |
| 6 · restart         | 26       | 14:13:29.916 → 31.503 | 63 ms       |
| 7 · recreation      | 13       | 14:16:02.179 → 02.971 | 66 ms       |
| 9 · broker restart  | 13       | 14:18:39.547 → 40.267 | 60 ms       |
| 1 · ordinary minute | 13       | 14:35:00.031 → 00.662 | 53 ms       |

That is roughly 15–19 readings a second for one backend on this laptop. It is an observation from short bursts, not a sustained-throughput benchmark. A live reading also writes about 83 segment history rows, so a live reading likely costs more. The report section uses this figure only as an estimate.
