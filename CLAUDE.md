# Project Guidelines

## Maintaining This File

- **Always update CLAUDE.md** when making changes that affect architecture, patterns, infrastructure, or design language.
- **Always keep the "Product Overview" section current.** When features are added, renamed, or removed, update their names and descriptions. When branding changes (app name, tagline, terminology), reflect it immediately. This section is the single source of truth for what the product is and does.
- **Always keep `.env.example`** up to date when adding/removing environment variables.
- If repeated corrections or pattern deviations are noticed, ask the user: _"Should we update CLAUDE.md to prevent this from recurring?"_
- Keep entries concise. This file is a living reference for consistency across the project.

## Product Overview

- **App Name**: Dokploy (v0.29.0)
- **Tagline / Description**: Open Source Alternative to Vercel, Heroku and Netlify.
- **Core Purpose**: A free, self-hostable Platform as a Service (PaaS) that simplifies deployment and management of applications, databases, and infrastructure on user-owned VPSs. Targets developers and teams who want Heroku/Vercel-like ergonomics on their own servers, with optional managed offering via Dokploy Cloud.

The codebase distinguishes between **self-hosted** and **Dokploy Cloud** via the `IS_CLOUD` env flag. Cloud disables monitoring, schedules, Docker/Swarm management, Traefik FS editor, and adds Stripe billing. All other features (SSO, whitelabeling, custom roles, audit logs, etc.) are available to every install with no licensing gate.

### Features

- **Applications**: Deploy Node.js, PHP, Python, Go, Ruby, Java, etc. from Git or Docker images with build logs, rollback, and preview deployments.
- **Databases**: Managed PostgreSQL, MySQL, MariaDB, MongoDB, Redis, and LibSQL services.
- **Docker Compose**: Native multi-service deployments from compose files.
- **Backups & Restore**: Scheduled backups for all DB types to S3-compatible destinations with retention policies.
- **Volume Backups**: Snapshot/restore of Docker volumes.
- **Multi-Server / Multi-Node**: SSH-managed remote servers and Docker Swarm clusters.
- **Templates**: One-click deploys of OSS apps (Plausible, Pocketbase, Cal.com, etc.).
- **Traefik Integration**: Auto-generated dynamic routing, SSL via Let's Encrypt, custom certs.
- **Real-time Monitoring**: CPU/memory/storage/network metrics with threshold alerts (self-hosted).
- **Docker Management**: Container inspection, exec terminals (xterm.js), logs streaming.
- **Schedules / Cron**: Scheduled deployments, redeploys, custom commands (self-hosted).
- **Notifications**: Slack, Discord, Telegram, Email (Resend/SMTP), Teams, Mattermost, Gotify, Lark, Pushover, Ntfy, custom webhooks.
- **Git Providers**: GitHub (App + webhooks), GitLab, Gitea, Bitbucket OAuth + webhook integrations.
- **Cloudflare Integration**: Org-level CF token + multi-zone configuration; per-server auto-provisioned remotely-managed Cloudflare Tunnels (cloudflared installed via SSH on server bootstrap, dokploy-tunnel systemd unit); CF-managed domains create/update/delete CNAMEs and tunnel ingress automatically; one-way reconcile pushes Dokploy DB state to Cloudflare. CF settings live under Settings → Cloudflare. Permission: `cloudflare` resource (free-tier, sibling of `gitProviders`).
- **Domains & SSL**: Multi-domain per service, Let's Encrypt, custom certs, redirects.
- **Environment Variables**: Per-service and inherited from project/environment, secure storage.
- **Volumes & Mounts**: Persistent + bind mounts.
- **CLI/API**: tRPC + OpenAPI (`@dokploy/trpc-openapi`) for programmatic management; Swagger UI at `/swagger`.
- **AI Configuration**: Multi-provider LLM integration (Anthropic, OpenAI, Azure, Cohere, Mistral, DeepInfra, Ollama) for assistance features.
- **Users / Teams / Orgs**: Multi-tenant orgs, RBAC (owner/admin/member + custom roles), invitations.
- **Audit Logs**: Compliance trail.
- **SSO**: SAML/OIDC.
- **Whitelabeling**: Custom branding.
- **Billing**: Stripe subscription management (cloud only).

