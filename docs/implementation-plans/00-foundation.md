# 00 · Foundation: layout, workspace, `shared/` and `database/`

**No container of its own: every container builds on it.** [WP1](../work-plan/wp1-workspace.md) · Christian · was due Fri 6 Nov · Needs nothing · Unblocks every other plan. · [← Plans](README.md)

## Goal

Give the repository the layout in the [README](README.md#repository-layout): one directory per container, `shared/` for the contracts, `database/` for Prisma, and tooling at the root. Then add the contracts and replace the proof of concept's traffic tables with the pipeline's. Afterwards:

- The Next.js app lives in `frontend/` and works exactly as before: `pnpm dev`, `/map` (still reading TomTom until [05](05-frontend.md)), `/history`, every check.
- `@greenwave/shared` holds the MQTT topics, message schemas and congestion rules, importable from Node services **and** the browser.
- `@greenwave/database` holds the Prisma schema, migrations and generated client, importable from the frontend and every service.
- The database has the tables the backend writes and the map reads.

Two PRs, in this order:

1. **The move** (step 1): pure renames and config, no behaviour change. Merge it the day it is green, because every other branch rebases over it.
2. **The contracts and schema** (steps 2–4).

> **Status, Mon 9 Nov:** implemented on two stacked branches, `wp1-layout` (PR 1) and `wp1-contracts` (PR 2, on top of it), not yet pushed. Every check below passed. Where the implementation had to differ from what this plan first said, the text below now says what was done and why (marked _Changed in implementation_).

## Read first

- [README → Repository layout](README.md#repository-layout).
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) → _MQTT design_ (topics, the observation message and its field table, the state message).
- [`CLAUDE.md`](../../CLAUDE.md), all of it: this plan splits it in two.
- Every root config: `package.json`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.mts`, `.fallowrc.json`, `.ls-lint.yml`, `prettier.config.mjs`, `.gitignore`, `.dockerignore`, `.husky/`, `vercel.json`.
- `prisma/schema.prisma`, `prisma.config.ts`, `src/lib/config/prisma.ts`, `src/lib/traffic/serialization.ts` (`classifyCongestion`), `src/lib/traffic/mutations.ts`.
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/turbopack.md` (_Root directory_) and `…/05-config/03-eslint.md` (_Specifying a root directory within a monorepo_).

## Interfaces

This plan **defines** the interfaces everyone else uses. Treat the exports and models below as the contract: change them only with review from both of the others.

## Step 1 · Move the app into `frontend/` (PR 1)

- [x] `git mv` into `frontend/`: `src/`, `public/`, `scripts/`, `next.config.ts`, `postcss.config.mjs`, `components.json`, `Dockerfile`, `tsconfig.json`, `vitest.config.mts`, `vitest.setup.ts`, `AGENTS.md`. `NEXTJS_FULLSTACK_TEMPLATE.md` stays at the root. The moved `Dockerfile` no longer builds (it calls the deleted `build-prod`); a comment at its top says so until [05](05-frontend.md) phase B rewrites it.
- [x] Move your local, git-ignored `traffic-history.geojson/` to `frontend/` too (`pnpm db:import-traffic-stats` defaults to it, relative to the package). Everyone does this once on their own machine.
- [x] `git mv prisma database/prisma` and `git mv prisma.config.ts database/`. In the schema, `output = "../src/generated/prisma"` (now `database/src/generated/prisma`). Delete the stale root `src/generated/`.
- [x] `git mv docker-compose.yml compose.yaml`, the file name Docker's docs use; `docker compose` finds either. Pin `postgres:18-alpine` to its current minor while you are in it, so the demo laptop builds what everyone tested: `postgres:18.6-alpine`, the newest 18 tag on Docker Hub on 9 Nov and the version the local `18-alpine` image already ran.
- [x] **`vercel.json` stays at the root.** Vercel reads it from the project's Root Directory, which is the repo root, and its `ignoreCommand: "exit 0"` is what keeps the frozen recorder from being rebuilt. Moving it would unfreeze production on the next push. Never unfreeze without first setting the Vercel project's Root Directory to `frontend`.

### Workspace

- [x] `pnpm-workspace.yaml`, beside `allowBuilds`:

  ```yaml
  packages:
    - shared
    - database
    - adapter
    - backend
    - predictor
    - loadgen
    - frontend
  ```

  Listing a directory that does not exist yet is fine; each later plan creates its own.

- [x] **A catalog** in the same file, so a version shared by several packages is written once. `shared/` hands Zod schemas to four packages, which must all resolve the same zod; Prisma's 7.10 pin gets one home.

  ```yaml
  catalog:
    zod: ^4.6.5
    typescript: ^5
    tsx: ^4.23.15
    "@types/node": ^24
    prisma: 7.10.0
    "@prisma/client": 7.10.0
    "@prisma/adapter-pg": 7.10.0
    pg: ^8.23.0
    vitest: ^4.1.11
    mqtt: ^5.16.0
    pino: ^10.4.0
    pino-pretty: ^13
  ```

  Every `package.json` then writes `"zod": "catalog:"` instead of a version, for each dependency listed here, and `pnpm add <pkg> --save-catalog` adds a new shared one. A dependency only one package uses keeps its version in that package.

  _Changed in implementation:_ `vitest` is in the catalog too, because every package with tests must list it (see fallow below). fallow warns about catalog entries no package uses yet, so `mqtt`, `pino` and `pino-pretty` each carry a `# fallow-ignore-next-line unused-catalog-entry` comment. Once 03–05 use them, fallow reports those comments as stale: delete them then.

- [x] `frontend/package.json` (new): name `@greenwave/frontend`, `"private": true`. It takes the app's `dependencies` from today's root `package.json` (except the Prisma ones, which go to `database/`; `zod`, `typescript`, `tsx` and `@types/node` as `catalog:`) and the app-only dev dependencies: `@tailwindcss/postcss`, `tailwindcss`, `@testing-library/*`, `@types/react*`, `@types/geojson`, `@vitejs/plugin-react`, `babel-plugin-react-compiler`, `jsdom`, `dotenv-cli`, `tsx`. Scripts:

  ```json
  "dev": "dotenv -e ../.env -- next dev",
  "build": "dotenv -e ../.env -- next build",
  "start": "dotenv -e ../.env -- next start",
  "typecheck": "dotenv -e ../.env -- next typegen && tsc --noEmit",
  "import-traffic-stats": "dotenv -e ../.env -- tsx scripts/import-traffic-stats.ts"
  ```

  _Changed in implementation:_ Next reads `.env` from its own project directory, which is now `frontend/`, so every script that loads `next.config.ts` (and with it the validated env) loads the root `.env` through dotenv-cli. A missing file is fine (Docker), and a variable already set wins. `next build` without `--turbopack`: Turbopack is Next 16's default. Keep `dotenv-cli` out of any package that also depends on `dotenv`: dotenv 18 ships its own `dotenv` binary, which shadows dotenv-cli's.

- [x] `database/package.json` (new):

  ```json
  {
    "name": "@greenwave/database",
    "private": true,
    "type": "module",
    "exports": { ".": "./src/index.ts" },
    "scripts": {
      "generate": "prisma generate",
      "migrate:dev": "prisma migrate dev",
      "migrate:deploy": "prisma migrate deploy",
      "seed": "prisma db seed",
      "typecheck": "tsc --noEmit"
    },
    "dependencies": {
      "@prisma/adapter-pg": "catalog:",
      "@prisma/client": "catalog:",
      "pg": "catalog:"
    },
    "devDependencies": {
      "prisma": "catalog:",
      "dotenv": "^18.0.4",
      "tsx": "catalog:",
      "@types/node": "catalog:",
      "@types/pg": "^8.23.1",
      "typescript": "catalog:"
    }
  }
  ```

  _Changed in implementation:_ `seed` runs `prisma db seed`, so `prisma.config.ts` loads the root `.env` before it starts `migrations.seed` (`tsx prisma/seed.ts`). Run directly, the seed would have no `DATABASE_URL`.

  The catalog pins Prisma to 7.10: npm's `latest` is an 8.0 RC. `frontend/package.json` depends on `"@greenwave/database": "workspace:*"`. If Next cannot resolve the `@prisma/client` it externalises (`serverExternalPackages`), add `@prisma/client` to the frontend's dependencies too.

- [x] `database/prisma.config.ts`: replace `import "dotenv/config"` with `config({ path: "../.env", quiet: true })` from `dotenv` (`quiet`, because unlike `dotenv/config`, `config()` logs a line by default). Keep the `DATABASE_URL_UNPOOLED ?? env("DATABASE_URL")` choice and its comment. A missing `.env` (in Docker) is harmless: dotenv does not override variables already set.
- [x] `database/src/index.ts`:

  ```ts
  import { PrismaPg } from "@prisma/adapter-pg";
  import { PrismaClient } from "./generated/prisma/client";

  export const createPrismaClient = (
    connectionString: string,
    log: ("error" | "warn")[] = ["error"],
  ) => new PrismaClient({ adapter: new PrismaPg({ connectionString }), log });

  export type DatabaseClient = ReturnType<typeof createPrismaClient>;
  export { Prisma, PrismaClient } from "./generated/prisma/client";
  export * from "./generated/prisma/enums";
  ```

  `@greenwave/database` value-exports Prisma, so the frontend may import it **as a type** anywhere but **as a value** only in DB-facing files (see ESLint below).

- [x] `frontend/src/lib/config/prisma.ts` keeps its `globalThis` singleton and calls `createPrismaClient(env.DATABASE_URL, env.NODE_ENV === "development" ? ["error", "warn"] : ["error"])`. Point the other importers of `@/generated/prisma/client` at `@greenwave/database`: `frontend/src/lib/devices/serialization.ts`, `frontend/src/lib/traffic-stats/serialization.ts`, `frontend/scripts/import-traffic-stats.ts`. `database/prisma/seed.ts` imports `../src/index` (relative: it is in a package now).
- [x] Root `package.json`: the workspace root. It keeps `packageManager`, `preinstall` (`only-allow pnpm`), `prepare` (`husky`), `lint-staged`, and the repo-wide dev dependencies: `eslint`, `eslint-config-next`, `typescript`, `typescript-eslint`, `prettier` and its two plugins, `husky`, `lint-staged`, `only-allow`, `fallow`, `@ls-lint/ls-lint`, `vitest`, `@types/node`. Its scripts forward, so every command in `CLAUDE.md` keeps its name:

  ```json
  "dev": "pnpm --filter @greenwave/frontend dev",
  "build": "pnpm --filter @greenwave/frontend build",
  "lint": "eslint",
  "format": "prettier --write .",
  "typecheck": "pnpm -r typecheck",
  "test": "vitest",
  "analyze": "fallow",
  "analyze:ci": "fallow audit",
  "db:up": "docker compose up -d postgres",
  "db:down": "docker compose down",
  "db:migrate": "pnpm --filter @greenwave/database migrate:dev",
  "db:generate": "pnpm --filter @greenwave/database generate",
  "db:seed": "pnpm --filter @greenwave/database seed",
  "db:import-traffic-stats": "pnpm --filter @greenwave/frontend import-traffic-stats",
  "postinstall": "pnpm --filter @greenwave/database generate"
  ```

  Delete `build-prod`, `start-prod`, `start` and `db:push` from the root: [05](05-frontend.md) owns the image, and `migrate` owns migrations. Leave `build-vercel` as it is: Vercel is frozen and never runs it, and [WP8](../work-plan/wp8-clean-up.md) part 2 deletes it.

### Root configs

- [x] `tsconfig.base.json` (new), extended by every package except the frontend (whose `tsconfig.json` is Next's own and stays as it is, `@/*` → `./src/*` included):

  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "lib": ["ES2023", "DOM"],
      "module": "esnext",
      "moduleResolution": "bundler",
      "strict": true,
      "noEmit": true,
      "skipLibCheck": true,
      "isolatedModules": true,
      "resolveJsonModule": true,
      "esModuleInterop": true,
      "types": ["node"]
    }
  }
  ```

  `DOM` is there because `shared/` runs in the browser too; services may drop it in their own `tsconfig.json`. A small root `tsconfig.json` (`extends` the base, `include: ["*.ts", "*.mts"]`) covers the root configs. `shared/tsconfig.json` sets `"types": []`, so a Node global there fails the typecheck (verified).

- [x] `vitest.config.mts` (root): `test: { projects: ["{frontend,shared,database,adapter,backend,predictor,loadgen}"] }`. The frontend keeps its own moved config (jsdom, the `server-only` alias, the setup file); the other directories need no config and run on Node by default. _Changed in implementation:_ a glob, because Vitest refuses a listed directory that does not exist yet; each later plan's directory is picked up as soon as it exists. Projects are named after their `package.json`, so `vitest --project @greenwave/shared` runs one.
- [x] `eslint.config.mjs`:
  - apply `eslint-config-next`'s two configs to `frontend/**` only, and set `settings: { next: { rootDir: "frontend/" } }`;
  - keep the type-checked TypeScript rules for every `**/*.{ts,tsx}`;
  - scope the relative-import ban and the data-layer restrictions to `frontend/src/**`, prefixing every path in that block's `ignores` with `frontend/`;
  - add `{ group: ["@greenwave/database"], allowTypeImports: true }` to the restricted imports, so only the DB-facing files (already in `ignores`) and `frontend/src/lib/config/prisma.ts` value-import it;
  - `globalIgnores`: `frontend/.next/**`, `database/src/generated/**`, `frontend/next-env.d.ts`.
  - _Changed in implementation:_ `frontend/src/lib/config/prisma.ts` and `frontend/scripts/**` join the DB-facing `ignores` (both value-import `@greenwave/database`); the relative-import ban stays on them through a separate `frontend/**` block. eslint-config-next's two bare global-ignore entries are dropped, since they assume the app sits at the root.
- [x] `.fallowrc.json`: prefix every zone pattern with `frontend/` (`frontend/src/lib/*/queries.ts` …); add zones `shared` (`shared/**`, may import nothing), `services` (`adapter/**`, `backend/**`, `predictor/**`, `loadgen/**`, may import `shared` and `database`), and add `database/**` to the `db` zone; let `ui`, `hooks` and `data` import `shared`. `ignorePatterns`: `database/src/generated/**`. If fallow reports a service's `main.ts` as unused, add it under `entry`.

  _Changed in implementation:_ the frontend already had a zone named `shared` (`src/lib/utils/**`, `env.ts`); it is renamed `utils`, so `shared` can mean the package. fallow finds a package's tests only when that package lists `vitest`; without it, it reports them as unused files. Every service therefore adds `"vitest": "catalog:"` to its `devDependencies`.

- [x] `.ls-lint.yml`: the same kebab-case rules for `"{frontend,shared,database,adapter,backend,predictor,loadgen}/src/**"` (ls-lint accepts the brace glob). Ignore `database/src/generated` and `frontend/.next`.
- [x] `prettier.config.mjs`: `tailwindStylesheet: "./frontend/src/app/globals.css"`.
- [x] `.gitignore`: `/node_modules` → `node_modules`; `/.next/` → `frontend/.next/`; `/src/generated` → `database/src/generated`; `/traffic-history.geojson/` → `/frontend/traffic-history.geojson/`; `next-env.d.ts` stays as a bare name (matches anywhere).
- [x] `.dockerignore`: `**/node_modules`, `**/.next`, `**/src/generated`, `.git`, `**/.env`, `.env.*`, `!.env.example`, `frontend/traffic-history.geojson`, `docs`.
- [x] `.husky/` stays at the root (git hooks must); its `ls-lint` and `fallow audit` already run from there.
- [x] `.prettierignore`: `src/generated` → `database/src/generated`.

### `CLAUDE.md` in two

`next dev` writes `AGENTS.md` and a `CLAUDE.md` containing `@AGENTS.md` into the Next project directory, which is now `frontend/` (`node_modules/next/dist/server/lib/generate-agent-files.js`). It only scaffolds both when neither exists; with the moved `AGENTS.md` in place it updates that file's managed block and leaves `CLAUDE.md` alone. Use that:

- [x] `frontend/CLAUDE.md` (new): `@AGENTS.md`, then the Next-specific sections moved from the root: _Layering_, _Reads never go through actions_, _Actions_, _Auth_, _Conventions_, _Serialization_, _Traffic_, _Traffic history_, _Traffic stats_, and the shadcn/TanStack deviations. Paths inside stay `src/…` (relative to `frontend/`).
- [x] Root `CLAUDE.md`: drop the `@AGENTS.md` line; keep the overview, _Commands_ (updated), _Deployment_ and the Prisma deviations; add the layout tree from the README and the rule that containers share code only through `shared/` and `database/`.

### Check the move

- [x] `rm -rf node_modules frontend/node_modules && pnpm install` generates the client into `database/src/generated/prisma`.
- [x] `pnpm dev`: login, `/map` and `/history` work. `pnpm build` succeeds: Turbopack finds the monorepo root through `pnpm-lock.yaml` and resolves `../database` without `transpilePackages` (verified, and for `../shared` in PR 2). `pnpm db:seed` and `pnpm db:import-traffic-stats` work through the new scripts.
- [x] `pnpm lint && pnpm typecheck && pnpm test --run && pnpm analyze` pass, and the pre-push hook's commands (`ls-lint`, `fallow audit`) pass. Prettier still flags `frontend/src/app/(app)/page.tsx` and seven `components/ui/*` files for import order; that predates the move (same result on `main`), and the pre-commit hook re-sorted them in PR 1.
- [x] `git log --follow frontend/src/lib/traffic/serialization.ts` still shows the history.

## Step 2 · `shared/` (PR 2)

Zod only. No `server-only`, no Node built-ins: the browser imports it.

```json
{
  "name": "@greenwave/shared",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": { "zod": "catalog:" },
  "devDependencies": { "typescript": "catalog:", "vitest": "catalog:" }
}
```

```
shared/src/
  index.ts  topics.ts  observation.ts  state.ts  status.ts  congestion.ts
  topics.test.ts  observation.test.ts  congestion.test.ts  state.test.ts  status.test.ts
  fixtures/observation-56634.json
```

- [x] `topics.ts`

  ```ts
  const ROOT = "greenwave/v1";

  export const observationTopic = (cityId: string, routeId: string) =>
    `${ROOT}/${cityId}/routes/${routeId}/observations`;
  export const stateTopic = (cityId: string, routeId: string) =>
    `${ROOT}/${cityId}/routes/${routeId}/state`;
  export const statusTopic = (cityId: string) =>
    `${ROOT}/${cityId}/adapter/status`;

  /** Legacy foundation export, not the approved single-backend subscription. */
  export const SHARED_OBSERVATIONS = `$share/backend/${ROOT}/+/routes/+/observations`;
  export const ALL_STATES = `${ROOT}/+/routes/+/state`;
  export const ALL_STATUSES = `${ROOT}/+/adapter/status`;

  /** The browser learns which city went offline from the topic alone. */
  export const cityOfStatusTopic = (topic: string) => topic.split("/")[2];
  ```

Scope revision, 9 Nov: the topic snippet above records the merged foundation. [04](04-backend.md) now uses the existing `observationTopic("+", "+")` builder for a normal subscription with fixed client ID `backend-1`. Do not copy `SHARED_OBSERVATIONS` into the backend. Unused loadgen workspace patterns and the legacy topic export do not require a load-generator service; removing obsolete shared exports later follows the usual two-reviewer rule.

- [x] `observation.ts`: exactly the message in `ARCHITECTURE.md`. Every speed, length and time is an integer in the TomTom payload, so they are `z.int()`.

  ```ts
  /** No "/", "+" or "#": an id becomes a topic level. */
  const topicLevel = z.string().regex(/^[a-z0-9_-]+$/i);

  export const toEventId = (
    cityId: string,
    routeId: string,
    observedAt: string,
  ) => `${cityId}:${routeId}:${observedAt}`;

  export const observationSegmentSchema = z.object({
    id: z.string(), // TomTom's segmentIdStr: the number exceeds MAX_SAFE_INTEGER
    lengthM: z.int().nonnegative(),
    currentSpeedKmh: z.int().nonnegative(),
    averageSpeedKmh: z.int().nonnegative(),
    typicalSpeedKmh: z.int().nonnegative(),
    relativeSpeedPct: z.int().nonnegative(),
    confidencePct: z.int().min(0).max(100),
    coordinates: z.array(z.tuple([z.number(), z.number()])).min(2), // [longitude, latitude]
  });

  export const observationRouteSchema = z.object({
    name: z.string(), // without TomTom's CW_AU_ prefix
    lengthM: z.int().nonnegative(),
    travelTimeSec: z.int().nonnegative(),
    typicalTravelTimeSec: z.int().nonnegative(),
    delaySec: z.int(),
    passable: z.boolean(),
  });

  export const observationSchema = z
    .object({
      eventId: z.string(),
      schemaVersion: z.literal(1),
      source: z.enum(["live", "fixture", "loadtest"]),
      cityId: topicLevel,
      routeId: topicLevel,
      observedAt: z.iso.datetime(), // UTC "Z"; milliseconds allowed
      route: observationRouteSchema,
      segments: z.array(observationSegmentSchema).min(1),
    })
    .refine((o) => o.eventId === toEventId(o.cityId, o.routeId, o.observedAt), {
      message: "eventId must be {cityId}:{routeId}:{observedAt}",
      path: ["eventId"],
    });

  export type Observation = z.infer<typeof observationSchema>;
  export type ObservationSegment = z.infer<typeof observationSegmentSchema>;
  ```

- [x] `congestion.ts`: move `classifyCongestion` and `CongestionLevel` here from `frontend/src/lib/traffic/serialization.ts`, unchanged (it stays structural on `currentSpeed`/`relativeSpeed` so `/history` can use its own baseline). Add:

  ```ts
  export const CONGESTION_LEVELS = [
    "free",
    "light",
    "moderate",
    "heavy",
    "closed",
  ] as const;
  /** Share of a route's length at moderate or worse that makes the route congested. */
  export const CONGESTED_LENGTH_SHARE = 0.2;
  /** travelTime ≥ this × typicalTravelTime makes a route slower than usual. */
  export const SLOWER_THAN_USUAL_RATIO = 1.3;
  /** Readings in a row before either route flag switches, on or off. */
  export const FLAG_SWITCH_READINGS = 3;
  /** Retained state expires after this; the map greys a route this old. */
  export const STATE_TTL_SECONDS = 300;
  ```

  Then point every importer at `@greenwave/shared` directly (no re-export from `serialization.ts`), all under `frontend/src/`: `lib/traffic/serialization.ts`, `app/(app)/history/_lib/slot-features.ts`, `app/(app)/history/_components/time-slot-timeline.tsx`, `app/(app)/history/_components/stats-segment-popup.tsx`, `components/traffic/congestion-style.ts`. The frontend depends on `"@greenwave/shared": "workspace:*"`.

- [x] `state.ts`: the observation plus what the backend derives.

  ```ts
  export const stateSchema = observationSchema.safeExtend({
    // safeExtend: the base has a refinement
    route: observationRouteSchema.extend({
      congestedSince: z.iso.datetime().nullable(),
      slowerThanUsualSince: z.iso.datetime().nullable(),
    }),
    segments: z
      .array(
        observationSegmentSchema.extend({
          congestion: z.enum(CONGESTION_LEVELS),
        }),
      )
      .min(1),
  });
  export type RouteState = z.infer<typeof stateSchema>;
  ```

  Assert in a test that `CongestionLevel` (inferred from `classifyCongestion`) and `(typeof CONGESTION_LEVELS)[number]` are the same type, so the function and the enum cannot drift.

- [x] `status.ts`: `adapterStatusSchema = z.object({ status: z.enum(["online", "offline"]), at: z.iso.datetime() })`, plus `onlineStatus(at = new Date())` and `offlineStatus(at = new Date())` returning the JSON string. For the Last Will, `at` is when the will was registered, at connect time.
- [x] `index.ts` re-exports all of the above.
- [x] `fixtures/observation-56634.json`: `frontend/src/lib/traffic/fixtures/route-details.json` converted to an observation (`[longitude, latitude]`, `segmentIdStr` → `id`). The TomTom fixture has no response date, so `observedAt` is `2026-10-19T09:41:00Z`, the time `ARCHITECTURE.md` shows for this route, and `source` is `live` as there. Use a script that keeps big integers exact (Python's `json` does; JavaScript's `JSON.parse` does not, so read `segmentIdStr`, never `segmentId`). [03](03-adapter.md) writes the real converter; this file feeds the contract tests and can supply [07](07-loadgen.md)'s bounded verification inputs.

## Step 3 · The schema (PR 2)

One migration, `pnpm db:migrate --name pipeline_tables` (`database/prisma/migrations/20261109124431_pipeline_tables`). New tables use `@db.Timestamptz(3)`, so local-time queries need one `AT TIME ZONE`, not the double conversion the old `TIMESTAMP(3)` tables need. Every id is a string.

- [x] Delete `TrafficSnapshot` and the `TrafficRouteStatus` enum. **Keep `TrafficHistory` and `TrafficRouteHistory` unchanged**: the frozen Vercel recorder writes them in Neon, and they are [06](06-predictor.md)'s backfill source.
- [x] Replace `TrafficRoute` and `TrafficSegment` (the old rows are only snapshot leftovers; geometry returns with the first observation), and add the rest:

```prisma
/// Mirrors CONGESTION_LEVELS in shared/. The backend assigns
/// classifyCongestion's result to this column, so a level added on one side
/// only stops compiling (the same guard CLAUDE.md describes for routeStatus).
enum TrafficCongestion {
  free
  light
  moderate
  heavy
  closed

