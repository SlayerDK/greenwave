# Next.js Fullstack Project Template

> This document describes **how** the codebase is structured and **how** code is written. It is the baseline every new project starts from: stack, folder layout, layering rules, and auth. Nothing beyond that is assumed — features like multi-tenancy, billing, cron, or webhooks get added per project, not inherited.

---

## Stack

> Pin exact versions in `package.json`; the majors below are what these conventions assume.

| Concern            | Choice                                                               |
| ------------------ | -------------------------------------------------------------------- |
| Framework          | **Next.js 16** — App Router, Turbopack, React Compiler, typed routes |
| UI runtime         | **React 19**                                                         |
| Language           | **TypeScript 5** (strict)                                            |
| Database           | **PostgreSQL**                                                       |
| ORM                | **Prisma 7** (`@prisma/adapter-pg`)                                  |
| Auth               | **Better Auth 1.6** (email/password + session)                       |
| Client data/cache  | **TanStack Query 5**                                                 |
| Styling            | **Tailwind CSS 4**                                                   |
| Components         | **shadcn/ui** (New York style, RSC-enabled) on **Radix UI**          |
| Forms + validation | **React Hook Form 7** + **Zod 4** (`@hookform/resolvers`)            |
| Env validation     | `@t3-oss/env-nextjs` (Zod-validated env at boot)                     |
| URL state          | **nuqs**                                                             |
| Tables             | **TanStack Table 8**                                                 |
| Charts             | **Recharts** (if analytics needed)                                   |
| Icons              | **Lucide React**                                                     |
| Toasts             | **Sonner**                                                           |
| Tests              | **Vitest 4**                                                         |
| Package manager    | **pnpm** (enforced via `only-allow` preinstall hook)                 |

**Infrastructure**

- **Docker Compose** for the local Postgres container.
- **Standalone Docker build** for deployment (single Next.js container). Toggle `output: "standalone"` behind an env flag so local dev on Windows/macOS isn't affected.

**Code quality**

- **fallow** — static code analysis: dead code, duplication, circular deps, complexity hotspots, and **architecture boundaries** (this is what enforces the layering rules below).
- **ESLint + Prettier** — per-file lint and formatting. fallow reasons about the module graph, ESLint about single files; they don't overlap.
- **Husky + lint-staged** on `pre-commit`; **ls-lint** for filename casing.

**Optional add-ons** — wire these in only when a project needs them, and document them in that project's `CLAUDE.md`:

- Better Auth **Organization** plugin (multi-tenant) or **API-Key** plugin.
- Role/permission checks, feature tiers, usage limits, billing/paywall.
- `api/cron/` scheduled tasks, `api/webhooks/` inbound webhooks.

---

## Project structure

```
<project>/
├── src/
│   ├── app/                    # App Router: pages, layouts, route handlers
│   │   ├── (auth)/             # login / signup / reset-password (public)
│   │   ├── (app)/              # authenticated shell
│   │   │   └── …pages
│   │   └── api/
│   │       └── auth/[...all]/  # Better Auth handler
│   ├── components/             # shadcn/ui primitives + shared feature components
│   ├── hooks/                  # TanStack Query hooks wrapping actions / API routes
│   ├── lib/
│   │   ├── <domain>/           # one folder per domain (see per-domain layout)
│   │   ├── auth/               # Better Auth server + client config, session helpers
│   │   ├── config/             # env.ts, prisma.ts (client singleton)
│   │   └── utils/              # cross-cutting helpers (cn, formatters, …)
│   ├── providers/              # React context providers
│   ├── generated/              # Prisma client (generated, git-ignored)
│   └── proxy.ts                # Next 16's renamed middleware (auth gate)
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── public/
├── scripts/                    # one-off / maintenance scripts (tsx)
├── docker-compose.yml
├── Dockerfile
├── next.config.ts
├── eslint.config.mjs
├── .fallowrc.json
├── vitest.config.mts
└── CLAUDE.md                   # this file's rules, tailored to the project
```

---

## Layered architecture

The one rule everything else serves:

> **Only the DB-facing files may import Prisma. Components and hooks consume** `data-access` **and** `actions` **— never raw Prisma, never raw queries.**

Data flow:

```
Server render:  RSC page ─────────────────► data-access ──► DB
Mutation:       Client component ─► hook ─► action ──────► DB
                                              │
                              (may reuse) ────┴──► data-access
```

### Data layer — DB-facing, `"server-only"`

- `queries.ts` — pure Prisma reads, no auth. Exports a `<domain>Queries` object.
- `mutations.ts` — pure Prisma writes, no auth. Exports a `<domain>Mutations` object.
- `data-access.ts` — `"server-only"` reads wrapped in auth. Consumed by RSC pages, route handlers, and hook-backing helpers.
- `actions.ts` — `"use server"` mutations (and occasional reads). Same auth contract. Consumed by client hooks.
- `service.ts` (or `<name>-service.ts`) — cross-cutting orchestration/computation. The only place besides `actions.ts` allowed to call mutations directly, and only for server-only cross-cutting logic.

### Hooks layer — client-side

