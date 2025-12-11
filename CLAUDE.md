# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Communication Language

**IMPORTANT: Always communicate in Chinese (中文) when interacting with users in this repository.** All responses, explanations, and discussions should be in Chinese unless explicitly requested otherwise.

## Project Overview

This is **dokploy-i18n**, a fork of Dokploy (an open-source PaaS platform) with added multi-language interface support. Dokploy is a self-hosted platform for deploying applications and managing databases, similar to Vercel/Heroku/Netlify.

## Monorepo Structure

This is a pnpm workspace monorepo with the following packages:

- **apps/dokploy**: Main Next.js application (frontend + backend)
  - Next.js 15 with Pages Router (not App Router)
  - tRPC API routes in `server/api/routers/`
  - React components in `components/`
  - WebSocket servers in `server/wss/`
  - Database schema re-exported from `@dokploy/server`

- **apps/api**: Standalone API application

- **apps/schedules**: Scheduled jobs application

- **packages/server**: Shared server package (`@dokploy/server`)
  - Core business logic and services
  - Database schema and migrations (Drizzle ORM with PostgreSQL)
  - Docker/deployment utilities
  - Exported services used by apps/dokploy

## Development Commands

```bash
# Install dependencies
pnpm install

# Development
pnpm dokploy:dev              # Start dokploy app in dev mode
pnpm dokploy:dev:turbopack    # Start with Turbopack (faster)
pnpm server:dev               # Start server package in dev mode

# Setup (first time)
pnpm dokploy:setup            # Initialize database and run migrations

# Build
pnpm dokploy:build            # Build dokploy app
pnpm build                    # Build all packages

# Database
pnpm --filter=dokploy run migration:generate    # Generate new migration
pnpm --filter=dokploy run migration:run         # Run migrations
pnpm --filter=dokploy run db:studio             # Open Drizzle Studio
pnpm --filter=dokploy run db:push               # Push schema changes

# Code Quality
pnpm format-and-lint          # Check formatting and linting
pnpm format-and-lint:fix      # Fix formatting and linting issues
pnpm check                    # Auto-fix with Biome
pnpm typecheck                # Type check all packages

# Testing
pnpm test                     # Run tests (dokploy app)

# Docker
pnpm docker:build:canary      # Build canary Docker image
```

## Tech Stack

- **Frontend**: Next.js 15 (Pages Router), React 18, TailwindCSS, Radix UI
- **Backend**: tRPC, Node.js custom server with WebSockets
- **Database**: PostgreSQL with Drizzle ORM
- **Queue**: BullMQ with Redis
- **Docker**: Dockerode for container management
- **i18n**: next-i18next with 21 supported languages
- **Auth**: better-auth
- **Tooling**: Biome (linting/formatting), TypeScript, pnpm, esbuild

## Architecture

### tRPC API Structure

The API is organized as a tRPC router in `apps/dokploy/server/api/root.ts` with 40+ sub-routers for different resources (applications, databases, docker, domains, etc.). Each router is in `server/api/routers/`.

Business logic lives in `packages/server/src/services/` and is imported by the tRPC routers.

### Database

- Schema defined in `packages/server/src/db/schema/`
- Migrations in `apps/dokploy/drizzle/`
- Uses Drizzle ORM with PostgreSQL
- Connection and utilities in `packages/server/src/db/`

### WebSocket Servers

Multiple WebSocket servers handle real-time features:
- `docker-stats.ts`: Container resource monitoring
- `docker-container-logs.ts`: Container log streaming
- `docker-container-terminal.ts`: Container terminal access
- `drawer-logs.ts`: Deployment drawer logs
- `listen-deployment.ts`: Deployment progress updates
- `terminal.ts`: SSH terminal access

All WebSocket servers are initialized in `apps/dokploy/server/server.ts`.

### Deployment Queue

BullMQ queue system in `apps/dokploy/server/queues/`:
- `deployments-queue.ts`: Main deployment worker
- `queueSetup.ts`: Queue configuration
- Processes application/compose deployments asynchronously

### Server Initialization

Production startup sequence (`server/server.ts`):
1. Setup directories and Traefik configuration
2. Initialize Docker network
3. Run database migrations
4. Initialize cron jobs and schedules
5. Start deployment worker
6. Setup WebSocket servers

## Internationalization (i18n)

This fork's primary feature is multi-language support:

- **21 supported languages**: en, es, zh-Hans, zh-Hant, pt-br, ru, ja, de, ko, fr, tr, it, pl, uk, fa, nl, id, kz, no, az, ml
- Translation files: `apps/dokploy/public/locales/{locale}/common.json` and `settings.json`
- Language definitions: `apps/dokploy/lib/languages.ts`
- Locale hook: `apps/dokploy/utils/hooks/use-locale.ts`
- Uses cookie-based locale storage (`DOKPLOY_LOCALE`)
- Next.js i18n config in `next.config.mjs` (currently only zh-Hans and en configured)

### Adding/Updating Translations

When adding new UI strings:
1. Add the key to `apps/dokploy/public/locales/en/common.json` or `settings.json`
2. Update all other locale files with translations
3. Use `t('key')` from `react-i18next` in components
4. Python scripts in `public/locales/` help validate and manage translations

## Key Patterns

### Adding a New tRPC Router

1. Create router file in `apps/dokploy/server/api/routers/your-feature.ts`
2. Import and add to `appRouter` in `server/api/root.ts`
3. Business logic should go in `packages/server/src/services/your-feature.ts`
4. Export service from `packages/server/src/index.ts`

### Database Changes

1. Modify schema in `packages/server/src/db/schema/`
2. Generate migration: `pnpm --filter=dokploy run migration:generate`
3. Review generated SQL in `apps/dokploy/drizzle/`
4. Run migration: `pnpm --filter=dokploy run migration:run`

### Working with Docker

Docker utilities are in `packages/server/src/services/docker.ts`. The codebase uses `dockerode` for all Docker operations (containers, images, networks, volumes).

## Environment Variables

See `.env.example` in `apps/dokploy/` for required environment variables. Key variables:
- Database connection (PostgreSQL)
- Redis connection (for BullMQ)
- Docker socket path
- Application host/port

## Testing

Tests are in `apps/dokploy/__test__/` using Vitest. Run with `pnpm test`.

## Important Notes

- This is a **Pages Router** Next.js app, not App Router
- The custom server (`server/server.ts`) is required for WebSocket support
- Database schema is defined in `packages/server` but migrations run from `apps/dokploy`
- The `@dokploy/server` package must be built before running dokploy app in production
- Biome is used for linting/formatting (not ESLint/Prettier)
- Node.js 20.16.0+ and pnpm 9.12.0+ are required
