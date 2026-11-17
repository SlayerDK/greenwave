# WP4 · Backend

**Bjoern · Mon 9 – Fri 13 Nov.** Needs WP1 and WP2. · [← Work plan](../WORK-PLAN.md)

> **Implementation plan:** [04 · Backend](../implementation-plans/04-backend.md). It has the step-by-step detail for handing this off; this file keeps the owner, dates and summary.

- [ ] `backend/` (_new_): connect, subscribe, process one observation per transaction, publish the state.
- [ ] Pure, unit-tested rules:
  - `routeIsCongested`: ≥ `CONGESTED_LENGTH_SHARE` of the length is moderate, heavy or closed
  - `routeIsSlowerThanUsual`: `travelTimeSec ≥ SLOWER_THAN_USUAL_RATIO × typicalTravelTimeSec`
  - `nextFlag(previous, on, observedAt)` for both flags: switches after `FLAG_SWITCH_READINGS` readings in a row
  - `isNewer`
- [ ] Every 10 s, log messages processed, duplicates, and lag p50/p95 (now − `observedAt`). WP7 uses these.
- [ ] One backend, one observation at a time, fixed `BACKEND_CLIENT_ID=backend-1`; verify both restart and container recreation. No shared subscription or multi-worker row-lock task.

Use [04's MQTT wiring](../implementation-plans/04-backend.md#4--mqtt-mqttts-maints): create the client with `manualConnect: true`, install `handleMessage` and connect/reconnect subscription handlers, then call `connect()`. Do not attach the handler after awaiting connection: queued readings can replay before it exists.

`processMessage` validates and commits, returning a state or `null`. When there is state, enqueue its QoS 1 publication with explicit rejection handling, then call `done()` after the commit. Never await that publication's PUBACK before `done()`, because the same inbound packet pump must be released to process it.

Integration tests use only `TEST_DATABASE_URL` targeting a disposable `greenwave_test` database, never the ordinary development/recorder URL. See 04's test guard and MQTT lifecycle cases.

`handleFailure`: invalid JSON or schema → log and `done()` (it would fail again every time). Database error → log and `process.exit(1)`; Compose restarts it and the broker redelivers from the persistent session.

## The transaction

1. Insert the receipt (`createMany`, `skipDuplicates`). No row inserted → duplicate, stop.
2. Upsert the route; `createMany` its segments with `skipDuplicates`, so geometry is stored once.
3. Read the route state; the single consumer serializes observations.
4. If the reading is newer: classify segments, update both flags, write route and segment state.
5. Unless `source` is `fixture`, add the reading to its 15-minute bucket in one statement. Out-of-order readings still count; only the state must be newest.

```ts
await tx.$executeRaw`
  INSERT INTO traffic_segment_history ("bucketStart", "cityId", "routeId", "segmentId", "sampleCount", "currentSpeedSum", ...)
  SELECT ${bucketStart}, ${cityId}, ${routeId}, s.id, 1, s.current, ...
  FROM unnest(${segmentIds}::text[], ${currentSpeeds}::int[], ...) AS s(id, current, ...)
  ON CONFLICT ("bucketStart", "cityId", "routeId", "segmentId") DO UPDATE SET
    "sampleCount" = traffic_segment_history."sampleCount" + 1,
    "currentSpeedSum" = traffic_segment_history."currentSpeedSum" + EXCLUDED."currentSpeedSum", ...`;
```

After the commit, if the state changed, enqueue `publishAsync(stateTopic(cityId, routeId), JSON.stringify(state), { qos: 1, retain: true, properties: { messageExpiryInterval: 300 } })` without awaiting it inside `handleMessage`. Attach the fatal error handler, then release the incoming acknowledgement as above.

A crash between commit and publish loses that one publish; the next minute's reading republishes.

**Done when** restart and container recreation resume the same session; the receipt delta matches the known unique observations sent during the short outage, and history does not double-count duplicates. Apply the replay limits in [01](../implementation-plans/01-broker.md#operations-and-limits). The backend section has a draft.
