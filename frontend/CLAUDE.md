@AGENTS.md

# GreenWave frontend

The Next.js app, built from `NEXTJS_FULLSTACK_TEMPLATE.md` (at the repo root). This file records only
what differs from a stock Next.js setup; the repo-wide layout, commands and deployment are in the
root `CLAUDE.md`. Paths below are relative to `frontend/`.

## Layering

> Only DB-facing files import Prisma (`@greenwave/database`). Components and hooks consume `data-access` and `actions` — never raw Prisma.

```
Server render:  RSC page ─────────────────► data-access ──► DB
Mutation:       Client component ─► hook ─► action ──────► DB
```

`src/lib/<domain>/` holds `queries.ts` (pure reads), `mutations.ts` (pure writes), `data-access.ts` (`server-only` reads behind `requireAuth()`), `actions.ts` (`"use server"`, wrapped in `safeAction`), `schema.ts` (Zod), `serialization.ts` (Prisma row → JSON-safe shape). Add `service.ts` only when cross-cutting orchestration appears.

`src/lib/devices/` is the reference domain — copy its shape.

Enforced by the root `.fallowrc.json` boundaries and by `no-restricted-imports` in the root
`eslint.config.mjs`.

## Reads never go through actions

**An action must never wrap a read.** `actions.ts` is for mutations. A `listXAction` that only calls `getX()` is the mistake — delete it and read on the server.

Reads are server-rendered: the RSC page calls `data-access`, passes the serialized result down as a prop, and a successful mutation calls `router.refresh()` to re-render that tree (the action already ran `revalidatePath`). See `useRefreshOnSuccess` in `src/hooks/devices/use-devices.ts`. The hooks layer therefore holds `useMutation` only — no `useQuery` over an action.

When the client genuinely needs the data itself — polling, infinite scroll, a cache shared across pages — wrap the data-access function in a thin endpoint and fetch that endpoint from the `queryFn`. Never an action.

```ts
// src/app/api/devices/route.ts — pass-through; auth already lives in getDevices()
export const GET = async () => NextResponse.json(await getDevices());
```

```ts
// src/hooks/devices/use-devices.ts
queryFn: async (): Promise<SerializedDevice[]> => {
  const response = await fetch("/api/devices");
  if (!response.ok) throw new Error("Failed to load devices");

  return response.json() as Promise<SerializedDevice[]>;
},
```

`response.json()` is `any`, so it needs that annotation or `no-unsafe-return` fires. Import `SerializedDevice` as a `type` — `serialization.ts` is `server-only` and a value import would drag Prisma into the browser bundle. That is also why `queryFn` can't call `getDevices` directly: `"server-only"` modules fail the build when reached from `"use client"`, which is exactly what the endpoint exists to bridge.

## Actions

Return `ActionResult<T>`; never throw for expected failures.

```ts
export const createXAction = async (input: XInput): Promise<ActionResult<{ id: string }>> =>
  safeAction(async () => {
    const { user } = await requireAuth();
    const parsed = xSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
    ...
  });
```

`safeAction` calls `unstable_rethrow` so `redirect()` / `unauthorized()` signals pass through.

## Auth

Better Auth, email + password. `src/lib/auth/auth.ts` (server), `auth-client.ts` (browser), `session.ts` (`getSession`, `requireAuth`). `src/proxy.ts` is Next 16's renamed middleware; its matcher excludes `/api/auth`, `/login`, `/signup`. Route groups: `(auth)` public, `(app)` authenticated.

No roles, organizations, or plan gates — add them on top of `requireAuth()` if needed.

## Conventions

- No relative imports; `@/` aliases only (ESLint-enforced). `scripts/` uses them too, resolved by tsx.
- kebab-case filenames under `src/` (ls-lint).
- React Compiler is on — no hand-written `useMemo`/`useCallback`/`memo`.
- Let TypeScript infer; annotate parameters, exported return types, and empty collections only.
- `toInternalRoute()` in `src/lib/utils/routes.ts` is the one sanctioned `as` cast: `typedRoutes` cannot type a runtime string, and it doubles as the open-redirect guard.

