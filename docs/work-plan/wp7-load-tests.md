# WP7 · Resilience evidence and scalability reasoning

**Bjoern · Mon 16 – Fri 27 Nov.** Needs WP3, WP4, and WP5 for map checks. · [← Work plan](../WORK-PLAN.md)

> **Implementation plan:** [07 · Verification](../implementation-plans/07-loadgen.md). The legacy filename is retained for links; no load-generator service is required.

The 9 Nov scope decision keeps one backend and a normal subscription. No synthetic-city ramp, three-worker comparison, loadgen/monitor accounts or CSV/chart subsystem.

- [ ] Record a short baseline from existing adapter/backend logs; distinguish fixtures from real TomTom data.
- [ ] Verify role-limited MQTT access, retained state/expiry, adapter Last Will and reconnect.
- [ ] Verify stale Postgres/retained state does not remain green on the map.
- [ ] Compare known unique event IDs with receipt deltas after a short backend stop/restart and after container recreation using the same `backend-1` identity.
- [ ] Keep the database integration-test evidence for duplicate and out-of-order observations; fixtures alone do not prove the history path.
- [ ] Explain 100× route/city growth and 100× viewer growth, likely bottlenecks and replay limits. Label estimates as estimates; do not claim measured capacity or horizontal scaling.
- [ ] Connect the results to at least two relevant Lab 7 architecture concerns.

**Done when** commands, expected/observed results and limits are recorded under `docs/report/verification/`, and the resilience/scalability report section has a draft. [07](../implementation-plans/07-loadgen.md) defines the cases and acceptance boundaries.
