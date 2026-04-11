# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dokploy is a self-hosted PaaS (alternative to Vercel/Heroku/Netlify) built as a **pnpm monorepo**. It manages application deployments, databases, backups, Docker Swarm clusters, and infrastructure monitoring.

## Repository Structure

```
apps/
  dokploy/      # Main Next.js app (UI + server runtime via tRPC)
  api/          # REST API server (Hono + Inngest workflows)
  schedules/    # Background job processor (Hono + BullMQ + Redis)
  monitoring/   # System metrics service (Go + Fiber)
packages/
  server/       # Shared core: DB schema, services, auth, business logic
  install/      # Installation shell script
```

All apps depend on `@dokploy/server` for shared business logic and database access.

## Development Commands

### Initial Setup
```bash
pnpm install
cp apps/dokploy/.env.example apps/dokploy/.env
pnpm run dokploy:setup   # Spin up required services
pnpm run server:script   # Run setup scripts
```

### Development
```bash
pnpm run dokploy:dev     # Start main app at http://localhost:3000
pnpm run server:dev      # Start server package in watch mode
```

### Build
```bash
pnpm run dokploy:build   # Build main Next.js app
pnpm run server:build    # Build server package
pnpm run build           # Build all packages
```

### Linting & Formatting (Biome)
```bash
pnpm run format-and-lint # Run Biome checks across all packages
```

### Testing
```bash
pnpm test                # Run Vitest tests (from root)
# Tests live in apps/dokploy/src/__test__/**/*.test.ts
```

### Type Checking
```bash
pnpm run typecheck       # TypeScript checks across monorepo
```

### Database
```bash
pnpm run migration:generate   # Generate Drizzle migrations (in server package)
pnpm run migration:run        # Run pending migrations
```

## Tech Stack

- **Node.js** v24.4.0, **pnpm** v10.22.0
- **Frontend**: Next.js 16 (Pages + App Router), React 18, TailwindCSS, Radix UI
- **Backend**: tRPC (in dokploy), Hono (in api/schedules)
- **Database**: PostgreSQL via Drizzle ORM; Redis via BullMQ/IORedis
- **Auth**: Better Auth with OAuth (GitHub, Google) and 2FA
- **Linter/Formatter**: Biome (not ESLint/Prettier)
- **Tests**: Vitest with `forks` pool
- **Monitoring**: Go + Fiber + gopsutil + SQLite

## Architecture Patterns

### Data Flow
- **UI → tRPC → `@dokploy/server` services → PostgreSQL** (main app)
- **REST clients → Hono API → `@dokploy/server`** (api app)
- **Scheduled tasks → BullMQ → `@dokploy/server`** (schedules app)

### `@dokploy/server` package
This is the heart of the system. It exports:
- `packages/server/src/db/` — Drizzle schema + migrations
- `packages/server/src/services/` — All business logic (deployments, Docker, backups, etc.)
- `packages/server/src/setup/` — Environment bootstrapping

When making changes to business logic, modify `packages/server/src/` and rebuild with `pnpm run server:build`.

During development, `server` can switch between src/dist imports:
```bash
pnpm --filter=@dokploy/server run switch:dev   # Use TS source directly
pnpm --filter=@dokploy/server run switch:prod  # Use compiled dist
```

### Docker / Infrastructure
- Dokploy itself deploys apps using Docker, Nixpacks, Railpack, and Buildpacks
- Traefik is used as reverse proxy/load balancer
- Docker Swarm is used for multi-node deployments
- Terminal emulation: `node-pty` + `xterm`

## Conventions

### Commits
Follow Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `ci:`, `perf:`, `build:`

### Branches & PRs
- PR target branch: **`canary`** (not `main`)
- One feature/bugfix per PR
- Large features must be discussed in a GitHub issue first

### Code Style
- Biome enforces formatting and lint rules — configure your editor to use Biome, not Prettier
- Zod schemas are used for validation throughout, often via `drizzle-zod` integrations
- End-to-end type safety via tRPC; avoid untyped `any` casts

### Running a single test file
```bash
pnpm --filter=dokploy exec vitest run src/__test__/compose/compose.test.ts
```