## Serialization

Three rules, in order:

1. Name the Prisma row `<Domain>FromDb`, derived from the model via `Prisma.<Model>GetPayload`.
2. `serialize<Domain>(row)` spreads the row and overrides only the fields that need converting — `Decimal` → `number`, `Date` → ISO `string`. Never retype a pass-through field; that goes stale the moment the model gains a column.
3. **Derive the client type from the function**, not the other way round: `export type Serialized<Domain> = ReturnType<typeof serialize<Domain>>`. No `Omit`, no hand-written field list — the later properties in the object literal override the spread at the type level too, so the inferred type is exact.

```ts
type DeviceFromDb = Prisma.DeviceGetPayload<{ include: { readings: true } }>;

export const serializeDevice = (device: DeviceFromDb) => ({
  ...device,
  createdAt: device.createdAt.toISOString(),
  readings: device.readings.map(serializeReading),
});

export type SerializedDevice = ReturnType<typeof serializeDevice>;
```

The serialize function is the one place with no return annotation — annotating it would defeat the inference the type depends on. See `src/lib/devices/serialization.ts`.

## Traffic (external API domain)

`src/lib/traffic/` consumes TomTom's Route Monitoring API and is the reference for talking to a
third party. It differs from `devices/` in three ways worth knowing:

- **`tomtom-service.ts`, not `client.ts`.** fallow's `data` zone is a whitelist of filenames, so an
  arbitrary name lands in no zone and `pnpm analyze` fails. `*-service.ts` is on both that list and
  the ESLint exempt list. `queries.ts` / `mutations.ts` stay reserved for the Prisma side. The same
  whitelist is why `MONITORED_ROUTE_IDS` lives in `schema.ts` rather than a `routes.ts` of its own.
- **`serialization.ts` has no `server-only`.** It is a pure transform with no Prisma import, so
  keeping the marker off makes it unit-testable. `vitest.config.mts` aliases `server-only` to the
  package's empty module so the modules that _do_ need it stay testable too.
- **`TrafficRoute.status` is a Prisma enum mirroring the `routeStatus` Zod union.** Assigning one to
  the other in `mutations.ts` is the whole drift guard — no runtime check, it just stops compiling.
  It is one-directional by nature, and deliberately so: it catches a status the Zod schema accepts
  but the column cannot store (verified — both `upsert` branches error), and stays quiet when the
  column allows a value we never write, which is harmless. Do not derive the Zod enum from the
  generated Prisma one: `schema.ts` is value-imported by `"use client"` code, so that would pull
  Prisma into the browser bundle.

**Thirteen routes, one registry.** `MONITORED_ROUTE_IDS` in `schema.ts` is the whole fan-out list,
and since no user input reaches a route id any more it doubles as the allowlist — nothing can spend
our `TOMTOM_API_KEY` on a route that is not in it. Every read goes through it: `getNetworkTraffic()`
takes no argument, `GET /api/traffic` takes no query parameter, and neither
`recordRouteSnapshotsAction()` nor the cron's `recordTrafficHistory()` takes any input. Adding a route is a one-line change plus whatever its label needs.

- **One route failing must not cost the other twelve.** `readRoute` in `tomtom-service.ts` turns an
  expected `TrafficError` into a `failures` entry and rethrows anything else, so `map/error.tsx` is
  reached only by a genuine fault. `Promise.all`, not `allSettled` — `readRoute` only rejects on a
  real bug, so a rejected entry would be one being swallowed. Read in parallel: `fetchRouteDetails`
  allows itself eight seconds each, so thirteen sequential awaits would be a two-minute page. The
  fan-out is `readMonitoredRoutes(revalidateSeconds?)`, shared by the map and the history job; keep
  its explicit arrow — `.map(readRoute)` would pass each index as `revalidateSeconds`.