## TypeScript Rules

- **Strict mode**: enabled in all tsconfigs (`"strict": true`).
- **Target**: ES2022, **Module**: ESNext.
- **`noUncheckedIndexedAccess`**: true — index access returns `T | undefined`; check before use.
- **`checkJs`**: true — JS files are also type-checked.
- **`any` is allowed** (`noExplicitAny` disabled in Biome) but use sparingly; prefer narrow types.
- **Path aliases**:
  - `@/*` → `apps/dokploy/` root (for the dokploy app)
  - `@dokploy/server/*` → `packages/server/src/*` (cross-package import)
- Use `interface` for object shapes, `type` for unions/aliases/generics. No `I` prefix on interfaces.
- Prefer **async/await** over `.then()` chains.
- Use `node:` prefix for built-in Node imports (`import fs from "node:fs"`).
- Schemas + types flow: drizzle schema → `createInsertSchema` (drizzle-zod) → exported as `apiCreateX` / `apiUpdateX` → tRPC router → `RouterInputs` / `RouterOutputs` on the client. Do not duplicate types.

## Code Grammar

- **Naming**:
  - `camelCase` for variables, functions, methods.
  - `PascalCase` for React components, types, interfaces, enums.
  - `UPPER_SNAKE_CASE` for module-level constants (`IS_CLOUD`, `CLEANUP_CRON_JOB`).
  - File names: `kebab-case` for everything (`alert-dialog.tsx`, `random-password.ts`, `dashboard-layout.tsx`). Test files use `.test.ts` (or `.real.test.ts` for integration).
- **Abstraction**: Prefer composing existing UI primitives in `components/ui/` and shared helpers in `apps/dokploy/lib/utils.ts` and `packages/server/src/utils/` over single-use inline code. Avoid premature abstraction — three similar lines beats a wrong abstraction.
- **Comments**: Sparse / self-documenting. Only comment WHY, not WHAT. Don't add comments referencing the current task or PR.
- **Imports**: Absolute imports via path aliases for cross-directory references; relative only inside the same feature folder. Biome auto-organizes imports on save (`organizeImports: "on"`).
- **React components**: Functional components only. Use `React.forwardRef<...>` with explicit generics for primitives that pass refs; otherwise plain function components. **Named exports** preferred. Avoid `React.FC` in new code.
- **Style rules enforced by Biome**: `useAsConstAssertion`, `useDefaultParameterLast`, `useEnumInitializers`, `useSelfClosingElements`, `noInferrableTypes`, `noUselessElse`. `noUnusedImports` and `noUnusedFunctionParameters` are errors.
- **Formatter / Linter**: Biome 2.1.1 (replaces ESLint + Prettier). Run `pnpm format-and-lint:fix` to autoformat. Biome's defaults are used (tab indentation per `.editorconfig` / Biome defaults).

## Tech Stack

