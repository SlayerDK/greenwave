# 05 · Frontend: `frontend`

**Compose service `frontend`, the Next.js app in `frontend/` (moved there by [00](00-foundation.md)).** [WP5](../work-plan/wp5-live-map.md) (bd-nis), [WP8](../work-plan/wp8-clean-up.md) part 1 (Christian). Live map 5–13 Nov, slider 23–26 Nov, clean-up 17–20 Nov · Needs [00](00-foundation.md), [01](01-broker.md); the slider needs [06](06-predictor.md). · [← Plans](README.md)

## Goal

The map paints its first frame from Postgres, then updates live from the broker over a WebSocket, without a reload and without the app calling TomTom. It shows each route's two flags, says when an adapter is offline, greys out data older than five minutes, and offers a slider over today's forecasts. The app runs as a container next to the others.

**Paths in this plan are relative to `frontend/`** unless they name another top-level directory (`shared/`, `database/`) or a root file (`.env.example`, `compose.yaml`).

Four phases, each its own PR, in this order:

| Phase                           | Owner     | When      | Needs                 |
| ------------------------------- | --------- | --------- | --------------------- |
| A · Live map                    | bd-nis    | 5–13 Nov  | 00; 01 to see it live |
| B · Container                   | bd-nis    | by 13 Nov | 00, 02                |
| C · Forecast slider             | bd-nis    | 23–26 Nov | 06's tables           |
| D · Remove the proof of concept | Christian | 17–20 Nov | A merged              |

## Read first

- `frontend/CLAUDE.md` (split off the root [`CLAUDE.md`](../../CLAUDE.md) by 00), all of it: _Layering_, _Reads never go through actions_, _Serialization_ (the three rules), _Conventions_, _Traffic_, _Traffic stats_.
- `frontend/AGENTS.md`: read `frontend/node_modules/next/dist/docs/` before changing Next code.
- [00 · Foundation](00-foundation.md) → `stateSchema`, `adapterStatusSchema`, the topic wildcards, `STATE_TTL_SECONDS`, and the four state tables.
- `src/app/(app)/map/**`, `src/hooks/traffic/use-traffic.ts`, `src/lib/traffic/{data-access,serialization,schema}.ts`, `src/components/traffic/**`, `src/lib/config/env.ts`, `Dockerfile`, `next.config.ts`.

## Interfaces

| Direction    | What                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| In (server)  | `traffic_route`, `traffic_segment`, `traffic_route_state`, `traffic_segment_state`; forecasts from C |
| In (browser) | `ws://localhost:9001`, anonymous: `ALL_STATES` and `ALL_STATUSES`, QoS 0                             |
| Out          | Port 3000                                                                                            |

| Variable                                                       | Value                                                            |
| -------------------------------------------------------------- | ---------------------------------------------------------------- |
| `MQTT_WS_URL`                                                  | `ws://localhost:9001`; read on the server, handed to the browser |
| `DATABASE_URL`                                                 | `postgres:5432` in Compose                                       |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `MAPBOX_PUBLIC_TOKEN` | as today                                                         |
| `TOMTOM_API_KEY`, `CRON_SECRET`                                | still required by `env.ts` until phase D removes them            |

## Phase A · Live map

### Files

```
src/lib/traffic/queries.ts             (new) the network in one query
src/lib/traffic/serialization.ts       rows → NetworkTraffic; state message → route; applyRouteState
src/lib/traffic/data-access.ts         getNetworkTraffic() reads Postgres
src/lib/config/env.ts                  MQTT_WS_URL
src/app/(app)/map/page.tsx             passes mqttUrl
src/hooks/traffic/use-live-traffic.ts  (new) replaces use-traffic.ts
src/app/(app)/map/_components/*        string route ids, badges, banner, stale grey, empty state
src/components/traffic/congestion-style.ts   a stale colour
deleted: src/hooks/traffic/use-traffic.ts, refresh-traffic-button.tsx, src/app/api/traffic/ (+ test)
```

### Steps

- [ ] `queries.ts`: the latest network for a city in one Prisma query.

  ```ts
  export const trafficQueries = {
    network: (cityId: string) =>
      prisma.trafficRoute.findMany({
        where: { cityId },
        include: {
          state: true,
          segments: { orderBy: { ordinal: "asc" }, include: { state: true } },
        },
        orderBy: { id: "asc" },
      }),
  };
  ```

  Routes come back in id order. The old list was in `MONITORED_ROUTE_IDS` order (Ringvejen first); keep that by sorting on the index in that list while it exists, and on `id` after phase D.