- `src/hooks/<domain>/use-*.ts` — TanStack Query `useQuery`/`useMutation` wrapping server actions (or thin route handlers). Owns caching, invalidation, and optimistic updates.

### UI layer

- **Server Components** call `data-access` directly. Lean on the App Router + SSR — most pages render on the server.
- **Client Components** consume hooks (which call actions). They never import `data-access` or Prisma.

---

## Per-domain layout — `src/lib/<domain>/`

| File               | Purpose                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| `queries.ts`       | Pure Prisma reads, no auth. Exports `<domain>Queries`.                  |
| `mutations.ts`     | Pure Prisma writes, no auth. Exports `<domain>Mutations`.               |
| `data-access.ts`   | `"server-only"` reads wrapped in auth.                                  |
| `actions.ts`       | `"use server"` mutations. Auth-gated. Wrapped in `safeAction()`.        |
| `service.ts`       | Cross-cutting orchestration; may call mutations directly (server-only). |
| `schema.ts`        | Zod input schemas shared between forms and actions.                     |
| `serialization.ts` | Prisma row → JSON-safe client shape (strips `Decimal` / `Date`).        |

Keep folders flat and small; `queries.ts` + `data-access.ts` is a complete domain. Add the rest only when the domain actually needs them.

---

## File co-location

- **Reused across routes, or generic UI** → `src/components/<domain>/`.
- **Used by exactly one route subtree** → co-locate in that route, underscore-prefixed so the router ignores it: `_components/`.

---

## Auth & routing

Better Auth is the one feature the template bootstraps end to end:

- `src/lib/auth/auth.ts` — server instance (Prisma adapter, email/password, session config).
- `src/lib/auth/auth-client.ts` — client instance for sign-in/sign-up/sign-out.
- `src/app/api/auth/[...all]/route.ts` — the handler.
- `src/lib/auth/session.ts` — `getSession()` and `requireAuth()`; `requireAuth()` is what `data-access.ts` / `actions.ts` call.
- `src/proxy.ts` — Next 16's renamed middleware. Redirects unauthenticated requests away from `(app)`. Its matcher **excludes** `/api/auth`.

Route groups carry the gating hierarchy: `(auth)/` public, `(app)/` authenticated.

Anything richer — roles, permissions, organizations, plan gates — is a per-project addition layered on top of `requireAuth()`, not part of the template.

---

## Actions

Wrap every action body in `safeAction(async () => { ... })` and return `ActionResult<T>`. **Don't throw for expected failures** — return `{ success: false, error }`. `safeAction` is the last-resort net for genuinely unexpected errors and rethrows Next.js navigation signals.

```ts
export const createXAction = async (
  input: XInput,
): Promise<ActionResult<{ id: string }>> =>
  safeAction(async () => {
    const { user } = await requireAuth();

    const parsed = xSchema.safeParse(input);
    if (!parsed.success)
      return { success: false, error: parsed.error.issues[0].message };

    const { id } = await xMutations.create({
      ...parsed.data,
      userId: user.id,
    });

    revalidatePath("/x");
    return { success: true, data: { id } };
  });
```

---

## Conventions

### Imports

- **No relative imports.** Always use `@/` path aliases. (ESLint-enforced.)
- Prefer inline type imports: `import { type Foo, bar } from "..."`.

### Type inference

Let TypeScript infer. **Remove an annotation, cast, or assertion if removing it still compiles with the same narrowed type.**

- No redundant annotations: `const count = 5`, not `const count: number = 5`.
- No `as` casts when the value already has the target type. To constrain, annotate the variable instead: `const payload: CreateUserInput = { ... }`.
- No `!` non-null assertions. Handle `undefined` explicitly (`if (!first) throw …`) or narrow with a guard.
- **Do** annotate: function parameters, exported/public return types, empty collections (`const ids: string[] = []`), and validate `unknown` boundaries (`JSON.parse`, `fetch().json()`) with Zod instead of casting.

### Clean code (Robert C. Martin)

- Small, single-purpose functions. **Stepdown ordering** — caller above callee.
- Meaningful names; no abbreviations that aren't already domain vocabulary.
- Comments only for non-obvious _why_ (hidden constraint, workaround, surprising invariant). No restating-the-code comments, no `// removed`, no PR/issue references.
- No dead code, commented-out blocks, or speculative abstractions. Three similar lines beat a premature helper.
- Validate only at boundaries (user input, external APIs). Trust framework/type guarantees — no defensive null checks against values the types already prove non-null.

### Memoization

The **React Compiler is enabled** — do not hand-write `useMemo` / `useCallback` / `memo` for ordinary render optimization. Reach for them only when profiling shows the compiler missed something.

### Filenames

**kebab-case** for all `.ts/.tsx/.css/.js/.jsx` under `src/` (ls-lint-enforced).

---

## Static analysis — fallow

fallow turns the layering rules into CI failures so they can't drift, and keeps the codebase free of dead weight.

`.fallowrc.json`:

