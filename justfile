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

# Run all workspaces in dev mode (web app)
dev:
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