- **Framework (frontend)**: Next.js 16.2.0 (Pages Router), React 18.2.0
- **Frameworks (microservices)**: Hono 4.11 (`apps/api`, `apps/schedules`)
- **Language**: TypeScript 5.8.3 (Node 24.4.0+)
- **Styling**: Tailwind CSS 3.4.17 with `tailwindcss-animate`, `@tailwindcss/typography`, `tailwind-merge`, `class-variance-authority`, `clsx`. Theme via CSS variables (HSL); base color `zinc`. Dark mode via `next-themes` 0.2.1.
- **UI Components**: shadcn/ui (Radix UI primitives) — ~44 components in `apps/dokploy/components/ui/`. Icon library: `lucide-react` 0.469.0. Code editor: `@uiw/react-codemirror`. Terminal: `xterm` + `@xterm/addon-attach`. Toasts: `sonner` 1.7.4.
- **Backend**: tRPC 11 server in `apps/dokploy/server/`, business logic in `packages/server/`. Standalone Hono services for API gateway and BullMQ job scheduler.
- **Database**: PostgreSQL via `postgres` driver 3.4.4. **ORM**: Drizzle 0.45.1 + drizzle-kit 0.31.4. Schema lives in `packages/server/src/db/schema/`. Migrations: schema-first, runtime via `apps/dokploy/migration.ts`.
- **Auth**: `better-auth` 1.5.4 with `@better-auth/sso`, `@better-auth/api-key`, organization plugin, 2FA. Password hashing: `bcrypt`. Crypto: `@oslojs/crypto`.
- **API**: tRPC 11.10 (`@trpc/server`, `@trpc/client`, `@trpc/next`, `@trpc/react-query`) + `@dokploy/trpc-openapi` 0.0.18 for OpenAPI generation. SuperJSON serialization. Validation via `zod` 4.3.6 + `drizzle-zod` 0.8.3.
- **Forms**: `react-hook-form` 7.71 + `@hookform/resolvers` (zod / standard-schema resolver).
- **State / Data**: `@tanstack/react-query` 5.90 (via tRPC), `@tanstack/react-table` 8.21.
- **Jobs / Queue**: BullMQ 5.67 backed by Redis (`ioredis` / `redis`). Standalone scheduler in `apps/schedules/`.
- **Infrastructure SDKs**: `dockerode` 4.0.2 (Docker), `ssh2` 1.15 (remote shells), `node-pty` 1.0 (xterm bridge), `ws` 8.16 (WebSocket).
- **Git providers**: `octokit` 3.1, `@octokit/auth-app`, `@octokit/webhooks`.
- **Email**: `resend` 6.0.2 + `@react-email/components` 0.0.21, `nodemailer` 6.9 (SMTP fallback).
- **Payments**: `stripe` 17.2 + `@stripe/stripe-js` 4.8 (cloud only).
- **AI SDKs**: Vercel `ai` 6.0 + `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/azure`, `@ai-sdk/cohere`, `@ai-sdk/mistral`, `@ai-sdk/deepinfra`, `@ai-sdk/openai-compatible`, `ai-sdk-ollama`.
- **Bundling**: `esbuild` 0.20.2 (server bundles via `esbuild.config.ts`), `tsx` 4.16 (TS execution), `tsc-alias` (path alias resolution at build time).
- **Linter / Formatter**: Biome 2.1.1.
- **Testing**: Vitest 4.0.18 (test fixtures in `apps/dokploy/__test__/`).
- **Logging**: `pino` 9.4 + `pino-pretty`.
- **Package Manager**: pnpm 10.22.0 (workspaces).

## Project File Structure

