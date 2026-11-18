# Adapter report draft

Owner: Christian. Implementation and verification dated 17 November 2026. This is a section draft for the group's report. It covers the Aarhus adapter on its own, against a real broker, and is not evidence that the backend or the live map is implemented.

## Responsibility and protocol

The adapter, `adapter-aarhus`, is the first stage of the live pipeline and the only component that knows TomTom exists. At second 0 of every minute it reads Aarhus's 13 monitored routes from TomTom's Route Monitoring API over HTTPS, in parallel and with an 8-second timeout per call. It turns each answer into the shared observation message and publishes it over MQTT 5 on TCP to `greenwave/v1/aarhus/routes/{routeId}/observations`, at QoS 1 and not retained. QoS 1 makes the broker acknowledge every reading (PUBACK). A repeat after a reconnect is possible, and the backend drops it by `eventId`.

The adapter also keeps a retained status on `greenwave/v1/aarhus/adapter/status`. It publishes `online` after every connect and `offline` itself on shutdown, and it registers `offline` as its Last Will. The broker publishes the will when the connection closes without a clean disconnect, or when the 15-second keepalive runs out (after 1.5 × 15 s). Browsers read the status anonymously; the broker's ACL lets the adapter's account write only Aarhus observations and this status.

## Data handling

TomTom's payload has three traps that silently corrupt data, and the adapter absorbs all three so nothing downstream sees TomTom's format:

| Observation field         | From TomTom                                                           | Trap it avoids                                                                                                    |
| ------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `segments[].id`           | `segmentIdStr`                                                        | the numeric `segmentId` exceeds JavaScript's safe integers: `JSON.parse` rounds 165 of the 166 ids on route 56634 |
| `segments[].coordinates`  | `shape`, flipped to `[longitude, latitude]`                           | TomTom sends `{latitude, longitude}` objects; GeoJSON wants longitude first                                       |
| `observedAt`              | TomTom's HTTP `date` header                                           | not the adapter's clock                                                                                           |
| `route.name`              | `routeName` without the `CW_AU_` prefix                               | an internal marker on the twelve corridor routes                                                                  |
| `eventId`                 | `{cityId}:{routeId}:{observedAt}`                                     | the same reading always gets the same id                                                                          |
| route and segment numbers | renamed with units (`lengthM`, `travelTimeSec`, `currentSpeedKmh`, …) | units explicit                                                                                                    |

`observedAt` is when TomTom answered, not when the traffic was measured: the response carries no measurement time (`createdAt` is when the route was set up). Every observation passes `observationSchema` before it is published; one that fails, like a TomTom shape change, counts as a failed route and its log line names the failing field.

For development, `ADAPTER_SOURCE=fixture` replays one recorded response per route with each segment's speed varied by up to ±10%, labelled `source: "fixture"` and stamped with the time of the read. It needs no key or internet, is chosen at start-up only, and the backend keeps it out of the history.

## Failure behaviour

- **One route fails** (timeout, HTTP error, format change, a bug): that route is logged with its id and reason and publishes nothing in that poll. The other routes publish normally. The adapter never fills a gap with a re-sent, recorded or interpolated reading; the map greys a route whose `observedAt` is over five minutes old.
- **TomTom is unreachable:** every route fails each minute and the status stays `online`, because the process is fine.
- **The broker is unreachable:** a poll that finds the client disconnected ends without calling TomTom, and polling resumes at the first minute boundary after the reconnect. A poll already waiting for its PUBACKs when the connection drops keeps waiting; MQTT.js resends its messages after the reconnect, and boundaries that pass meanwhile are skipped, not queued.
- **The adapter stops, crashes or hangs:** on SIGTERM it publishes `offline` and disconnects. A crash closes the connection, so the broker publishes the Last Will at once. A hang leaves the connection open until the keepalive runs out.

## Evidence

