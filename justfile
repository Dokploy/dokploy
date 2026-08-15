# Dokploy development recipes
set dotenv-load
set shell := ["bash", "-euo", "pipefail", "-c"]

# Install all workspace dependencies
install:
    pnpm install

# Install dependencies + set up the local dev environment
setup:
    pnpm install
    pnpm run dokploy:setup

# Start the local Postgres dev database (idempotent)
db:
    scripts/dev-db.sh up

# Stop the local Postgres dev database (keeps data)
db-down:
    scripts/dev-db.sh down

# Stop and delete the local Postgres dev database volume (full reset)
db-reset:
    scripts/dev-db.sh reset

# Run all workspaces in dev mode (web app)
dev:
    just db
    pnpm run dokploy:dev

# Type-check all workspaces
typecheck:
    pnpm typecheck

# Lint the codebase
lint:
    pnpm -r exec biome lint

# Auto-fix lint + formatting issues
lint-fix:
    pnpm -r exec biome check --write

# Run the test suite
test:
    pnpm test

# Run a single test file (pass path after `just test-one -- <path>`)
test-one path:
    pnpm --filter=dokploy exec vitest run --config __test__/vitest.config.ts {{path}}

# Build all workspaces
build:
    pnpm build

# Show useful development commands
help:
    @just --list
