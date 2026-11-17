# WP3 · Adapter

**Christian · Mon 9 – Wed 11 Nov.** Needs WP1's contracts and WP2's broker. · [← Work plan](../WORK-PLAN.md)

> **Implementation plan:** [03 · Adapter](../implementation-plans/03-adapter.md). It has the step-by-step detail for handing this off; this file keeps the owner, dates and summary.

- [ ] `adapter/src/tomtom.ts` (_new_): move `fetchRouteDetails`, `readRoute` and the TomTom schemas from `src/lib/traffic/`. Drop the Next-only `next: { revalidate, tags }` option. Keep `segmentIdStr` and the `date` header (`CLAUDE.md` explains both).
- [ ] `src/normalize.ts`: TomTom details → observation, using `toPositions` and `toRouteLabel` (they move too). `observationSchema.parse` before publishing, so format drift fails here, not in the backend.
- [ ] `src/main.ts`: Zod-validated env; poll at the start of every minute, skipping a poll while the last one runs; `Promise.all` over the routes, publish those that answered, log the rest.
- [ ] Fixture mode: `pnpm --filter @greenwave/adapter record-fixtures` saves one response per route, once. `ADAPTER_SOURCE=fixture` replays them with speeds jittered ±10%, `observedAt` = now and `source: "fixture"`. Live readings carry `source: "live"`.
- [ ] Test: a fixture becomes an observation with string ids, `[longitude, latitude]` pairs and `CW_AU_` trimmed.

```ts
const client = await mqtt.connectAsync(env.MQTT_URL, {
  protocolVersion: 5,
  clientId: `adapter-${env.CITY_ID}`,
  username: env.MQTT_USERNAME,
  password: env.MQTT_PASSWORD,
  keepalive: 15, // the broker notices a dead adapter within about 22 s
  will: {
    topic: statusTopic(env.CITY_ID),
    payload: offline(),
    qos: 1,
    retain: true,
  },
});
await client.publishAsync(statusTopic(env.CITY_ID), online(), {
  qos: 1,
  retain: true,
});

// once per route per poll
await client.publishAsync(
  observationTopic(cityId, routeId),
  JSON.stringify(observation),
  { qos: 1 },
);
```

On SIGTERM, publish `offline` yourself, then `endAsync()`. A clean disconnect doesn't fire the Last Will, so `docker compose stop` would otherwise leave it showing online.

Env: `CITY_ID=aarhus`, `ROUTE_IDS` (today's `MONITORED_ROUTE_IDS`), `POLL_INTERVAL_SECONDS=60`, `ADAPTER_SOURCE` (`tomtom` or `fixture`), `TOMTOM_API_KEY`, `MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`.

**Done when** `mosquitto_sub` shows 13 observations a minute, killing the container turns the status `offline`, and the adapter section has a draft.
