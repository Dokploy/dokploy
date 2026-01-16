#!/bin/sh
set -eu

# Enable/disable waiting logic
: "${DOKPLOY_WAIT_FOR_DEPS:=1}"

# Total wait budget + retry pacing
: "${DOKPLOY_WAIT_TIMEOUT_SECONDS:=600}"     # 10 min default
: "${DOKPLOY_WAIT_INTERVAL_SECONDS:=2}"

# Optional override (otherwise derived from DATABASE_URL and REDIS_HOST)
: "${POSTGRES_URL:=}"                        # if set, takes precedence over DATABASE_URL
: "${REDIS_URL:=}"                           # optional; otherwise uses REDIS_HOST/REDIS_PORT
: "${REDIS_PORT:=6379}"

log() { echo "[entrypoint] $*"; }

require_env() {
  name="$1"
  eval "val=\${$name:-}"
  if [ -z "$val" ]; then
    log "Missing required environment variable: $name"
    exit 1
  fi
}

# Uses Node + runtime deps in node_modules to test REAL connectivity:
# - Postgres: require('postgres') and connect using DATABASE_URL/POSTGRES_URL
wait_for_postgres() {
  require_env "DATABASE_URL"

  node <<'NODE'
const postgres = require('postgres');

const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const timeoutSeconds = Number(process.env.DOKPLOY_WAIT_TIMEOUT_SECONDS || 600);
const intervalSeconds = Number(process.env.DOKPLOY_WAIT_INTERVAL_SECONDS || 2);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function redact(u) {
  try {
    const x = new URL(u);
    if (x.password) x.password = '***';
    if (x.username) x.username = '***';
    return x.toString();
  } catch {
    return '(invalid url)';
  }
}

(async () => {
  const start = Date.now();
  let attempt = 0;

  while (true) {
    attempt += 1;
    const sql = postgres(url, {
      // keep timeouts tight so retries are responsive
      connect_timeout: 5,          // seconds
      idle_timeout: 5,             // seconds
      max_lifetime: 10,            // seconds
      max: 1
    });

    try {
      await sql`select 1`;
      await sql.end({ timeout: 5 });
      console.log(`[entrypoint] Postgres ready: ${redact(url)}`);
      process.exit(0);
    } catch (e) {
      try { await sql.end({ timeout: 5 }); } catch {}
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const remaining = timeoutSeconds - elapsed;
      const msg = (e && e.code) ? `${e.code}` : (e && e.message ? e.message : 'unknown error');
      console.log(`[entrypoint] Waiting for Postgres... attempt=${attempt} elapsed=${elapsed}s remaining=${remaining}s err=${msg}`);
      if (remaining <= 0) {
        console.error(`[entrypoint] Timeout waiting for Postgres after ${elapsed}s: ${redact(url)}`);
        process.exit(1);
      }
      await sleep(intervalSeconds * 1000);
    }
  }
})();
NODE
}

## Using redis-cli as in the dokploy build, there is no reliable way to use ioredis/redis node libs.
wait_for_redis() {
  : "${REDIS_HOST:?REDIS_HOST is required}"
  : "${REDIS_PORT:=6379}"

  start_ts="$(date +%s)"
  attempt=0

  while true; do
    attempt=$((attempt + 1))
    if redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" ping 2>/dev/null | grep -q PONG; then
      echo "[entrypoint] Redis ready: ${REDIS_HOST}:${REDIS_PORT}"
      return 0
    fi

    now="$(date +%s)"
    elapsed="$((now - start_ts))"
    remaining="$((DOKPLOY_WAIT_TIMEOUT_SECONDS - elapsed))"

    echo "[entrypoint] Waiting for Redis... attempt=${attempt} elapsed=${elapsed}s remaining=${remaining}s"
    if [ "$remaining" -le 0 ]; then
      echo "[entrypoint] Timeout waiting for Redis after ${elapsed}s"
      return 1
    fi

    sleep "${DOKPLOY_WAIT_INTERVAL_SECONDS}"
  done
}


if [ "$DOKPLOY_WAIT_FOR_DEPS" = "1" ]; then
  log "Dependency wait enabled. timeout=${DOKPLOY_WAIT_TIMEOUT_SECONDS}s interval=${DOKPLOY_WAIT_INTERVAL_SECONDS}s"
  wait_for_postgres
  wait_for_redis
else
  log "Dependency wait disabled (DOKPLOY_WAIT_FOR_DEPS=0)."
fi

log "Starting: $*"
exec "$@"