Unit tests: 62 in the adapter's five test files, among them the round trip through `JSON.stringify`/`JSON.parse`, each failure class costing exactly one route, and the schedule under fake timers. The runs below used the real Mosquitto broker from `compose.yaml`. CUJs 2, 3 and 5 called the live TomTom API. Times are UTC.

| Run                                  | Observed result                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CUJ 1: fixture mode on the host      | 13 observations at 15:28:00, all in the same second, 236,793 bytes a minute in total (from 3,275 bytes for route 313727 to 37,263 for Ringvejen). The next minute: 13 of 13 `"source":"fixture"`, 13 of 13 pass `observationSchema`. Retained status `online`. One `debug` line per `eventId`; summaries `published 13, failed 0` in about 105 ms                          |
| CUJ 2: live, with route `1` added    | At 15:35 and 15:36, 13 `live` observations each, `observedAt` 15:35:00.000Z and 15:36:00.000Z from TomTom's header. Route `1` logged at `warn` as `not_found: Not found Route by id(1)`, nothing published for it; summaries `published 13, failed 1` in 316 and 365 ms                                                                                                    |
| CUJ 3: live with an invalid key      | 13 `error` lines a minute, `unauthorized: … (check TOMTOM_API_KEY)`, summary `published 0, failed 13`, no observation in 70 s, status still `online`. The key does not appear in the log                                                                                                                                                                                   |
| CUJ 4: stop, kill, pause in Compose  | `docker compose stop` (0.27 s): `offline` from the adapter the same second. `kill`: the Last Will within 1 s, its `at` the connect time. `pause`: the Last Will 12 s after the pause, 22 s after the adapter's last packet (broker log: "exceeded timeout"). `online` 2–5 s after each start or unpause                                                                    |
| CUJ 5a: broker stopped for 2 minutes | Broker stopped 15:38:10. At 15:39:00 and 15:40:00, `poll skipped: broker disconnected` with no summary, so no TomTom calls. Broker back 15:40:15, adapter reconnected and `online` at 15:40:21, a normal poll (`published 13`) at 15:41:00                                                                                                                                 |
| CUJ 5b: broker paused across a poll  | Broker paused 15:48:55. The 15:49:00 poll read TomTom and waited 126 s for its PUBACKs; `poll skipped: previous poll still running` once at 15:50:00 and once at 15:51:00. Broker unpaused 15:51:00; at 15:51:05 the adapter reconnected and its 13 messages arrived with `observedAt` 15:49:00–15:49:01, then the summary. The next poll ran on the boundary, at 15:52:00 |
| CUJ 6: TomTom changes its format     | Unit tests: a missing `detailedSegments.3.currentSpeed` and a speed of `12.5` each fail that route, naming the path                                                                                                                                                                                                                                                        |

The first CUJ 5b run found a scheduling fault. With croner's `protect` option, croner re-checked the skipped boundary every 30 seconds and started a catch-up poll at 15:44:30, off the minute. The overlap guard is now a flag in the adapter's own code, and a fake-timer test pins the schedule.

## Limits

- `observedAt` is TomTom's answer time. If TomTom has not refreshed a route since the last poll, the same speeds are published again with a new `observedAt`; nothing in the response allows detecting it.
- At most one poll is delivered late after a broker outage, with its true `observedAt`. The backend's rule that state only moves forward in time keeps it from overwriting newer state. Readings held in memory are lost if the adapter crashes or is stopped mid-poll; there is no disk buffer.
- Until the backend has subscribed once with its persistent session, the broker discards observations. The adapter's guarantee ends at the PUBACK.
- Fixture data is not traffic data: it is a recording with random noise, and a demo that uses it must say so.
- One adapter instance. A host adapter and a Compose adapter running together share the client id and knock each other off the broker.
- The Last Will's `at` is the connect time, not the time of death.

Implementation: [`adapter/`](../../adapter/), [`compose.yaml`](../../compose.yaml). Specification and verification plan: [adapter design](../designs/adapter.md).