  @@map("traffic_congestion")
}

/// A monitored route of one city. Upserted by the backend from every observation.
model TrafficRoute {
  cityId    String
  id        String
  /// Without TomTom's CW_AU_ prefix.
  name      String
  lengthM   Int
  createdAt DateTime @default(now()) @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @db.Timestamptz(3)

  segments TrafficSegment[]
  state    TrafficRouteState?

  @@id([cityId, id])
  @@map("traffic_route")
}

/// Static geometry, inserted once (createMany + skipDuplicates). `id` is
/// TomTom's segmentIdStr; segment ids are unique across Aarhus's routes, but
/// the key includes the route anyway.
model TrafficSegment {
  cityId      String
  routeId     String
  id          String
  ordinal     Int
  lengthM     Int
  /// GeoJSON [longitude, latitude] pairs.
  coordinates Json

  route TrafficRoute         @relation(fields: [cityId, routeId], references: [cityId, id], onDelete: Cascade)
  state TrafficSegmentState?

  @@id([cityId, routeId, id])
  @@index([cityId, routeId, ordinal])
  @@map("traffic_segment")
}

/// The newest reading of a route, and the two flags with the streaks that
/// switch them. Written only when an observation is newer than `observedAt`.
model TrafficRouteState {
  cityId               String
  routeId              String
  eventId              String
  observedAt           DateTime @db.Timestamptz(3)
  travelTimeSec        Int
  typicalTravelTimeSec Int
  delaySec             Int
  passable             Boolean

  /// When the flag is on: the first reading of the run that switched it on.
  congestedSince              DateTime? @db.Timestamptz(3)
  /// First reading of the current run that disagrees with the flag, if any.
  congestedPendingSince       DateTime? @db.Timestamptz(3)
  /// Length of that run; the flag switches when it reaches FLAG_SWITCH_READINGS.
  congestedStreak             Int       @default(0)
  slowerThanUsualSince        DateTime? @db.Timestamptz(3)
  slowerThanUsualPendingSince DateTime? @db.Timestamptz(3)
  slowerThanUsualStreak       Int       @default(0)

  route TrafficRoute @relation(fields: [cityId, routeId], references: [cityId, id], onDelete: Cascade)

  @@id([cityId, routeId])
  @@map("traffic_route_state")
}

