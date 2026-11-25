# Resilience and scalability report draft

Owner: Bjoern. Verification run on 25 November 2026 against the Compose stack: one Aarhus adapter, one Mosquitto broker, one backend and the map. This is a section draft for the group's report. The commands, timings and raw observations are in [`verification/`](verification/README.md). Earlier component evidence is in the [broker](broker.md), [adapter](adapter.md) and [backend](backend.md) drafts.

The section keeps three kinds of statement apart: **measured** (observed in a run, with its conditions), **estimated** (arithmetic from measured or configured numbers, never tested) and **future work** (not implemented).

## What was measured

**Normal operation (measured, fixture data).** For eight minutes the adapter published 13 readings at the start of every minute, with none failed. Each minute the backend processed exactly 13: no duplicates, no invalid messages, 13 state messages. The lag from `observedAt` to the database commit had a per-minute median of 0.38–1.07 s, and 1.40 s in the minute the test suite ran on the same laptop. The backend handles one reading at a time, about 53–66 ms each on the test laptop. A minute's 13 observations total about 237 KB and its 13 state messages about 262 KB. The fixture replays recorded TomTom answers with noise, so these figures describe our own processing, not TomTom's live API.

**Real data (not shown in this run).** The live adapter was started, but TomTom refused the API key for every route, so no reading was published. The last run with real data is backend run 5 on 18 November: 20 live polls of 13 routes through the adapter, broker and backend, all stored, with matching history buckets. That run did not include the map. A run with real data through to the map is still to be done with a renewed key.

## Failure behaviour

| Failure                                   | What the system did (measured)                                                                                                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adapter killed                            | Broker published its Last Will `offline` 0.55 s and 1.0 s after the kill; the open map showed the offline banner; `online` again 3.9–8.5 s after a restart                                   |
| Adapter and backend stopped past the TTL  | Retained state expired: 13 states for a new subscriber 20 s before the 300-second TTL, none 14 s after. The open map turned every route grey from its own clock; a reloaded map was grey too |
| Adapter connected, TomTom failing         | Banner gone, because the adapter was connected, yet every route stayed grey. Freshness comes from `observedAt`, not from the connection                                                      |
| Backend stopped for two minutes           | The broker queued 26 readings in `backend-1`'s session; after the restart, exactly those 26 event IDs got receipts, none twice                                                               |
| Backend container recreated across a poll | The new container resumed the same session; the 13 readings published during the swap were all processed once                                                                                |
| Broker restarted gracefully               | Mosquitto saved and restored 14 retained messages and 13 queued readings for the offline backend; the backend then processed those 13                                                        |
| A reading delivered twice, or late        | Integration tests: a redelivery writes nothing new; a late reading counts in the history but does not overwrite newer state                                                                  |

The checks compared the known event IDs, taken from an independent observer, with the receipts written after the recovery, not with the table's total count. Role-limited access was checked with the broker's 28-check verifier and on the running stack: only the `backend` account can read raw observations.

The run also found that the verifier had stopped working as services were added to `compose.yaml`: Compose demanded the adapter's and the frontend's required variables before starting anything. It now passes placeholders for services it never starts.

## Limits of these guarantees

- **Replay window.** The broker queues readings only for a session that already exists, under the same client ID, for at most 3,600 seconds and 1,000 messages. At Aarhus's 13 readings a minute the hour binds first (about 780 readings).
- **Durability.** A graceful broker restart preserved the queue; an abrupt crash can lose up to the last 60 seconds since the broker's autosave. No power-loss test was run.
- **At least once, not exactly once.** QoS 1 can repeat a reading on each hop; the receipt table makes each one count once. A reading lost before the broker acknowledged it is gone.
- **Detection delays.** A crashed adapter is reported within a second, a hung one only when the keepalive runs out (about 22 s). An open map can turn grey up to 30 s after the TTL.
- **Single instances.** One broker and one backend: each is a single point of failure, and the backend must never run twice with its client ID.

## Scaling to 100 times

These are **estimates**. No load test was run, and no capacity limit or horizontal scaling is claimed.