- **Geometry is merged on the client, in `TrafficMapPanel`.** Each route is serialized on its own and
  `mergeFeatureCollections` flattens them into the single source mapbox takes. Serving a pre-merged
  copy beside the per-route ones would send the same ~1100 segments twice; serving only the merged
  one would mean dismantling `serializeRouteTraffic`. The merge relies on React Compiler for
  referential stability — were it to re-run every render, mapbox would re-upload the whole
  collection each time.
- **`toRouteLabel` trims the `CW_AU_` prefix** TomTom puts on the twelve corridor routes (the two
  Ringvejen ones carry none). `mutations.ts` applies it too, so the stored name matches the UI.
  Derived rather than curated, which means a route that fails upstream can only be named by its id —
  its `routeName` never arrived.
- **Every feature carries `routeId`.** All thirteen routes share one collection, so the popup names
  the clicked road from the segment's own `routeId` rather than assuming. Segment ids happen to be
  unique across the thirteen (verified against live data), which is what keeps the `segmentIdStr`-keyed
  `findSegment` unambiguous.

Three things that will silently produce wrong output if changed:

1. **Use `segmentIdStr`, never `segmentId`.** TomTom's numeric segment ids exceed
   `Number.MAX_SAFE_INTEGER`; `JSON.parse` corrupts 164 of the 165 ids on route 56634.
   `segmentId` is deliberately absent from the Zod schema so it cannot reach the domain.
2. **GeoJSON is `[longitude, latitude]`** (RFC 7946 §3.1.1) while TomTom returns
   `{ latitude, longitude }`. Everything goes through `toPosition` / `toPositions`. Bounding boxes
   use `TrafficBbox`, not geojson's `BBox`, whose 3D form puts an altitude at index 2.
3. **`fetchedAt` comes from TomTom's `date` response header**, not the local clock — reads are
   cached for 60s, so stamping at serialize time reports a cache hit as fresh.

Auth is Better Auth throughout, with one exception: `/api/cron/*`, whose scheduler has no session
and instead sends `Authorization: Bearer $CRON_SECRET`. `recordRouteSnapshotsAction` and the
`data-access` reads sit behind `requireAuth()`, and `/api/traffic` checks `getSession()` so an API
client gets a 401 instead of an `unauthorized()` interrupt. Segment geometry is static, so it is
stored once per segment and snapshots carry only the speeds that change.

**Nothing refetches on its own.** The map is painted from the RSC's `initialData` and stays there:
`useNetworkTraffic` sets `staleTime: Infinity` and `refetchInterval: false`, so there is no poll, no
refetch on mount, and none on reconnect. The only two ways to new data are a page reload, which
re-renders the RSC, and the Refresh button, which calls `query.refetch()` — `refetch` ignores
`staleTime` by design, which is what makes the button work at all. Do not reintroduce a poll;
thirteen routes on a timer is thirteen route-handler reads a minute per open tab.

`TRAFFIC_REFRESH_SECONDS` is therefore a server-side number only — the `next.revalidate` window on
the upstream read. Within it, Refresh re-reads a warm cache and legitimately hands back the same
payload rather than spending thirteen TomTom calls.

Recording a snapshot passes `revalidateSeconds: 0` to read past that cache, and must therefore also
call `updateTag(trafficTag(routeId))` for **every route it recorded**, or the next read comes out of
the still-warm cache and the map keeps painting the payload the snapshot just superseded. That
failure is silent: nothing errors. Call it from the action body after the fan-out, not inside the
per-route helper, so it is unambiguously on the Server Action's own context. A route that failed has
nothing newer to expire, so it gets no `updateTag`.

**`updateTag` alone is not enough on the client side.** `useRecordNetworkSnapshot` must also
`invalidateQueries` — `initialData` cannot overwrite a cache entry that already holds data, so the
panel would go on rendering the superseded `query.data`. `router.refresh()` does not fix it either:
once `query.data` exists, the RSC's payload is no longer what the panel renders. This used to be
masked by the poll, which corrected it within a window; with the poll gone it would never correct.

