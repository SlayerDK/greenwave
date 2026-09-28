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
third party. It differs from `devices/` in two ways worth knowing:

- **`tomtom-service.ts`, not `client.ts`.** fallow's `data` zone is a whitelist of filenames, so an
  arbitrary name lands in no zone and `pnpm analyze` fails. `*-service.ts` is on both that list and
  the ESLint exempt list. `queries.ts` / `mutations.ts` stay reserved for the Prisma side.
- **`serialization.ts` has no `server-only`.** It is a pure transform with no Prisma import, so
  keeping the marker off makes it unit-testable. `vitest.config.mts` aliases `server-only` to the
  package's empty module so the modules that _do_ need it stay testable too.

Three things that will silently produce wrong output if changed:

1. **Use `segmentIdStr`, never `segmentId`.** TomTom's numeric segment ids exceed
   `Number.MAX_SAFE_INTEGER`; `JSON.parse` corrupts 164 of the 165 ids on route 56634.
   `segmentId` is deliberately absent from the Zod schema so it cannot reach the domain.
2. **GeoJSON is `[longitude, latitude]`** (RFC 7946 §3.1.1) while TomTom returns
   `{ latitude, longitude }`. Everything goes through `toPosition` / `toPositions`.
3. **`fetchedAt` comes from TomTom's `date` response header**, not the local clock — reads are
   cached for 60s, so stamping at serialize time reports a cache hit as fresh.

Auth is Better Auth throughout, with no second scheme: `recordRouteSnapshotAction` and the
`data-access` reads sit behind `requireAuth()`, and the route handlers check `getSession()` so an API
client gets a 401 instead of an `unauthorized()` interrupt. Reads are cached (`next.revalidate`);
recording a snapshot passes `0` to bypass that cache so the row reflects the moment it was taken.
Segment geometry is static, so it is stored once per segment and snapshots carry only the speeds
that change.

> `src/hooks/traffic/use-traffic.ts` has no consumer until a map lands, so it is listed in
> `ignoreFindings` in `.fallowrc.json`. Remove that entry when the map arrives. Snapshots are only
> recorded when something calls `useRecordRouteSnapshot` — there is no scheduled collection.

## Project-specific deviations from the template

- **Prisma 7** requires `prisma.config.ts`; the datasource URL lives there, not in `schema.prisma`. Client is generated to `src/generated/prisma` (git-ignored).
- **shadcn/ui 4** dropped the `new-york` style name and the `form` component. The project uses the `radix-nova` preset (neutral base, Lucide, CSS variables) and the `field` primitives with React Hook Form. New components are generated importing `cn` from the `cn` package — rewrite that to `@/lib/utils/cn` to match the alias in `components.json`.
- **TanStack Table and Recharts are not installed.** Add them when a table or chart actually lands; `fallow` fails on unused dependencies.
- Vendored `src/components/ui/**` is exempt from fallow's unused-export rule (`ignoreExports` in `.fallowrc.json`). Its advisory CSS-token-drift warnings are expected.
- `pg` and `@ls-lint/ls-lint` are in `ignoreDependencies` — one is a Prisma adapter peer, the other is CLI-only.
