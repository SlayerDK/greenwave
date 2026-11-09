# WP5 · Live map

**bd-nis · Thu 5 – Fri 13 Nov; forecast slider Mon 23 – Thu 26 Nov.** Needs WP1; the slider needs WP6. · [← Work plan](../WORK-PLAN.md)

> **Implementation plan:** [05 · Frontend](../implementation-plans/05-frontend.md). It has the step-by-step detail for handing this off; this file keeps the owner, dates and summary.

## First paint from Postgres

- [ ] `src/lib/traffic/queries.ts` (_new_): the latest network for a city, in one Prisma query with `include` (routes, segments with geometry, route and segment state).
- [ ] `src/lib/traffic/serialization.ts`: build today's `NetworkTraffic` from those rows, so `TrafficMap`, `RouteSummaryList` and `SegmentPopup` keep working. Congestion comes from the stored state; `summary` gains `observedAt`, `congestedSince`, `slowerThanUsualSince`. Add `toRouteTraffic(state)` for state messages.
- [ ] `src/lib/traffic/data-access.ts`: `getNetworkTraffic()` reads Postgres, still behind `requireAuth()`.
- [ ] `MQTT_WS_URL` in `src/lib/config/env.ts`, passed down from `src/app/(app)/map/page.tsx` like the Mapbox token. Server-side, not `NEXT_PUBLIC_`, so one Docker image works everywhere.

## Live updates

- [ ] `src/hooks/traffic/use-live-traffic.ts` (_new_) replaces `useNetworkTraffic` in `traffic-map-panel.tsx`:

```ts
const query = useQuery({
  queryKey: TRAFFIC_QUERY_KEY,
  queryFn: skipToken,
  initialData,
});

useEffect(() => {
  let client: MqttClient | undefined;
  void import("mqtt").then(({ default: mqtt }) => {
    client = mqtt.connect(mqttUrl, {
      protocolVersion: 5,
      reconnectPeriod: 5_000,
    });
    client.subscribe([ALL_STATES, ALL_STATUSES], { qos: 0 });
    client.on("message", (topic, payload) => {
      // stateSchema.safeParse(JSON.parse(payload.toString())), then:
      // queryClient.setQueryData(TRAFFIC_QUERY_KEY, (old) => applyRouteState(old, toRouteTraffic(state)))
    });
  });
  return () => void client?.end();
}, [mqttUrl, queryClient]);
```

- The query is the store; `skipToken` means it never fetches. MQTT.js is imported inside the effect, out of the server render and first bundle.
- `applyRouteState` is pure and tested: it replaces a route only when `observedAt` is newer.
- QoS 0 for browsers: a missed update is replaced a minute later, and a reconnect gets the retained state.

- [ ] Two badges in the route list: "Congested since 07:42", "Slower than usual since 07:50".
- [ ] A banner while an adapter is offline.
- [ ] Routes older than `STATE_TTL_SECONDS` drawn grey, checked on a 30 s tick (so a stale first paint turns grey too).

## Forecast slider (week 48)

- [ ] `getLatestForecast()` in a new `src/lib/forecasts/` domain (`queries.ts`, `data-access.ts`, `serialization.ts`), read by the map page.
- [ ] The slider runs from "Now" through every remaining 15-minute slot until midnight. Forecast slots recolour segments with `classifyCongestion`; the popup shows predicted km/h, and a label says when the forecast was made.
- [ ] Payload: `slotStarts` plus integer arrays per segment aligned with it (about 1,100 × ≤ 95), the same pattern `/history` uses.

**Done when** the map updates every minute without a reload, turns grey when the pipeline stops, the slider recolours it, and the frontend section has a draft.