`updateTag`, not `revalidateTag`. Next 16 split the two: `revalidateTag(tag, profile)` is
stale-while-revalidate and would serve the superseded payload to the very refresh it triggers, while
`updateTag` expires immediately for read-your-own-writes and is Server-Action-only. Reach for
`updateTag` whenever a mutation's own `router.refresh()` has to observe the write.

> Snapshots are write-only today. They are recorded when something calls `useRecordNetworkSnapshot`
> — there is no scheduled collection of snapshots (the 15-minute job writes `traffic_history`, below) —
> and nothing reads them back yet. The read path
> (`queries.ts`, a history endpoint, a `serializeTrafficSnapshot`) was deleted rather than left
> unused; add it together with whatever renders it, and give the query an explicit `select` so a
> 24h window does not drag every `segmentSpeeds` blob along with it.

## Traffic history (scheduled)

`GET /api/cron/traffic-history` → `recordTrafficHistory()` in `history-service.ts` → one
`trafficMutations.recordHistory`: two `createMany`s in one transaction. It writes one `traffic_history`
row per segment per run (route, `segmentIdStr`, current/average/relative/typical speed, `confidence`)
and one `traffic_route_history` row per route (travel and typical time, delay, completeness,
`routeConfidence`, passable). The route rows are what `slowerThanUsualSince` is tuned and backtested
against; the segment rows alone cannot reconstruct a route's travel time. `confidence` is null on rows
from before 2 Nov 2026. About 1,100 rows a run, four runs an hour, so roughly 450 MB a month. Neon's
free 1 GB blocks writes once full; export and prune before then (see the root's `docs/WORK-PLAN.md`).

- **Rows are keyed by `(recordedAt, routeId, segmentIdStr)`, route rows by `(recordedAt, routeId)`,
  and `recordedAt` is the run's UTC quarter hour**, taken once from the run's own clock, not TomTom's
  `date` header: thirteen reads can straddle a slot boundary. Quarter hours because every Traffic
  Stats slot starts and ends on one. With `skipDuplicates`, a duplicated, retried or manual run in the
  same slot inserts nothing (`inserted: 0`), which is what makes the scheduler's retries safe. No foreign keys: an
  append-only log must not be cascade-deleted with `traffic_route`.
- **`recordedAt` is UTC in a column without a time zone** (`TIMESTAMP(3)`), so Neon's console shows
  every row an hour behind Danish time, two in summer. The rows are right; convert with
  `("recordedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Copenhagen'`. A single `AT TIME ZONE` reads
  the UTC value as Danish time and shifts it the wrong way.
- **Reads uncached and calls no `updateTag`.** That is Server-Action-only, and nothing re-renders off
  this write; the map's 60s cache just ages out. Unlike the snapshot action, this is correct.
- **It is a `*-service.ts`, never an action.** It has no `requireAuth()` — the route checks
  `CRON_SECRET` — and a `"use server"` export would be a public, unauthenticated endpoint.
- **`src/proxy.ts` must not match `api/cron`.** The scheduler has no session; the redirect to
  `/login` is a 307, which `curl --fail` and Vercel Cron both treat as success — a green run that
  recorded nothing. `src/proxy.test.ts` guards it.
- **The route returns 502 when no route answered**, so the scheduled run fails and notifies.

**Scheduler.** Vercel Hobby rejects sub-daily crons at deploy time, so
the root's `.github/workflows/traffic-history.yml` calls the endpoint, using repo secret `CRON_SECRET` and repo
variable `APP_URL` (the production domain — per-deployment URLs sit behind Vercel's deployment
protection). GitHub drops most scheduled runs — 2 of about 50 quarter-hour slots fired overnight on
2–3 Nov 2026 — so a run is a loop, not one call: it calls once per slot, a minute into it, for
340 minutes, then starts its successor with `gh workflow run` (the one event a `GITHUB_TOKEN` may
trigger). The cron at minutes 7, 22, 37 and 52 is only the fallback that restarts a broken chain;
the `traffic-history` concurrency group queues it behind the running loop, and the successor
replaces it, so the run list shows cancelled scheduled runs by design. A failed call fails the run
but still starts the successor; a cancelled run starts none. GitHub disables schedules in a public
repo after 60 days without repository activity, and emails failures to whoever started the run. On
Vercel Pro, replace the workflow with
`"crons": [{ "path": "/api/cron/traffic-history", "schedule": "*/15 * * * *" }]` in the root `vercel.json` —
Vercel sends the same bearer header automatically.

## Traffic stats (historical)

`/history` shows a year of TomTom **Traffic Stats** route-analysis exports, one GeoJSON file per
route in the git-ignored `traffic-history.geojson/`. The domain is `src/lib/traffic-stats/`, not
`traffic-history` — that name already belongs to the 15-minute cron log above.

**What the data is.** Not a day-by-day series: every file averages one date range (199 school-term
weekdays) into one typical weekday of 24 uneven slots, 06:00–18:00 local time — 30 min early, 15 min
through both peaks, one 09:30–14:00 block. So the timeline is time of day, and every slot is drawn
as an equal-width cell.

- **TomTom's `travelTimeRatio` is against the first slot (06:00–06:30), not free flow.** It is 1.0
  for every segment there. The map colours `100 / ratio` through the live map's
  `classifyCongestion` thresholds, so the cut-offs have one home, but the UI says "of 06:00 speed",
  never "free flow" — over 1,500 segment-slots are faster than 06:00. Store TomTom's ratio rather
  than recomputing it from speeds; that drifts by up to 3%.
- **Per-slot values are Postgres scalar lists aligned with `slotStartMinutes`.** Index _i_ of every
  `Float[]`/`Int[]` is the same slot. `alignBySlot` in `serialization.ts` is the only place that
  establishes the order — sorted by start minute, exactly one result per slot — so never write a
  list that did not pass through it. About 1,700 rows, read in one uncached query.
- **Import, don't seed.** `pnpm db:import-traffic-stats [folder]` (`scripts/import-traffic-stats.ts`;
  `[folder]` is relative to `frontend/`) validates every file, then replaces the single dataset in one transaction. It builds its own
  Prisma client with `createPrismaClient` from `@greenwave/database`, like the seed, which is why `traffic-stats/schema.ts` and
  `serialization.ts` carry no `server-only`: tsx cannot load it. Production: run it locally with
  `DATABASE_URL=<neon url>`; dotenv does not override a variable already set. The transaction
  timeout is raised to 60 s because Neon exceeds Prisma's 5 s default.