```
istanbul-v3/
  apps/
    dokploy/                   # Main Next.js dashboard (Pages Router)
      pages/                   # Routes (file-based)
        api/                   #   API endpoints: trpc, auth, deploy webhooks, providers, stripe
        dashboard/             #   Authenticated dashboard pages
        accept-invitation/     #   Token-based invite acceptance
      components/
        ui/                    #   shadcn/ui primitives (~44 components)
        dashboard/             #   Feature components (application, compose, database, docker, monitoring, postgres, mysql, mongo, mariadb, redis, libsql, project, projects, settings, swarm, deployments, requests, file-system, organization, impersonation, shared, audit-logs, sso, whitelabeling, roles)
        auth/                  #   Sign-in providers (github, google, sso)
        layouts/               #   DashboardLayout, OnboardingLayout, sidebar, user-nav
        shared/                #   Cross-feature composed components (DialogAction, code-editor, drawer-logs, breadcrumb, alert-block, tag-selector)
        icons/                 #   Custom icon components
      server/                  # tRPC server + Express boot
        server.ts              #   Node entry point
        api/
          root.ts              #   Aggregated app router
          trpc.ts              #   Procedures: publicProcedure, protectedProcedure, adminProcedure, cliProcedure, withPermission
          routers/             #   ~47 domain routers (admin, ai, application, audit-log, backup, certificate, cluster, compose, custom-role, deployment, destination, docker, domain, environment, git-provider, github, gitlab, gitea, bitbucket, libsql, mariadb, mongo, mount, mysql, notification, organization, patch, port, postgres, preview-deployment, project, redirects, redis, registry, rollbacks, schedule, security, server, settings, ssh-key, sso, stripe, swarm, tag, user, volume-backups, whitelabeling)
        db/
          drizzle.config.ts    #   Drizzle config
        queues/                #   BullMQ queue definitions
        wss/                   #   WebSocket handlers (logs, terminal)
      lib/                     # Client utilities (cn, auth-client, slug, password-utils, avatar-utils)
      hooks/                   # Client hooks (use-mobile, useLocalStorage, use-keyboard-nav, use-health-check-after-mutation)
      utils/                   # API client (tRPC), schema helpers, hooks (use-debounce, use-url, use-whitelabeling)
      styles/                  # globals.css with HSL theme variables
      public/                  # Static assets (avatars, images). NO locales — i18n is not implemented.
      __test__/                # Vitest fixtures (cluster, compose, deploy, env, permissions, traefik, wss, etc.)
      drizzle/                 # Generated migration metadata
      templates/               # Email templates + utils
      scripts/                 # generate-openapi.ts, etc.
      docker/                  # Build scripts
      setup.ts, migration.ts, wait-for-postgres.ts, reset-password.ts, reset-2fa.ts
      tailwind.config.ts, components.json, next.config.mjs, esbuild.config.ts

    api/                       # Standalone Hono REST API (separate deployment)
      src/{index,logger,schema,service,utils}.ts

    monitoring/                # Standalone monitoring service (metrics collection)
      config/, containers/, database/, middleware/, monitoring/

    schedules/                 # Standalone BullMQ scheduler (Hono)
      src/{index,logger,queue,schema,workers,utils}.ts

  packages/
    server/                    # Shared backend business logic (imported as @dokploy/server/*)
      src/
        auth/                  #   Auth helpers
        constants/             #   Shared constants
        db/
          schema/              #   ALL Drizzle table definitions (48+ files)
          validations/         #   Zod validation schemas (domain, destination, etc.)
        emails/                #   React Email templates
        lib/                   #   auth.ts (better-auth setup), access-control.ts (RBAC statements)
        services/              #   Business logic per resource (mysql, postgres, github, gitea, ssh-key, project, schedule, audit-log, sso, …)
        utils/                 #   Domain utilities organized by topic:
          access-log/, ai/, backups/, builders/, cluster/, crons/, databases/,
          docker/, filesystem/, notifications/, process/, providers/, restore/,
          schedules/, servers/, startup/, tracking/, traefik/, volume-backups/, watch-paths/
        monitoring/            #   Metrics client
        templates/, types/, setup/, verification/, wss/

  Dockerfile, Dockerfile.cloud, Dockerfile.monitoring, Dockerfile.schedule, Dockerfile.server
  biome.json, pnpm-workspace.yaml, openapi.json
```

## Frontend Design Language

- **Color palette / theme tokens** (`apps/dokploy/styles/globals.css`, HSL via CSS variables; base color `zinc` per `components.json`):
  - Light: `--background 0 0% 100%`, `--foreground 240 10% 3.9%`, `--primary 240 5.9% 10%`, `--muted 240 4.8% 95.9%`, `--destructive 0 84.2% 50.2%`, `--sidebar 0 0% 98%`, `--card 0 0% 100%`.
  - Dark (`.dark`): inverted; `--card 240 4% 10%`, `--sidebar 240 5.9% 10%`, primary becomes white.
  - 5 chart color tokens for `recharts` palette (hues 173, 12, 197, 43, 27).
  - Border radius: `0.5rem` base, with `md` and `sm` variants.
  - Theme switching via `next-themes` `useTheme()` and the toggle in `components/layouts/user-nav.tsx`.
- **Component patterns**: Compose shadcn/ui primitives from `apps/dokploy/components/ui/`. Variants via `class-variance-authority`. `cn()` from `lib/utils.ts` for merging classes.
  - Cards: `Card` + `CardHeader` + `CardTitle` + `CardDescription` + `CardContent` + `CardFooter`.
  - Buttons: variants `default | destructive | outline | secondary | ghost | link`; subtle press: `active:hover:scale-[0.98]`.
  - Forms: `<Form>` + `<FormField>` + `<FormControl>` + `<FormLabel>` + `<FormDescription>` + `<FormMessage>` (react-hook-form).