/// The newest reading of each segment, written with its route state.
model TrafficSegmentState {
  cityId           String
  routeId          String
  segmentId        String
  observedAt       DateTime          @db.Timestamptz(3)
  currentSpeedKmh  Int
  averageSpeedKmh  Int
  typicalSpeedKmh  Int
  relativeSpeedPct Int
  confidencePct    Int
  congestion       TrafficCongestion

  segment TrafficSegment @relation(fields: [cityId, routeId, segmentId], references: [cityId, routeId, id], onDelete: Cascade)

  @@id([cityId, routeId, segmentId])
  @@map("traffic_segment_state")
}

/// One row per segment per UTC quarter hour of `observedAt`. Sums, not
/// averages: adding to a sum is exact, and the mean is sum / sampleCount.
/// Time-first key so writes append at the index's right edge. No relations:
/// an append-only log must never be cascade-deleted with its route. Fixture
/// readings never land here.
model TrafficSegmentHistory {
  bucketStart      DateTime @db.Timestamptz(3)
  cityId           String
  routeId          String
  segmentId        String
  sampleCount      Int
  currentSpeedSum  Int
  averageSpeedSum  Int
  typicalSpeedSum  Int
  relativeSpeedSum Int

  @@id([bucketStart, cityId, routeId, segmentId])
  @@map("traffic_segment_history")
}