- **Route names come from `properties.routeName`, never the filename.** macOS stores filenames
  decomposed (NFD); only the `_N` route index is read from the name.
- **Shared map pieces live in `src/components/traffic/`**: the layer style, the legend, the
  `TrafficLineMap` shell and `SegmentPopupFrame`. Both pages match clicks on properties — mapbox
  drops non-numeric feature ids. The line layer has a `line-offset`, so the two directions of a road
  sit side by side; that applies to `/map` too.
- The page embeds about 1 MB of serialized segments. Fine for one authenticated page; move the
  geometry to an endpoint before reusing it anywhere hot.
- Recharts needs `react-is` matching React 19; it is a peer only, hence in fallow's
  `ignoreDependencies`.

## Deviations from the template

- **shadcn/ui 4** dropped the `new-york` style name and the `form` component. The project uses the `radix-nova` preset (neutral base, Lucide, CSS variables) and the `field` primitives with React Hook Form. New components are generated importing `cn` from the `cn` package — rewrite that to `@/lib/utils/cn` to match the alias in `components.json`.
- **TanStack Table is not installed.** Add it when a table actually lands; `fallow` fails on unused dependencies. Recharts arrived with `/history`'s chart.
- Vendored `src/components/ui/**` is exempt from fallow's unused-export rule (`ignoreExports`) and its complexity gate (`health.ignore`), and from the `no-unsafe-*` ESLint rules that shadcn's `chart.tsx` trips. Its advisory CSS-token-drift warnings are expected.