- **Spacing / layout**: Tailwind defaults. Container padding `2rem`. Custom `maxWidth`: `8xl` (85rem), `9xl` (95rem), `10xl` (105rem). Sidebar widths: 16rem expanded, 3rem icon-only, 18rem mobile.
- **Animation / transitions**: `tailwindcss-animate`. Custom keyframes: `accordion-down/up`, `caret-blink`, `heartbeat`. Use `transition-all` + `ease-in-out` for general transitions.
- **Icons**: `lucide-react` only (consistent sizing, e.g., `h-[1.2rem] w-[1.2rem]` for toggles).
- **Typography**: Inter via `--font-inter` CSS variable. `text-sm font-medium` for labels and button text.

### Navigation Layout

- **Sidebar** (`apps/dokploy/components/layouts/side.tsx` + `components/ui/sidebar.tsx`): `SidebarProvider` context wraps the dashboard. Collapsible on desktop (toggle: ⌘B), Sheet overlay on mobile. State persisted in `sidebar:state` cookie (7-day TTL). Structure: Header → Content (groups w/ `SidebarMenu` + `SidebarMenuSub`) → Footer.
- **Sections (sidebar)**:
  - **Home**: Home, Projects, Deployments, Monitoring*, Schedules*, Traefik FS*, Docker*, Swarm*, Requests* (* = self-hosted only).
  - **Settings**: Web Server*, Profile, Remote Servers, Users, Audit Logs, SSH Keys, AI, Tags, Git Providers, Registry, Destinations, Certificates, Cluster*, Notifications, Billing (cloud), SSO (admin), Whitelabeling (owner).
  - **Help**: Documentation, Support Discord (external links).
- **Top of page**: Breadcrumb trail (`components/shared/breadcrumb-sidebar.tsx`, `advance-breadcrumb.tsx`) + `UserNav` with theme toggle.

### Popups & Modals

- **`Dialog`** (`components/ui/dialog.tsx`): centered modal with overlay z-50. Used for create/edit forms and most flows.
- **`Sheet`** (`components/ui/sheet.tsx`): slide-out panel with `top | bottom | left | right` variants. Used for drawers (logs, file tree, secondary forms) and as the mobile sidebar.
- **`AlertDialog`** (`components/ui/alert-dialog.tsx`): destructive confirmations ("Are you sure?"). Wrapped by **`DialogAction`** at `apps/dokploy/components/shared/dialog-action.tsx` — pass `title`, `description`, `onClick` for one-line confirm flows.
- **State**: `const [open, setOpen] = useState(false)`; reset forms on open via `useEffect` + `form.reset()`.
- No mobile-vs-desktop swap — `Sheet` is used directly when a slide-in is desired regardless of breakpoint.

## Backend Infrastructure

