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
# - Postgres: require('pg') and connect using DATABASE_URL/POSTGRES_URL
# - Redis: require('redis') or require('ioredis') and ping using REDIS_URL or REDIS_HOST
wait_for_postgres() {
  require_env "DATABASE_URL"

  node <<'NODE'
const { Client } = require('pg');

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
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
      // A trivial query verifies not only TCP but session usability
      await client.query('SELECT 1');
      await client.end();
      console.log(`[entrypoint] Postgres ready: ${redact(url)}`);
      process.exit(0);
    } catch (e) {
      try { await client.end(); } catch {}
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

wait_for_redis() {
  require_env "REDIS_HOST"

  node <<'NODE'
const timeoutSeconds = Number(process.env.DOKPLOY_WAIT_TIMEOUT_SECONDS || 600);
const intervalSeconds = Number(process.env.DOKPLOY_WAIT_INTERVAL_SECONDS || 2);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function buildRedisUrl() {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  const host = process.env.REDIS_HOST;
  const port = process.env.REDIS_PORT || '6379';
  // If your Dokploy supports auth/user, you can extend this safely later.
  return `redis://${host}:${port}`;
}

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

async function tryWithRedisPackage(url) {
  // Prefer node-redis if present; fallback to ioredis if present.
  try {
    const { createClient } = require('redis');
    const client = createClient({ url });
    client.on('error', () => {}); // suppress noisy logs during retries
    await client.connect();
    await client.ping();
    await client.quit();
    return true;
  } catch (e1) {
    try {
      const IORedis = require('ioredis');
      const client = new IORedis(url, { lazyConnect: true });
      await client.connect();
      await client.ping();
      await client.quit();
      return true;
    } catch (e2) {
      // surface the most relevant error
      throw e2 || e1;
    }
  }
}

(async () => {
  const url = buildRedisUrl();
  const start = Date.now();
  let attempt = 0;

  while (true) {
    attempt += 1;
    try {
      await tryWithRedisPackage(url);
      console.log(`[entrypoint] Redis ready: ${redact(url)}`);
      process.exit(0);
    } catch (e) {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const remaining = timeoutSeconds - elapsed;
      const msg = (e && e.code) ? `${e.code}` : (e && e.message ? e.message : 'unknown error');
      console.log(`[entrypoint] Waiting for Redis... attempt=${attempt} elapsed=${elapsed}s remaining=${remaining}s err=${msg}`);
      if (remaining <= 0) {
        console.error(`[entrypoint] Timeout waiting for Redis after ${elapsed}s: ${redact(url)}`);
        process.exit(1);
      }
      await sleep(intervalSeconds * 1000);
    }
  }
})();
NODE
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
