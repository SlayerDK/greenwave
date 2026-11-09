# WP7 · Load and resilience tests

**Bjoern · Mon 16 – Fri 27 Nov.** Needs WP3 and WP4. · [← Work plan](../WORK-PLAN.md)

> **Implementation plan:** [07 · Load generator](../implementation-plans/07-loadgen.md). It has the step-by-step detail for handing this off; this file keeps the owner, dates and summary.

- [ ] `loadgen/` (_new_), MQTT user `loadgen`: publishes copies of a fixture observation for synthetic cities `load-01`…`load-NN`, each with a fresh `eventId`, `observedAt` = now and `source: "loadtest"`, at `RATE` messages a second for `DURATION`. The backend still writes their history, so the test covers the full write path.
- [ ] A `loadtest` Compose profile, as its own project so its data lands in separate volumes:

  ```bash
  docker compose -p greenwave-loadtest --profile loadtest up --scale backend=3
  ```

- [ ] Measure, each to CSV: messages sent/s (loadgen), processed and lag (backend log), DB commits/s (`xact_commit` in `pg_stat_database`, every 10 s), broker load (`$SYS/broker/load/messages/received/1min`, as `monitor`).

## Scenarios

1. Aarhus as is: 13 messages a minute.
2. A ramp with one backend: 10, 25, 50, 100, 200 msg/s, until lag keeps growing.
3. The same ramp with `--scale backend=3` on the shared subscription.
4. A backend restart under load: receipts = messages published, no bucket counted twice.

## Resilience checks (also in the demo)

- `mosquitto_sub -v -t 'greenwave/v1/#' -u backend -P …` shows every message; anonymous clients see only state and status.
- `docker compose kill adapter-aarhus`: status `offline` within about 20 s, and the map shows its banner.
- `docker compose restart backend`: nothing lost or doubled.
- Adapter and backend stopped for 5 minutes: retained state expires, and a new map shows no live state.

**Done when** the CSVs and two or three charts exist, and the scalability and load-test sections have drafts.
