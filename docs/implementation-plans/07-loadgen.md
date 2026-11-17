# 07 · Verification and scalability reasoning

**No new container or package.** [WP7](../work-plan/wp7-load-tests.md) · Bjoern · 16–27 Nov · Needs [03](03-adapter.md), [04](04-backend.md), and [05](05-frontend.md) for map checks. · [← Plans](README.md)

The filename is retained so existing links keep working. The required load-generator service was removed from the plan on 9 Nov.

## Goal

Provide reproducible evidence for one Aarhus adapter, one backend and one local broker. Demonstrate normal operation, partial failure, duplicate handling and recovery within the documented limits. Explain 100× growth without claiming that horizontal scaling has been implemented or benchmarked.

## Read first

- [01 · Broker](01-broker.md), permissions, smoke checks and replay limits.
- [04 · Backend](04-backend.md), fixed identity, transactions, receipt keys and metrics.
- [05 · Frontend](05-frontend.md), stale routes and the offline banner.
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md), placement, scalability and accepted limitations.
- Brightspace [Lab 7](https://brightspace.au.dk/d2l/le/content/220544/Home?itemIdentifier=D2L.LE.Content.ContentObject.ModuleCO-2870174) and [Lab 8](https://brightspace.au.dk/d2l/le/content/220544/Home?itemIdentifier=D2L.LE.Content.ContentObject.ModuleCO-2960348). Lab 8 labels multi-instance processing and load/backpressure as optional advanced exercises.

## Evidence to keep

Use `docs/report/verification/` for the observed commands, short log extracts and results. This is evidence produced during implementation, not a new application subsystem. No mandatory CSV collector, synthetic-city generator, monitor account or chart pipeline.

- [ ] **Baseline.** Run the adapter in fixture mode for a few complete ticks. Record the offered rate (13 route readings per minute), processed count, duplicates and lag from the existing logs. Show that real TomTom readings also traverse the implemented pipeline before claiming real-data end-to-end operation. Never present fixture throughput as measured live API performance.
- [ ] **Permissions.** Run [01](01-broker.md)'s checks. Observe raw readings as `backend` on the observations filter; observe processed state/status anonymously. The restricted backend user no longer reads every topic.
- [ ] **Adapter failure.** Kill `adapter-aarhus`. Record the actual Last Will delay and the map's offline banner. Reconnect and show that the retained status returns to online. Do not confuse a live connection with fresh successful API readings.
- [ ] **Staleness.** Stop adapter and backend for more than `STATE_TTL_SECONDS` (300 seconds). A new subscriber receives no expired retained state; an open map and its initial Postgres state turn grey based on `observedAt`. Expiry alone does not notify an already-open browser.
- [ ] **Backend restart.** After its subscription exists, stop the backend briefly while the adapter publishes known unique event IDs; restart it within one hour. Wait for the queue to drain and compare the new receipt IDs with that known set. Do not compare the total table count to only the latest run's publications.
- [ ] **Container recreation.** Repeat with `docker compose up -d --force-recreate backend`. Confirm `backend-1` reconnects with the same session and every known event is accounted for. Never run two copies with that client ID.
- [ ] **Duplicates and ordering.** Keep [04](04-backend.md)'s integration-test evidence that a repeated event creates no additional history sample and an older event does not replace newer state. Use a separate test database. Fixture-mode runtime traffic deliberately does not write history, so it cannot alone prove the history-write path.
- [ ] **Broker restart.** Verify retained state and an established offline session survive a graceful restart, using [01](01-broker.md)'s bounded commands. Do not turn this into a claim of power-loss durability.

## Scalability discussion

Explain what changes at 100× more routes/cities and at 100× more viewers. These are estimates, not tested capacity claims:

- 13 observations/minute becomes about 1,300/minute, or 21.7/second, for 100 equivalent cities. API quotas, payload geometry, processing time, history writes and retention all need reassessment.
- Viewer growth increases broker fan-out and browser/network work, but does not multiply the adapter's TomTom polling rate.
- A bounded queue absorbs a short outage, not an indefinitely overloaded consumer. Record its 1,000-message limit and the one-hour session lifetime.
- Multiple workers would require an explicit assignment strategy, stable per-worker identities, shared-state concurrency and an offline-member policy. They are future work, not an implemented scaling property.

Relate the observed baseline and failures to at least two relevant Lab 7 concerns, such as local resilience and self-managed versus managed infrastructure. Do not invent measurements to fill a table.

## Done when

- [ ] Each required case has a command/input, expected result, observed result and limitation.
- [ ] Short restart and recreation preserve the known unique observations within the documented limits; integration tests cover history deduplication and ordering.
- [ ] The report separates measurements, estimates and unimplemented future work.
- [ ] The resilience/scalability report section has a draft ([WP9](../work-plan/wp9-report-and-demo.md)).

## Not in this plan

A `loadgen/` package, extra MQTT identities, synthetic cities, multi-worker benchmarks, a monitoring service, clustering, production hosting or destructive testing against the history recorder's database.
