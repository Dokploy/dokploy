# dokploy-vite

Vite + TanStack Router migration of the Dokploy dashboard UI. The Next.js app (`apps/dokploy`) stays intact and keeps serving the backend (tRPC, better-auth, websockets, webhooks). This app is a pure SPA that reuses the existing UI code directly from `apps/dokploy` — components are NOT duplicated.

## How it works

- **Aliases** (`vite.config.ts`): `@/*` resolves into `apps/dokploy/*`, so all 380+ components, hooks, lib and utils are consumed from their original location. `~/*` resolves to this app's `src/`.
- **Next.js shims** (`src/shims/`): `next/link`, `next/router`, `next/navigation`, `next/head`, `next/dynamic`, `next/script` and `nextjs-toploader` are aliased to thin adapters over TanStack Router, so shared components run unmodified.
- **tRPC**: `@/utils/api` is re-aliased to `src/utils/api.ts` (`createTRPCReact` instead of `createTRPCNext`), same links (ws split + FormData split + superjson).
- **Auth**: SSR `getServerSideProps` guards were replaced by `beforeLoad` guards using the existing better-auth client (`@/lib/auth-client`) with a 30s session cache (`src/utils/session.ts`).
- **Routes** (`src/routes/`): file-based TanStack routes mirroring `apps/dokploy/pages`. `/dashboard` is a shared layout route rendering `DashboardLayout` once (it persists across navigations, unlike the pages-router setup).
- **Dev proxy**: `/api` and every websocket endpoint (`/drawer-logs`, `/terminal`, `/docker-container-*`, `/listen-*`) proxy to the Next custom server on `localhost:3000`.

## Standalone server (no Next.js)

`server/server.ts` is a Next-free replacement for `apps/dokploy/server/server.ts`. It reuses the entire existing backend from the monorepo:

- **tRPC** (`/api/trpc/*`) and **OpenAPI REST** (`/api/*` catch-all) — the exact same handlers from `apps/dokploy/pages/api`, mounted through a thin Next-API compat adapter (`server/next-compat.ts`) that provides `req.query/body/cookies` and `res.status/json/send/redirect` on plain Node req/res.
- **better-auth** (`/api/auth/*`) — `toNodeHandler(auth.handler)`, already framework-agnostic.
- **Webhooks/callbacks** — deploy (github, refreshToken, compose), Stripe (raw body preserved for signature check), GitHub setup/webhook, GitLab/Gitea OAuth callbacks: all reused unchanged via the adapter.
- **Websockets** — same `setup*WebSocketServer` functions from `apps/dokploy/server/wss`.
- **Bootstrapping** — same production init (Traefik config, cron jobs, schedules, volume backups, deployment worker) as the original server.
- **Static SPA** — in production it serves `dist/` with SPA fallback to `index.html` (`server/static.ts`).

## Development

One command — the server embeds Vite in middleware mode, so API + websockets + UI (with HMR) all run same-origin on :3000:

```bash
pnpm --filter dokploy-vite dev
# → http://localhost:3000 (no Next involved)
```

Alternative split mode (Vite dev server on :5173 proxying to whichever backend runs on :3000 — the Next custom server or this one):

```bash
pnpm --filter dokploy dev              # or: nothing, if dev above is running
pnpm --filter dokploy-vite dev:client  # → :5173
```

The `/api` proxy rewrites the `origin` header to :3000 so better-auth's trusted-origin check passes in split mode.

Production: `pnpm --filter dokploy-vite build && pnpm --filter dokploy-vite start` — one process serving API + websockets + static SPA on :3000, no Next.js at runtime.

The server loads `.env` from `apps/vite` first, then falls back to `apps/dokploy/.env`.

## Dropped vs Next (known gaps)

- SSR prefetching (`createServerSideHelpers`) — the SPA fetches on mount instead.
- Per-page IS_CLOUD / role / permission SSR redirects beyond session checks — components and tRPC procedures still enforce them; route-level guards can be added incrementally in `beforeLoad`.
