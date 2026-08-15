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

# Check that the Docker daemon is reachable (used by the db recipes)
docker-check:
    @if ! docker info >/dev/null 2>&1; then \
        if docker info 2>&1 | grep -qi "permission denied"; then \
            echo "Docker socket permission denied." >&2; \
            echo "Add your user to the docker group, then log out and back in:" >&2; \
            echo "  sudo usermod -aG docker $$USER" >&2; \
            echo "  newgrp docker" >&2; \
        else \
            echo "Docker daemon is not running or not reachable." >&2; \
            echo "Start Docker first (e.g. systemctl start docker), then re-run: just dev" >&2; \
        fi; \
        exit 1; \
    fi

# Start the local Postgres dev database (idempotent)
db: docker-check
    docker compose -f docker-compose.dev.yml up -d

# Stop the local Postgres dev database (keeps data)
db-down: docker-check
    docker compose -f docker-compose.dev.yml down

# Stop and delete the local Postgres dev database volume (full reset)
db-reset: docker-check
    docker compose -f docker-compose.dev.yml down -v

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