/// One row per observation the backend has processed; the insert that finds
/// the row already there is how a duplicate delivery is detected.
model TrafficObservationReceipt {
  eventId    String   @id
  receivedAt DateTime @default(now()) @db.Timestamptz(3)

  @@index([receivedAt])
  @@map("traffic_observation_receipt")
}
```

[06](06-predictor.md) adds `TrafficStatsRouteLink`, `TrafficForecastRun` and `TrafficSegmentForecast` in its own migration.

_Changed in implementation:_ Prisma generated `ALTER TABLE`s that add required columns without a default, which fail on any database still holding snapshot rows (every local one, and Neon). The migration instead drops `traffic_snapshot`, `traffic_segment` and `traffic_route` and recreates the last two, using Prisma's own `CREATE TABLE` output. Verified on a fresh database (no drift against the schema) and on a copy of a populated local one (47 snapshots, 13 routes, 1,079 segments), where `traffic_history`, `traffic_route_history` and the Traffic Stats tables kept their rows.

**Apply it to your own local database** with `pnpm db:migrate` after checking out the branch. It drops your local snapshot tables, as intended.

## Step 4 · Remove what the schema change breaks (PR 2)

Dropping `TrafficSnapshot` and replacing `TrafficRoute` breaks the snapshot path, which nothing reads. Remove it in the same PR (it was going in [05](05-frontend.md)'s phase D anyway). All paths under `frontend/src/`:

- [x] Delete `lib/traffic/actions.ts`, `lib/traffic/actions.test.ts` and `app/(app)/map/_components/record-snapshot-button.tsx`; drop the button from `traffic-map-panel.tsx`.
- [x] Remove `trafficMutations.recordSnapshot` from `lib/traffic/mutations.ts`, and its now-unused `toPositions`/`toRouteLabel` import. `toPositions` is then used only inside `serialization.ts` and is no longer exported. **Keep `recordHistory`**: the cron route still calls it, and the tables it writes are unchanged.
- [x] Remove `useRecordNetworkSnapshot` from `hooks/traffic/use-traffic.ts`. `trafficTag` stays: `tomtom-service.ts` still uses it.
- [x] `frontend/CLAUDE.md`: delete the paragraphs about the snapshot action, `updateTag` after a snapshot and `useRecordNetworkSnapshot`'s `invalidateQueries`, and the "Snapshots are write-only" note. Also gone: the `TrafficRoute.status` drift-guard bullet (the enum no longer exists; the schema comment on `TrafficCongestion` and the root `CLAUDE.md` carry that rule now). [05](05-frontend.md) phase D rewrites the rest of the traffic section.

## Tests

- `shared/src/observation.test.ts`: the fixture parses; every `segments[].id` is an exact digit string (the conversion script asserted each equals the TomTom fixture's `segmentIdStr`; the test cannot import the frontend's fixture across the boundary); a wrong `eventId` fails; an `observedAt` with milliseconds passes; a `routeId` containing `/` or `+` fails.
- `shared/src/congestion.test.ts`: the thresholds at 0, 49, 50, 74, 75, 89 and 90 (move the existing cases from `frontend/src/lib/traffic/serialization.test.ts`).
- `shared/src/topics.test.ts`: the builders, and `cityOfStatusTopic(statusTopic("aarhus")) === "aarhus"`.
- `shared/src/state.test.ts` and `status.test.ts`: the fixture plus derived fields parses as state, keeps the `eventId` check and needs both flags; status messages round-trip.
- The frontend's tests pass unchanged except for the moved and deleted ones: 107 tests in 16 files after PR 2.

## Pitfalls

- **Do not move `vercel.json`.** See step 1.
- **Never derive the Zod congestion enum from the Prisma enum.** `shared/` is value-imported by `"use client"` code; that would pull Prisma into the browser bundle.
- **Ids are strings.** `segmentIdStr`, never `segmentId` (CLAUDE.md, traffic gotcha 1). Route ids are strings in the new tables, but integers in the old `traffic_history`.
- Run Prisma through the root scripts or `pnpm --filter @greenwave/database exec prisma …`, never `npx prisma` at the root: `prisma.config.ts` lives in `database/`.
- Open branches touching the app rebase over PR 1's renames. Git follows them, but tell the others before merging.

## Done when

- [x] PR 1: the checks under _Check the move_ pass and the app behaves exactly as before.
- [x] PR 2: `pnpm db:up && pnpm db:migrate` applies `pipeline_tables` to a fresh database, and `\dt` lists `traffic_route_state`, `traffic_segment_state`, `traffic_segment_history` and `traffic_observation_receipt`.
- [x] PR 2: `pnpm lint && pnpm typecheck && pnpm test --run && pnpm analyze` pass, and `pnpm build` succeeds.
- [ ] M1: the architecture and MQTT-design report sections have a draft ([WP9](../work-plan/wp9-report-and-demo.md)).

## Not in this plan

- The broker and every Dockerfile: [01](01-broker.md), [02](02-migrate.md), and each service's plan.
- Any reader of the new tables: [05](05-frontend.md), [06](06-predictor.md).
- Removing the TomTom path, `/api/traffic` and the cron route: [05](05-frontend.md).
