# WP4 · Backend

**Christian · Mon 9 – Fri 13 Nov; row lock Tue 17 – Wed 18 Nov.** Needs WP1 and WP2. · [← Work plan](../WORK-PLAN.md)

- [ ] `services/backend` (_new_): connect, subscribe, process one observation per transaction, publish the state.
- [ ] Pure, unit-tested rules:
  - `routeIsCongested`: ≥ `CONGESTED_LENGTH_SHARE` of the length is moderate, heavy or closed
  - `routeIsSlowerThanUsual`: `travelTimeSec ≥ SLOWER_THAN_USUAL_RATIO × typicalTravelTimeSec`
  - `nextFlag(previous, on, observedAt)` for both flags: switches after `FLAG_SWITCH_READINGS` readings in a row
  - `isNewer`
- [ ] Every 10 s, log messages processed, duplicates, and lag p50/p95 (now − `observedAt`). WP7 uses these.
- [ ] Week 47: `SELECT … FOR UPDATE` on the route-state row, so `--scale backend=3` keeps streaks correct.

```ts
const client = await mqtt.connectAsync(env.MQTT_URL, {
  protocolVersion: 5,
  clientId: `backend-${os.hostname()}`, // stable across restarts of one container
  clean: false,
  properties: { sessionExpiryInterval: 3600, receiveMaximum: 32 },
  username: "backend",
  password: env.MQTT_BACKEND_PASSWORD,
});

// MQTT.js sends the PUBACK when `done` is called, so ack only after the commit.
// One message at a time, which is also the backpressure.
client.handleMessage = (packet, done) => {
  processObservation(packet).then(
    () => done(),
    (error) => handleFailure(error, done),
  );
};

await client.subscribeAsync(SHARED_OBSERVATIONS, { qos: 1 });
```

`handleFailure`: invalid JSON or schema → log and `done()` (it would fail again every time). Database error → log and `process.exit(1)`; Compose restarts it and the broker redelivers from the persistent session.

## The transaction

1. Insert the receipt (`createMany`, `skipDuplicates`). No row inserted → duplicate, stop.
2. Upsert the route; `createMany` its segments with `skipDuplicates`, so geometry is stored once.
3. Lock and read the route state.
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

After the commit, if the state changed:

```ts
await client.publishAsync(stateTopic(cityId, routeId), JSON.stringify(state), {
  qos: 1,
  retain: true,
  properties: { messageExpiryInterval: 300 },
});
```

A crash between commit and publish loses that one publish; the next minute's reading republishes.

**Done when** restarting the backend under a running adapter loses and doubles nothing (receipts = messages published), and the backend section has a draft.