- **Architecture**: Dokploy is a control plane. The primary server runs Next.js + tRPC + WebSocket + BullMQ workers. It executes Docker locally and on remote servers via SSH (`ssh2`) and the Docker socket. Traefik (separate container) handles ingress; Dokploy writes its dynamic config files. PostgreSQL stores metadata; Redis backs job queues.
- **Database**: PostgreSQL via `postgres` driver. Drizzle ORM (`drizzle-orm` + `drizzle-kit`). Schema-first — all tables defined in `packages/server/src/db/schema/`. Migrations run on boot via `apps/dokploy/migration.ts`.
- **Auth**: `better-auth` configured in `packages/server/src/lib/auth.ts`. Plugins: organization (multi-tenant), API key, SSO (SAML/OIDC), 2FA. Methods: email/password (bcrypt), OAuth (GitHub, Google, custom). Sessions: 3-day expiration, active-org tracking. Email verification + auto sign-in.
- **API layer**: tRPC 11 is the **primary** API. Root router `apps/dokploy/server/api/root.ts` aggregates ~47 routers. Client mounts `/api/[...trpc]`. OpenAPI spec generated by `@dokploy/trpc-openapi` (see `pnpm generate:openapi` and `openapi.json`); Swagger UI at `/swagger`. SuperJSON serialization. tRPC subscriptions over WebSocket for real-time logs/terminal.
- **Procedure types** (`apps/dokploy/server/api/trpc.ts`): `publicProcedure`, `protectedProcedure` (session required), `adminProcedure` (owner/admin), `cliProcedure`, `withPermission(resource, action)` factory for RBAC.
- **Permissions**: Declarative resource × action statements in `packages/server/src/lib/access-control.ts`. Role hierarchy: owner > admin > custom roles > member. All resources are available to every install — no license gating.
- **Services / business logic**: `packages/server/src/services/` — one module per resource (project, application, deployment, postgres, mysql, mariadb, mongo, redis, libsql, compose, server, ssh-key, registry, github, gitlab, gitea, bitbucket, notification, schedule, backup, volume-backup, audit-log, sso, …).
- **Domain utilities**: `packages/server/src/utils/` grouped by topic (docker, databases, traefik, builders, cluster, notifications, providers, backups, restore, schedules, servers, watch-paths, …).
- **External integrations**: `dockerode` for Docker socket; `ssh2` for `execAsyncRemote()` against managed servers; Octokit (GitHub App + webhooks); GitLab/Gitea/Bitbucket OAuth; Resend / SMTP; 13 notification providers (Discord, Slack, Telegram, Email, Teams, Mattermost, Lark, Ntfy, Gotify, Pushover, custom webhooks); S3 destinations for backups; Stripe billing.
- **Background jobs**: BullMQ workers run inside `apps/dokploy` (queues in `apps/dokploy/server/queues/`). The dedicated **`apps/schedules`** Hono service (port 4001, secured with `X-API-Key`) manages cron / repeatable jobs (backups, server cleanup, custom schedules, timezone-aware).
- **Multi-server**: Servers stored with IP, port, username, SSH key. `execAsyncRemote()` runs commands; setup scripts auto-install Docker on registration. Docker Swarm support: cluster routers, node placement (manager/worker), per-server Traefik containers.
- **Monitoring**: `apps/monitoring` is a separate service collecting CPU/memory/disk/network metrics. Threshold-based notifications. Access-log parsing for Traefik. Self-hosted only.
- **Realtime**: WebSocket via `ws` 8.16 — `apps/dokploy/server/wss/` and `packages/server/src/wss/` handle deployment log streaming, container exec terminals (`xterm` ↔ `node-pty`), and tRPC subscriptions.
- **File / log storage**: Deployment logs in DB; backups on configured destinations (S3 / object storage / local volumes); Traefik configs written to host volumes via SSH.

### Environment Variables

No central env validation (no `env.ts` / t3-env / Zod env schema). `process.env` is read directly. `NEXT_PUBLIC_` prefix marks client-exposed vars.

**Database / Postgres**
- `DATABASE_URL`, `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_PASSWORD_FILE`, `POSTGRES_WAIT_TIMEOUT`, `POSTGRES_WAIT_RETRY`

**Auth & OAuth**
- `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

**Email / SMTP**
- `SMTP_SERVER`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_ADDRESS`

**Stripe / Billing (cloud)**
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- Tiered price IDs: `BASE_PRICE_MONTHLY_ID`, `BASE_ANNUAL_MONTHLY_ID`, `PRODUCT_MONTHLY_ID`, `PRODUCT_ANNUAL_ID`, `HOBBY_PRODUCT_ID`, `HOBBY_PRICE_MONTHLY_ID`, `HOBBY_PRICE_ANNUAL_ID`, `STARTUP_PRODUCT_ID`, `STARTUP_BASE_PRICE_MONTHLY_ID`, `STARTUP_BASE_PRICE_ANNUAL_ID`

**Docker / Infra**
- `DOKPLOY_DOCKER_API_VERSION`, `DOKPLOY_DOCKER_HOST`, `DOKPLOY_DOCKER_PORT`, `DOCKER_HOST`