```jsonc
{
  "$schema": "./node_modules/fallow/schema.json",
  "ignorePatterns": ["src/generated/**", "**/*.generated.ts"],
  "boundaries": {
    "zones": [
      {
        "name": "db",
        "patterns": ["src/lib/config/prisma.ts", "src/generated/**"],
      },
      {
        "name": "data",
        "patterns": [
          "src/lib/*/queries.ts",
          "src/lib/*/mutations.ts",
          "src/lib/*/data-access.ts",
          "src/lib/*/actions.ts",
          "src/lib/*/service.ts",
          "src/lib/*/*-service.ts",
          "src/lib/*/serialization.ts",
          "src/lib/auth/**",
        ],
      },
      { "name": "hooks", "patterns": ["src/hooks/**"] },
      {
        "name": "ui",
        "patterns": ["src/app/**", "src/components/**", "src/providers/**"],
      },
      {
        "name": "shared",
        "patterns": ["src/lib/utils/**", "src/lib/config/env.ts"],
      },
    ],
    "rules": [
      {
        "from": "ui",
        "allow": ["data", "hooks", "shared"],
        "allowTypeOnly": ["db"],
      },
      { "from": "hooks", "allow": ["data", "shared"], "allowTypeOnly": ["db"] },
      { "from": "data", "allow": ["db", "shared"] },
      { "from": "shared", "allow": [] },
    ],
  },
}
```

Run it:

| Command                 | When                                                                  |
| ----------------------- | --------------------------------------------------------------------- |
| `pnpm fallow`           | Full pipeline — dead code, duplication, health. Local sweep.          |
| `pnpm fallow audit`     | Changed-file gate with pass/warn/fail. **Wire into CI and pre-push.** |
| `pnpm fallow dead-code` | Unused code, unused deps, circular deps, boundary violations.         |
| `pnpm fallow recommend` | Regenerate a stack-aware config after big structural changes.         |

ESLint stays for per-file rules: base config is `eslint-config-next` (core-web-vitals + typescript) plus `typescript-eslint` recommended-type-checked + stylistic-type-checked, with `no-restricted-imports` banning the `.*` relative-import pattern.

---

## Tooling & scripts

`package.json` (pnpm):

```jsonc
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "analyze": "fallow",
  "analyze:ci": "fallow audit",
  "typecheck": "next typegen && tsc --noEmit",
  "test": "vitest",
  "db:up": "docker compose up -d", // local Postgres
  "db:down": "docker compose down",
  "db:migrate": "prisma migrate dev",
  "db:push": "prisma db push",
  "db:generate": "prisma generate",
  "db:seed": "dotenv -e .env -- tsx prisma/seed.ts",
  "build-prod": "prisma generate && next build --turbopack",
  "start-prod": "prisma migrate deploy && node server.js",
}
```

- `preinstall: npx only-allow pnpm` locks the package manager.
- `postinstall: prisma generate` keeps the client in sync.
- `prepare: husky` installs git hooks; run **lint-staged** on `pre-commit` and `fallow audit` on `pre-push`.

---

## Key config files

`next.config.ts` — enable the compiler and typed routes; make standalone opt-in:

```ts
import "@/lib/config/env"; // validate env at boot (fail fast)
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  typedRoutes: true,
  serverExternalPackages: ["@prisma/client"],
  experimental: { authInterrupts: true }, // enables forbidden()/unauthorized()
  ...(process.env.STANDALONE_BUILD === "1" && {
    output: "standalone" as const,
    transpilePackages: ["@t3-oss/env-nextjs", "@t3-oss/env-core"],
  }),
};

export default nextConfig;
```

`components.json` — shadcn/ui: `style: "new-york"`, `rsc: true`, `baseColor: neutral`, CSS variables, Lucide icons, aliases pointing at `@/components`, `@/lib`, `@/hooks`, `@/lib/utils/cn`.

`src/lib/config/env.ts` — `@t3-oss/env-nextjs` schema; import it from `next.config.ts` so a missing/invalid env var fails the build rather than surfacing at runtime.

---

## Bootstrapping a new project

1. `pnpm create next-app` → App Router + TypeScript; set up the `@/*` path alias.
2. Add Prisma (`@prisma/adapter-pg`), Better Auth, TanStack Query, Tailwind 4 + shadcn/ui, RHF + Zod, `@t3-oss/env-nextjs`.
3. Copy `eslint.config.mjs`, `.fallowrc.json`, `.ls-lint.yml`, `prettier.config.mjs`, Husky + lint-staged, `docker-compose.yml`.
4. Create `src/lib/config/{env,prisma}.ts` and the `src/lib/auth/` set (`auth.ts`, `auth-client.ts`, `session.ts`) + the `[...all]` route handler.
5. Add `safeAction` + the `ActionResult<T>` type, and `src/proxy.ts` for the auth gate.
6. Scaffold the `(auth)` / `(app)` route groups with login, signup, and an authenticated shell layout.
7. Scaffold the first `src/lib/<domain>/` folder following the per-domain layout, then `pnpm analyze` to confirm boundaries hold.
8. Tailor `CLAUDE.md` from this template — keep only what differs from a stock Next.js setup, and document any optional add-ons this project pulled in.