- [ ] `serialization.ts`, following CLAUDE.md's three rules: `NetworkRouteFromDb = Prisma.TrafficRouteGetPayload<…>` (type import from `@greenwave/database`), a `serializeRouteFromDb(row)` and a `serializeRouteState(state: RouteState)` that both return the **same shape**, and the derived types. Keep today's shape where it costs nothing, so `TrafficMap`, `RouteSummaryList` and `SegmentPopup` barely change:

  ```ts
  summary: {
    cityId, routeId,            // routeId is now a string
    routeName, passable, routeLength, travelTime, typicalTravelTime, delayTime,
    observedAt,                 // replaces fetchedAt
    congestedSince, slowerThanUsualSince,   // ISO string or null
  },
  featureCollection,            // as today; properties.routeId is a string
  ```

  `routeStatus`, `completeness` and `routeConfidence` go: the observation does not carry them. `NetworkTraffic` becomes `{ routes }`: `failures` existed for TomTom errors, which the frontend no longer sees. A route with no state yet (geometry but no reading) is left out.

- [ ] `applyRouteState(network, route)`: pure. Replace the route with the same `cityId` and `routeId` only if the new `observedAt` is newer; append it if it is new. Return the same object when nothing changed, so React and mapbox do no work.
- [ ] `data-access.ts`: `getNetworkTraffic()` stays behind `requireAuth()` and now returns `serializeNetwork(await trafficQueries.network("aarhus"))`.
- [ ] `env.ts`: `MQTT_WS_URL: z.url()` on the server side, and `.env.example`. Server-side rather than `NEXT_PUBLIC_`, so one image works everywhere; `map/page.tsx` passes it down next to the Mapbox token, with the same comment.
- [ ] `pnpm add mqtt --filter @greenwave/frontend`, then change its version to `catalog:` (it is in 00's catalog).
- [ ] `use-live-traffic.ts`. The query is the store: `skipToken` means it never fetches, and MQTT writes into it.

  ```ts
  "use client";

  export const TRAFFIC_QUERY_KEY = ["traffic", "network"];

  export const useLiveTraffic = (
    initialData: NetworkTraffic,
    mqttUrl: string,
  ) => {
    const queryClient = useQueryClient();
    const [offlineCities, setOfflineCities] = useState<string[]>([]);
    const query = useQuery({
      queryKey: TRAFFIC_QUERY_KEY,
      queryFn: skipToken,
      initialData,
    });

    useEffect(() => {
      let client: MqttClient | undefined;
      let cancelled = false;
      // Imported here so MQTT.js stays out of the server render and the first bundle.
      void import("mqtt").then(({ default: mqtt }) => {
        if (cancelled) return;
        client = mqtt.connect(mqttUrl, {
          protocolVersion: 5,
          reconnectPeriod: 5_000,
        });
        client.subscribe([ALL_STATES, ALL_STATUSES], { qos: 0 });
        client.on("message", (topic, payload) => {
          // JSON.parse in a try; stateSchema / adapterStatusSchema .safeParse; ignore what fails.
          // state  → queryClient.setQueryData(TRAFFIC_QUERY_KEY, (old) => applyRouteState(old, serializeRouteState(state)))
          // status → setOfflineCities(add or remove cityOfStatusTopic(topic))
        });
      });
      return () => {
        cancelled = true;
        client?.end();
      };
    }, [mqttUrl, queryClient]);

    return { traffic: query.data, offlineCities };
  };
  ```

  - QoS 0 in the browser: a missed update is replaced a minute later, and a reconnect gets every retained state at once.
  - An empty retained message (a cleared topic) has an empty payload: skip it.
  - `serializeRouteState` must be importable from client code: keep `serialization.ts` free of `server-only` (it already is) and of value imports from `@greenwave/database`.
  - Hooks may import contracts once [00](00-foundation.md)'s fallow zones are in.

- [ ] `traffic-map-panel.tsx`: `useLiveTraffic` replaces `useNetworkTraffic`; the Refresh button and the error/failures paragraphs go. Delete `use-traffic.ts`, `refresh-traffic-button.tsx` and `src/app/api/traffic/` with its test: nothing calls them any more, and fallow fails on them otherwise.
- [ ] **Stale routes grey.** A route whose `observedAt` is older than `STATE_TTL_SECONDS` is stale. Keep a `now` state in the panel updated every 30 s, so a stale first paint turns grey too, and mark each feature with `stale: boolean` when merging the collections. In the layer style, put `["case", ["get", "stale"], STALE_COLOUR, <today's colour expression>]` in front, with `STALE_COLOUR` in `congestion-style.ts` and a legend entry "No recent data".
- [ ] **Badges** in `route-summary-list.tsx`: "Congested since 07:42" and "Slower than usual since 07:50", formatted with the existing Copenhagen `timeFormat`. Show the reading's own time where `fetchedAt` was.
- [ ] **Offline banner** above the map while `offlineCities` is not empty: "The Aarhus adapter is offline. The map shows the last readings it sent."
- [ ] **Empty state** when `routes` is empty: "No live data yet. Start the adapter and the backend." instead of an empty map.
- [ ] `segment-popup.tsx` and `segment-lookup.ts`: route ids compare as strings. Segment lookup stays on `segmentIdStr` (mapbox rounds numeric feature ids).

### Tests

- `serialization.test.ts`: replace the TomTom-details cases with row → `NetworkTraffic` (coordinates stay `[longitude, latitude]`, `bbox` set) and state message → route, and assert both produce the same shape for the same reading.
- `apply-route-state` cases: newer replaces, older and equal are ignored (same object returned), an unknown route is appended.
- The stale check at exactly `STATE_TTL_SECONDS` (not stale) and one second past (stale).

## Phase B · Container

- [ ] `src/lib/config/env.ts`: add `skipValidation: process.env.SKIP_ENV_VALIDATION === "1"` to `createEnv`. `next.config.ts` imports the env, and the Docker build has no `.env`, so the build fails without it. Runtime validation is unchanged.
- [ ] `next.config.ts`, inside the `STANDALONE_BUILD` block: `outputFileTracingRoot: path.join(import.meta.dirname, "..")`. The app is no longer at the repo root, so without it the trace stops at `frontend/` and leaves out `shared/` and `database/` (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md`, _Caveats_). With it, the standalone output mirrors the repo, and the server is `.next/standalone/frontend/server.js`.
- [ ] `Dockerfile` (already moved to `frontend/Dockerfile` by 00): rewrite it on [02](02-migrate.md#the-dockerfile-pattern)'s pattern, built from the repo root.

  ```dockerfile
  FROM node:24.<minor>-alpine AS base   # the same pinned minor as the services
  RUN corepack enable
  ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH" NEXT_TELEMETRY_DISABLED=1
  WORKDIR /app

  FROM base AS builder
  COPY pnpm-lock.yaml pnpm-workspace.yaml ./
  RUN pnpm fetch
  COPY package.json tsconfig.base.json ./
  COPY shared shared
  COPY database database
  COPY frontend frontend
  RUN pnpm install --offline --frozen-lockfile --ignore-scripts --filter "@greenwave/frontend..."
  RUN pnpm --filter @greenwave/database generate
  ENV STANDALONE_BUILD=1 SKIP_ENV_VALIDATION=1
  RUN pnpm --filter @greenwave/frontend build

  FROM base AS runner
  ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
  RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
  COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/standalone ./
  COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/static ./frontend/.next/static
  COPY --from=builder /app/frontend/public ./frontend/public
  USER nextjs
  EXPOSE 3000
  CMD ["node", "frontend/server.js"]
  ```

  It copies only `shared/`, `database/` and `frontend/`, as 02's pattern does, so editing a service does not rebuild the app; fall back to `COPY . .` if 02 found that pnpm refuses it. The server already runs with `node`. The Prisma CLI and `start-prod` are gone: migrations belong to `migrate` ([02](02-migrate.md)), and the container runs only the server.

- [ ] **Verify** the image really reaches Postgres. If Prisma fails at runtime with a missing file, add it with `outputFileTracingIncludes`.
- [ ] `compose.yaml`. List the variables the app reads instead of `env_file: .env`, which would also hand it the MQTT passwords and everything else in `.env`. `${…}` is interpolated from the root `.env`.

  ```yaml
  frontend:
    build: { context: ., dockerfile: frontend/Dockerfile }
    init: true
    environment:
      DATABASE_URL: postgresql://greenwave:greenwave@postgres:5432/greenwave
      BETTER_AUTH_URL: http://localhost:3000
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET:?set it in .env}
      MAPBOX_PUBLIC_TOKEN: ${MAPBOX_PUBLIC_TOKEN:?set it in .env}
      MQTT_WS_URL: ws://localhost:9001 # the browser's address, not mosquitto's
      # Still required by env.ts until phase D removes them; any value works in Compose.
      TOMTOM_API_KEY: ${TOMTOM_API_KEY:-unused}
      CRON_SECRET: ${CRON_SECRET:-unused-in-compose-0000}
    ports: ["3000:3000"]
    depends_on:
      migrate: { condition: service_completed_successfully }
    restart: unless-stopped
  ```

**Check:** `docker compose up --build frontend`, sign up at `http://localhost:3000`, and `/map` and `/history` render from the container's database.

## Phase C · Forecast slider (week 48)

Needs [06](06-predictor.md)'s `TrafficForecastRun` and `TrafficSegmentForecast`.

- [ ] `src/lib/forecasts/` as a domain: `queries.ts` (the newest run for the city, with its segment rows), `serialization.ts` (`serializeForecast`, deriving `SerializedForecast`), `data-access.ts` (`getLatestForecast()` behind `requireAuth()`, `null` when there is none). No fallow change: the `data` zone's patterns already match `src/lib/*/`.
- [ ] Payload: `generatedAt`, `slotStarts: string[]`, and per segment `{ routeId, segmentId, relativeSpeedPcts: number[], speedsKmh: number[] }` aligned with `slotStarts`. About 1,100 × at most 95 integers, the same pattern `/history` uses.
- [ ] `map/page.tsx` reads it in parallel with the network (`Promise.all`) and passes it to the panel.
- [ ] The slider: "Now" plus every remaining slot until local midnight, labelled in Copenhagen time. At "Now" the map is live; at a slot, segments recolour from `classifyCongestion({ currentSpeed: speedsKmh[i], relativeSpeed: relativeSpeedPcts[i] })`, live updates keep landing in the cache but are not drawn, and the popup shows the predicted km/h. A label says "Forecast made at 14:17". A segment with no forecast is drawn in the stale colour. Use the URL (`nuqs`, already installed) for the slot, so a reload keeps it.
- [ ] Hide the slider when there is no forecast or the newest is older than an hour.

## Phase D · Remove the proof of concept (Christian, 17–20 Nov)

After A, the app makes no TomTom call from `/map`; the cron path is the last one.

- [ ] Delete `src/lib/traffic/tomtom-service.ts` (+ test), `history-service.ts` (+ test), `src/app/api/cron/traffic-history/` (+ test), `trafficMutations` (`mutations.ts`), and whatever of `schema.ts` and the fixtures only they used.
- [ ] `src/proxy.ts`: drop `api/cron` from the matcher, its comment, and the test that guards it (`src/proxy.test.ts`).
- [ ] `src/lib/config/env.ts`, the root `.env.example` and the frontend's `compose.yaml` block: remove `TOMTOM_API_KEY` and `CRON_SECRET` from the app (the adapter keeps its own key).
- [ ] Keep `.github/workflows/traffic-history.yml`, `vercel.json` and `build-vercel`: the frozen Vercel deployment has its own copy of the cron route and keeps recording until after the hand-in (WP8 part 2).
- [ ] Rewrite the traffic sections of `frontend/CLAUDE.md`: the map reads Postgres; the live hook writes into the query cache from MQTT (the hooks layer now holds one `useQuery` with `skipToken` fed by a subscription, not a fetch); the services own TomTom. Keep the Traffic stats section.

**Check:** `grep -rn "api.tomtom.com" src/` finds nothing, and every check passes.

## Pitfalls

- **Never `useQuery` over an action**, and never a poll: CLAUDE.md. The only data source after first paint is MQTT.
- **`initialData` cannot overwrite a cache entry that already has data.** If the RSC re-renders (navigation back to `/map`) the cache keeps its newer MQTT data. That is what we want; do not "fix" it with `invalidateQueries`.
- **Do not `import mqtt` at module level** in a client component: it would run during SSR and enter the first bundle.
- **`MQTT_WS_URL` is the browser's address.** In Compose it is `ws://localhost:9001`, never `ws://mosquitto:9001`, which only resolves inside the Docker network.
- **The merged collection must stay referentially stable** between renders that change nothing, or mapbox re-uploads ~1,100 segments. React Compiler handles it as long as `applyRouteState` returns the same object for a no-op.
- `[longitude, latitude]` throughout; `TrafficBbox`, not geojson's `BBox`.

## Done when

- [ ] A: with the adapter (fixture mode) and backend running, the map updates every minute without a reload; stopping both turns it grey within five minutes; killing the adapter shows the banner; the badges appear. M2 (Mon 16 Nov) with real readings.
- [ ] B: `docker compose up --build` serves the app on port 3000 with login, `/map` and `/history` working.
- [ ] C: the slider recolours the map from the newest forecast.
- [ ] D: the app makes no TomTom call, and the traffic sections of `frontend/CLAUDE.md` describe the new pipeline.
- [ ] The frontend section of the report has a draft ([WP9](../work-plan/wp9-report-and-demo.md)).

## Not in this plan

- The state messages themselves: [04](04-backend.md). The forecasts: [06](06-predictor.md).
- WP8 part 2 (the workflow, `vercel.json`, `build-vercel`, the Vercel project): after 4 Dec.
