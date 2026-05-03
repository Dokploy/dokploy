#!/usr/bin/env bash
set -euo pipefail

# Boot the same test stack as `pnpm test:e2e`, seed an admin user, and leave
# the dev server running on http://127.0.0.1:3001 so you can click around in
# a real browser. Ctrl+C tears everything down.
#
# Usage:
#   pnpm e2e:dev                     # boot + seed + serve
#   CLEAN=1 pnpm e2e:dev             # drop DB volume first
#   KEEP_CONTAINERS=1 pnpm e2e:dev   # leave postgres/redis running on exit

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT/docker-compose.e2e.yml"

export DATABASE_URL="postgres://dokploy:dokploy@127.0.0.1:5433/dokploy_test"
export BETTER_AUTH_SECRET="e2e-test-secret-do-not-use-in-production"
export REDIS_HOST="127.0.0.1"
export PORT="3001"
export HOST="127.0.0.1"
export NODE_ENV="development"

cd "$ROOT"

DEV_PID=""

cleanup() {
	echo ""
	echo "▸ Shutting down"
	if [[ -n "$DEV_PID" ]] && kill -0 "$DEV_PID" 2>/dev/null; then
		kill "$DEV_PID" 2>/dev/null || true
		wait "$DEV_PID" 2>/dev/null || true
	fi
	if [[ "${KEEP_CONTAINERS:-0}" != "1" ]]; then
		docker compose -f "$COMPOSE_FILE" down >/dev/null 2>&1 || true
	else
		echo "▸ KEEP_CONTAINERS=1 — leaving postgres/redis running"
	fi
}
trap cleanup EXIT INT TERM

if [[ "${CLEAN:-0}" == "1" ]]; then
	echo "▸ CLEAN=1 — removing volumes"
	docker compose -f "$COMPOSE_FILE" down -v >/dev/null 2>&1 || true
fi

echo "▸ Starting Postgres + Redis"
docker compose -f "$COMPOSE_FILE" up -d --wait

echo "▸ Installing workspace deps"
pnpm install --prefer-offline --silent

echo "▸ Running Drizzle migrations"
pnpm --filter dokploy exec tsx -r dotenv/config migration.ts

echo "▸ Starting Dokploy dev server on http://127.0.0.1:3001"
(cd "$ROOT/apps/dokploy" && pnpm run dev) &
DEV_PID=$!

echo "▸ Waiting for server to respond"
HEALTH_OK=0
for _ in $(seq 1 120); do
	if curl -sf http://127.0.0.1:3001/api/health >/dev/null 2>&1; then
		HEALTH_OK=1
		break
	fi
	if ! kill -0 "$DEV_PID" 2>/dev/null; then
		echo "❌ Dev server exited early — check logs above"
		exit 1
	fi
	sleep 1
done
if [ "$HEALTH_OK" != "1" ]; then
	echo "❌ Health check timed out after 120s"
	exit 1
fi

echo "▸ Seeding admin user (idempotent)"
curl -s -o /dev/null -X POST http://127.0.0.1:3001/api/auth/sign-up/email \
	-H 'Content-Type: application/json' \
	-d '{"email":"admin@admin.com","password":"adminadmin","name":"E2E","lastName":"Admin"}' \
	|| true

cat <<'EOF'

────────────────────────────────────────────────────────────
  Dokploy is running:  http://127.0.0.1:3001
  Login with:
    Email:    admin@admin.com
    Password: adminadmin
────────────────────────────────────────────────────────────
  Ctrl+C to stop (postgres + redis will be torn down)
  KEEP_CONTAINERS=1 to keep the DB between runs
────────────────────────────────────────────────────────────

EOF

wait "$DEV_PID"