**Traefik**
- `TRAEFIK_HTTP`, `TRAEFIK_PORT`, `TRAEFIK_SSL_PORT`, `TRAEFIK_VERSION`

**Tracking / Analytics (client)**
- `NEXT_PUBLIC_METRICS_URL`, `NEXT_PUBLIC_METRICS_TOKEN`, `HUBSPOT_PORTAL_ID`, `HUBSPOT_FORM_GUID`

**Runtime**
- `NODE_ENV`, `PORT`, `HOST`, `SITE_URL`, `SERVER_URL`, `JOBS_URL`, `IS_CLOUD`, `RELEASE_TAG`, `USER_ADMIN_ID`, `REDIS_HOST`, `VERCEL_URL`, `TURBOPACK`, `HOME`

**`apps/api`**
- `API_KEY`, `PORT`, `REDIS_URL`, `LEMON_SQUEEZY_API_KEY`, `LEMON_SQUEEZY_STORE_ID`, `INNGEST_BASE_URL`, `INNGEST_SIGNING_KEY`, `INNGEST_EVENTS_RECEIVED_AFTER`, `INNGEST_JOBS_MAX_EVENTS`

**`apps/schedules`**
- `API_KEY`, `PORT`, `REDIS_URL`

Reference `.env.example` files: `apps/dokploy/.env.example`, `apps/dokploy/.env.production.example`, `apps/api/.env.example`. Keep these in sync when adding/removing vars.

## i18n (Internationalization)

**Not implemented.** No i18n library (`next-intl`, `next-i18next`, etc.) is installed. No `locales/`, `messages/`, or `i18n/` directories exist. UI strings are hardcoded English. `toLocaleString()` is only used for date formatting, not translation.

To add i18n, install `next-intl`, restructure routing or add a provider, extract strings to JSON message files, and replace literals with `t()` calls.

## Dynamic Memory

Living section for reusable knowledge discovered during development. Add entries when you find a reusable utility, pattern, or key path; remove entries that become stale. Keep concise, long-term relevant only.

### Reusable Utilities & Helpers

- `apps/dokploy/lib/utils.ts` — `cn()` (clsx + tailwind-merge), `formatTimestamp`, `getFallbackAvatarInitials`, hash helpers.
- `apps/dokploy/lib/auth-client.ts` — `better-auth` client (sign-in/out, session, org).
- `apps/dokploy/lib/slug.ts`, `lib/password-utils.ts`, `lib/avatar-utils.ts`, `lib/bundled-icons.ts`.
- `apps/dokploy/utils/api.ts` — tRPC client setup (HTTP batch + WebSocket subscription links, FormData via SuperJSON). Use `api.<router>.<proc>.useQuery() / useMutation()`.
- `apps/dokploy/utils/schema.ts`, `utils/gitea-utils.ts`.
- `apps/dokploy/utils/hooks/use-debounce.ts`, `use-url.ts`, `use-whitelabeling.ts`.
- `apps/dokploy/hooks/use-mobile.tsx`, `useLocalStorage.tsx`, `use-keyboard-nav.tsx`, `use-health-check-after-mutation.ts`.
- `packages/server/src/lib/auth.ts` — better-auth setup (SSO, API keys, organization, 2FA).
- `packages/server/src/lib/access-control.ts` — RBAC statements (resource × action) and built-in roles.
- `packages/server/src/db/validations/*` — shared Zod schemas (domain, destination, …).
- `packages/server/src/utils/docker/*` — compose helpers, port collision detection.
- `packages/server/src/utils/traefik/*` — dynamic config generation.
- `packages/server/src/utils/databases/*` — per-engine helpers (rebuild, dump, restore).
- Toasts: `import { toast } from "sonner"` → `toast.success(msg)` / `toast.error(msg)`.

### Key Component Paths

