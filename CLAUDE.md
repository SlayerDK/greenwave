@AGENTS.md

# GreenWave

IoT device + sensor-reading dashboard. Built from `NEXTJS_FULLSTACK_TEMPLATE.md`; this file records only what differs from a stock Next.js setup.

## Commands

| Command                       | Purpose                                  |
| ----------------------------- | ---------------------------------------- |
| `pnpm dev`                    | Dev server                               |
| `pnpm typecheck`              | `next typegen && tsc --noEmit`           |
| `pnpm lint`                   | ESLint                                   |
| `pnpm test`                   | Vitest                                   |
| `pnpm analyze`                | fallow full sweep                        |
| `pnpm analyze:ci`             | fallow changed-file gate (pre-push + CI) |
| `pnpm db:up` / `db:down`      | Local Postgres container                 |
| `pnpm db:migrate` / `db:seed` | Prisma migrate / seed                    |
| `pnpm build-vercel`           | Vercel build: generate, migrate, build   |

pnpm only (`only-allow` preinstall hook). Husky runs lint-staged on `pre-commit` and `ls-lint` + `fallow audit` on `pre-push`.

## Layering

> Only DB-facing files import Prisma. Components and hooks consume `data-access` and `actions` — never raw Prisma.

```
Server render:  RSC page ─────────────────► data-access ──► DB
Mutation:       Client component ─► hook ─► action ──────► DB
```

`src/lib/<domain>/` holds `queries.ts` (pure reads), `mutations.ts` (pure writes), `data-access.ts` (`server-only` reads behind `requireAuth()`), `actions.ts` (`"use server"`, wrapped in `safeAction`), `schema.ts` (Zod), `serialization.ts` (Prisma row → JSON-safe shape). Add `service.ts` only when cross-cutting orchestration appears.

`src/lib/devices/` is the reference domain — copy its shape.

Enforced by `.fallowrc.json` boundaries and by `no-restricted-imports` in `eslint.config.mjs`.

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

- No relative imports; `@/` aliases only (ESLint-enforced). `prisma/seed.ts` uses them too, resolved by tsx.
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
> — there is no scheduled collection of snapshots (the hourly job writes `traffic_history`, below) —
> and nothing reads them back yet. The read path
> (`queries.ts`, a history endpoint, a `serializeTrafficSnapshot`) was deleted rather than left
> unused; add it together with whatever renders it, and give the query an explicit `select` so a
> 24h window does not drag every `segmentSpeeds` blob along with it.

## Traffic history (scheduled)

`GET /api/cron/traffic-history` → `recordTrafficHistory()` in `history-service.ts` → one
`trafficMutations.recordHistory` `createMany`. It writes one `traffic_history` row per segment per
run: route, `segmentIdStr`, current/average/relative/typical speed. About 1,100 rows an hour, so
roughly 110–120 MB a month. Neon's free 1 GB blocks writes once full; prune or upgrade before then.

- **Rows are keyed by `(recordedAt, routeId, segmentIdStr)`, and `recordedAt` is the run's UTC hour**,
  taken once from the run's own clock, not TomTom's `date` header: thirteen reads can straddle an
  hour boundary. With `skipDuplicates`, a duplicated, retried or manual run in the same hour inserts
  nothing (`inserted: 0`), which is what makes the scheduler's retries safe. No foreign keys: an
  append-only log must not be cascade-deleted with `traffic_route`.
- **Reads uncached and calls no `updateTag`.** That is Server-Action-only, and nothing re-renders off
  this write; the map's 60s cache just ages out. Unlike the snapshot action, this is correct.
- **It is a `*-service.ts`, never an action.** It has no `requireAuth()` — the route checks
  `CRON_SECRET` — and a `"use server"` export would be a public, unauthenticated endpoint.
- **`src/proxy.ts` must not match `api/cron`.** The scheduler has no session; the redirect to
  `/login` is a 307, which `curl --fail` and Vercel Cron both treat as success — a green run that
  recorded nothing. `src/proxy.test.ts` guards it.
- **The route returns 502 when no route answered**, so the scheduled run fails and notifies.

**Scheduler.** Vercel Hobby rejects hourly crons at deploy time, so
`.github/workflows/traffic-history.yml` calls the endpoint at minute 7 of every hour (UTC), using
repo secret `CRON_SECRET` and repo variable `APP_URL` (the production domain — per-deployment URLs
sit behind Vercel's deployment protection). GitHub delays or occasionally drops scheduled runs,
disables schedules in a public repo after 60 days without repository activity, and emails failures
to whoever last edited the cron line. On Vercel Pro, replace the workflow with
`"crons": [{ "path": "/api/cron/traffic-history", "schedule": "0 * * * *" }]` in `vercel.json` —
Vercel sends the same bearer header automatically.

## Deployment (Vercel)

- `vercel.json` builds **production only** (`ignoreCommand`): Preview would share production's env
  vars, and with them its database and migrations. To enable previews, first give Preview its own
  database (e.g. Neon preview branching).
- `pnpm build-vercel` runs `prisma generate && prisma migrate deploy && next build`. Generate is
  explicit because `src/generated` is git-ignored and must not depend on `postinstall`.
- `prisma.config.ts` prefers `DATABASE_URL_UNPOOLED`: Migrate's advisory lock cannot be held
  through Neon's pooled `DATABASE_URL`. The runtime keeps the pooled URL.
- Functions are pinned to `fra1`, next to the Neon database in AWS Frankfurt.
- `ENABLE_EXPERIMENTAL_COREPACK=1` must be set on Vercel: it natively runs pnpm 6–10, and
  `packageManager` pins pnpm 12 (whose `allowBuilds` older versions ignore).

## Project-specific deviations from the template

- **Prisma 7** requires `prisma.config.ts`; the datasource URL lives there, not in `schema.prisma`. Client is generated to `src/generated/prisma` (git-ignored).
- **shadcn/ui 4** dropped the `new-york` style name and the `form` component. The project uses the `radix-nova` preset (neutral base, Lucide, CSS variables) and the `field` primitives with React Hook Form. New components are generated importing `cn` from the `cn` package — rewrite that to `@/lib/utils/cn` to match the alias in `components.json`.
- **TanStack Table and Recharts are not installed.** Add them when a table or chart actually lands; `fallow` fails on unused dependencies.
- Vendored `src/components/ui/**` is exempt from fallow's unused-export rule (`ignoreExports` in `.fallowrc.json`). Its advisory CSS-token-drift warnings are expected.
- `pg` and `@ls-lint/ls-lint` are in `ignoreDependencies` — one is a Prisma adapter peer, the other is CLI-only.