**100 times the routes or cities.** 13 readings a minute become about 1,300, or 21.7 a second, and about 24 MB of observations a minute into the broker (100 × 237 KB). The adapter side scales by adding an adapter, an MQTT account and an ACL entry per city, each with its own API quota. At 13 calls a minute that is 18,720 calls a day per city.

- **The backend is the likely first bottleneck.** At the observed 53–66 ms per reading, 1,300 readings take 69–86 s of work, more than a minute, so the queue would grow without bound. The figure comes from fixture readings, which skip the history write; live readings likely cost more. Processing in parallel, by city or with a worker pool, would be required.
- **The bounded queue turns into a loss.** Every adapter polls on the minute boundary, so 1,300 readings would arrive within about a second, above the 1,000-message queue even with a fast consumer. Staggering cities across the minute or raising Mosquitto's `max_queued_messages` would be needed. At 1,300 a minute the queue also covers only about 46 s of backend outage: run 6's two-minute restart would lose readings.
- **Storage.** The history holds about 104,000 rows a day for Aarhus (1,081 segments × 96 quarter hours), so about 10 million a day at 100 times, plus 1.9 million receipts a day. Retention, partitioning or coarser aggregation, and pruning of receipts older than the session expiry, become necessary.

**100 times the viewers.** The TomTom polling, the adapters and the backend do not change: the backend publishes each state once, and the broker fans it out. The broker's outgoing traffic and the browsers' work grow with the number of viewers. Each viewer receives about 262 KB of state a minute (about 35 kbit/s) and, on connecting, every retained state plus one initial Postgres query rendered by Next.js. 1,000 viewers, 100 times an assumed ten, would mean roughly 260 MB a minute (about 35 Mbit/s) out of one broker.

**Both together.** The browser subscribes to every city's state with a wildcard. With 100 cities each viewer would receive about 26 MB a minute. Subscribing per city or per map viewport, which the topic tree already allows, comes before any infrastructure change. Shrinking each message helps less than expected: the segment coordinates are only 28 % of a state message's bytes (measured on the 13 retained states).

**Future work, not implemented.** Several backend workers would need an assignment strategy (per-city partitions or a shared subscription), a stable identity per worker, concurrency control on shared route state (the "newer than" check must hold under concurrent writers), and a policy for a member that goes offline with readings assigned to it. A broker cluster would remove the broker as a single point of failure; regional brokers would only confine an outage to one region. None of this was built or measured; Lab 8 lists multi-instance processing and backpressure as optional advanced exercises.

## Relation to Lab 7

**Local operation and resilience (Lab 7, part C).** While part of the pipeline is unavailable, the map keeps showing the last readings until they are five minutes old, then greys them, and the broker holds readings for an absent backend. The design gives each failure a local, visible effect instead of a silent one. A dead adapter is reported through the Last Will. A briefly absent backend loses nothing within the replay window. Old data is shown as grey rather than as current traffic. The runs above measure each of these. The same evidence shows where resilience stops: one broker, one backend and a bounded queue. The recovery run also shows why freshness and liveness must be separate signals: a connected adapter can still be delivering nothing. For one city we change nothing: a second backend would remove the backend as a single point of failure, but would need the assignment and concurrency work listed under future work. Part E covers the broker.

**Self-managed versus managed infrastructure (Lab 7, part E).** Running Mosquitto ourselves gave full control and a one-command local setup, and every guarantee above can be inspected. It also made every operational limit ours: the 1,000-message queue, the 60-second autosave, the accounts and ACL, the missing TLS, and keeping the verifier working as `compose.yaml` changes, which the run found broken. A managed IoT service, such as Azure IoT Hub (L7 slides 33–37) or AWS IoT Core, would provide availability, scaling and device identity, but runs only in the cloud, costs money per message and is built around fleets of devices. Our data comes from city HTTP APIs, not from devices. For one city and a course deployment, self-managed is justified; at 100 cities the broker's availability and fan-out are the first parts a managed or clustered broker would take over.