- **UI primitives**: `apps/dokploy/components/ui/` (Button, Card, Dialog, AlertDialog, Sheet, Form, Input, Label, Select, Tabs, Table, Sidebar, Popover, Tooltip, Badge, Avatar, Progress, Chart, Dropzone, FileTree, NumberInput, Calendar, Command, InputOTP, Sonner toaster, …).
- **Layouts**: `apps/dokploy/components/layouts/dashboard-layout.tsx`, `onboarding-layout.tsx`, `side.tsx`, `user-nav.tsx`.
- **Confirm dialog**: `apps/dokploy/components/shared/dialog-action.tsx` (`<DialogAction title description onClick>` wraps AlertDialog).
- **Code editor**: `apps/dokploy/components/shared/code-editor.tsx` (CodeMirror).
- **Logs drawer**: `apps/dokploy/components/shared/drawer-logs.tsx`.
- **Breadcrumbs**: `apps/dokploy/components/shared/breadcrumb-sidebar.tsx`, `advance-breadcrumb.tsx`.
- **Common shared**: `tag-selector.tsx`, `tag-badge.tsx`, `date-tooltip.tsx`, `alert-block.tsx`, `toggle-visibility-input.tsx`, `focus-shortcut-input.tsx`, `update-database-password.tsx`.
- **Terminal**: `xterm` integration in `components/dashboard/docker/` (search `DockerTerminal`).
- **tRPC router root**: `apps/dokploy/server/api/root.ts`. Procedures: `apps/dokploy/server/api/trpc.ts`.

### Patterns & Conventions

- **tRPC mutation**: `const { mutateAsync, isPending } = api.<router>.<action>.useMutation();` then on success call `api.useUtils().<router>.<query>.invalidate()` and `toast.success(...)`. On error `toast.error(err.message)`.
- **tRPC query (conditional)**: `api.<router>.<proc>.useQuery({ id }, { enabled: !!id })`.
- **SSR prefetch**: in `getServerSideProps` build `helpers = createServerSideHelpers({...})`, call `helpers.<router>.<proc>.prefetch(...)`, then `return { props: { trpcState: helpers.dehydrate() } }`. Client tRPC has `ssr: false`.
- **Form**: `useForm({ resolver: standardSchemaResolver(schema) })` (or `zodResolver`) → `<Form {...form}>` + `<FormField control={form.control} name=... render=...>`. Reset on dialog open via `useEffect` + `form.reset(initialValues)`.
- **Procedure choice**: prefer the most-restrictive procedure that fits — `withPermission(resource, action)` for RBAC-gated mutations; `adminProcedure` for org-admin-only; `protectedProcedure` for any signed-in user; `cliProcedure` for CLI/API key access.
- **DB schema → API types**: define table in `packages/server/src/db/schema/<entity>.ts`; create Zod via `createInsertSchema(table)` and export as `apiCreate<Entity>` / `apiUpdate<Entity>`; consume in router `.input(apiCreateEntity)`. Client gets types via `RouterInputs` / `RouterOutputs` from `apps/dokploy/utils/api.ts`. Never duplicate types.
- **Service layer**: routers stay thin and call into `packages/server/src/services/<entity>.ts`. Put domain logic in services, not routers.
- **Errors**: throw `TRPCError({ code: "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "INTERNAL_SERVER_ERROR", message })` from server. Errors arrive at the client formatted with Zod issues attached via the tRPC error formatter middleware.
- **Page composition**: each page exports `getLayout` to wrap with `DashboardLayout`. Auth + prefetch happens in `getServerSideProps`.
- **Cloud vs self-hosted gating**: import `IS_CLOUD` from server constants; sidebar items and pages render conditionally. Always check both flag and role for sensitive routes.
- **Remote execution**: never `exec` directly on a managed server — use `execAsyncRemote()` (SSH wrapper) from `packages/server/src/utils/`.
- **Realtime logs / terminal**: use the WebSocket setup in `server/wss/`; client mounts via tRPC subscriptions or direct `ws` for `xterm` PTY bridges.
- **Toasts**: `sonner` only (`import { toast } from "sonner"`). Do not introduce another toast lib.
- **Icons**: `lucide-react` only.
- **No i18n calls**: do not introduce `t()` / `useTranslation` references — i18n isn't wired up. Hardcode strings until the i18n stack is added project-wide.
