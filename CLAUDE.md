# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Dokploy is a self-hostable PaaS (deploy apps, databases, Docker Compose stacks) built as a pnpm monorepo. The core product is `apps/dokploy`, a Next.js app (pages router) that is both the UI and the tRPC backend, backed by `@dokploy/server` (`packages/server`) which holds almost all business logic (services, db schema, providers, docker/traefik orchestration).

## Workspace layout

- `apps/dokploy` — Next.js app: UI (`components/`, `pages/`, `hooks/`) + backend (`server/`: tRPC routers in `server/api/routers`, queues, wss, migration scripts). Also owns the Drizzle migration files (`drizzle/`) even though schema is defined in `packages/server`.
- `packages/server` (`@dokploy/server`) — shared server package: db schema (`src/db/schema`), business logic (`src/services`), git/docker/traefik provider integrations (`src/utils`), auth (`src/auth`, `better-auth`), email templates. `apps/dokploy` and `apps/api` both depend on this via `workspace:*`.
- `apps/api` (`@dokploy/api`) — standalone Hono API server (port 4000) using `@dokploy/server`.
- `apps/schedules` (`@dokploy/schedules`) — Hono service (port 4001) for scheduled jobs, uses BullMQ.
- `apps/monitoring` — separate Go service for CPU/memory/network/container monitoring (not part of the pnpm workspace).

## Commands

Run from repo root unless noted. Requires Node matching `.nvmrc`/`engines` and pnpm.

```bash
pnpm install
cp apps/dokploy/.env.example apps/dokploy/.env
pnpm run dokploy:setup    # one-time: spins up required services (needs Docker)
pnpm run server:script     # switches @dokploy/server to run from source (scripts/switchToSrc.js)
pnpm run dokploy:dev       # starts the dev server at http://localhost:3000
```

- Build: `pnpm run build` (all packages) or `pnpm run dokploy:build` (just the app).
- Typecheck: `pnpm run typecheck` (runs `tsc --noEmit` in every package).
- Lint/format: `pnpm run format-and-lint` (check only) / `pnpm run format-and-lint:fix` (biome, applies fixes). Biome, not Prettier/ESLint — configure editors accordingly.
- Tests: `pnpm test` (delegates to `apps/dokploy`'s vitest). To run a single test file: `pnpm --filter=dokploy exec vitest run __test__/path/to/file.test.ts --config __test__/vitest.config.ts`. Tests live under `apps/dokploy/__test__/`, config is `apps/dokploy/__test__/vitest.config.ts`.
- Drizzle/db (run inside `apps/dokploy`, config points at `packages/server` schema): `pnpm --filter=dokploy run migration:generate`, `migration:run`, `db:studio`, `db:push`.
- OpenAPI spec regeneration: `pnpm run generate:openapi` (writes `openapi.json` at repo root from the tRPC routers).
- Reset a user's password locally: `pnpm --filter=dokploy run reset-password [email]`.

Per-package dev servers (when working on just one piece): `pnpm --filter=@dokploy/api run dev`, `pnpm --filter=@dokploy/schedules run dev`, `pnpm --filter=server run dev`.

## Architecture notes

- **tRPC is the API surface.** Routers live in `apps/dokploy/server/api/routers/*.ts` and are assembled in `server/api/root.ts`. `server/api/trpc.ts` defines the procedure tiers: `publicProcedure` (no auth), `protectedProcedure` (logged in), `cliProcedure`/`adminProcedure` (owner/admin role), `enterpriseProcedure` (admin/owner + enterprise license present in DB, not re-validated against the license server per-request). Fine-grained permissions on top of roles go through `checkPermission` (`@dokploy/server/services/permission`) using the access-control `statements`. Routers under `routers/proprietary/` gate enterprise-only features (SSO, SCIM, RBAC, audit log, whitelabeling).
- **Business logic belongs in `@dokploy/server`, not in routers.** Routers are thin: validate input with zod, call into `packages/server/src/services/*`, return. Services talk directly to the Drizzle db (`@dokploy/server/db`) and to the docker/git/traefik utils under `src/utils`.
- **DB schema is Drizzle**, defined per-domain in `packages/server/src/db/schema/*.ts` and re-exported from `src/db/schema/index.ts`. Migrations are generated from that schema but stored/run from `apps/dokploy` (`drizzle/`, `migration.ts`) — always regenerate from `apps/dokploy` after changing schema in `packages/server`.
- **Deployments work by shelling out**: services build Docker images / run compose via `execAsync`/`execAsyncRemote` (local vs. remote server over SSH) and generate Traefik config dynamically (`utils/traefik`). Git providers (GitHub, GitLab, Gitea, Bitbucket) each have a `clone*Repository` implementation under `utils/providers`.
- **Cloud vs. self-hosted** behavior is toggled via an `IS_CLOUD` check (`packages/server/src/constants`), referenced in auth, admin, ai, and network services — self-hosted deployments disable cloud-only features (e.g. Stripe billing, some notification/network paths).
- **`@dokploy/server` has a source/dist switch**: `pnpm run server:script` (= `switch:dev`) points its package exports at `src/` for local development; `switch:prod` points at compiled `dist/` for production builds. If cross-package changes in `packages/server` aren't showing up in the app, check which mode is active.
- **Auth** uses `better-auth` (see `packages/server/src/auth`, `apps/dokploy/server/api/trpc.ts` context creation via `validateRequest`), with plugins for API keys, passkeys, SSO, SCIM.

## Code style
- Don't write comments that restate what the code already says.
- Comment only the "why" when something isn't obvious: workarounds,
  counterintuitive decisions, constraints from an external API.
- No section-divider comments like `// --- Helpers ---`.
- Don't leave comments describing the change you just made.
- Formatting/linting is enforced by Biome (`biome.json`) — don't hand-format against it or introduce Prettier/ESLint config.
