#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
source "$ROOT/lib.sh"

require_teardown_approval "${1:-}"
SANDBOX=$(validate_sandbox_name "${CTD3513_SANDBOX:-ctd3513-encryption}")
STATE_DIR="$ROOT/.state/$SANDBOX"

# The name validator and exact approval phrase keep every removal scoped to the
# synthetic CTD-3513 sandbox. Evidence is copied out before resources are removed.
if docker container inspect "$SANDBOX" >/dev/null 2>&1; then
  if [[ -d "$STATE_DIR" ]]; then
    docker cp "$SANDBOX:/ctd3513-restored-marker.sha256" "$STATE_DIR/" 2>/dev/null || true
    docker cp "$SANDBOX:/ctd3513-restored-marker.length" "$STATE_DIR/" 2>/dev/null || true
  fi
  docker rm -f "$SANDBOX" >/dev/null
fi

if docker volume inspect "$SANDBOX-docker" >/dev/null 2>&1; then
  docker volume rm "$SANDBOX-docker" >/dev/null
fi
if docker container inspect ctd3513-build-redis >/dev/null 2>&1; then
  docker rm -f ctd3513-build-redis >/dev/null
fi
if docker network inspect ctd3513-build >/dev/null 2>&1; then
  docker network rm ctd3513-build >/dev/null
fi

# Retain only sanitized evidence; remove every synthetic marker, credential,
# keyring, cookie, and temporary source/build input created by this harness.
if [[ -d "$STATE_DIR" ]]; then
  rm -rf -- "$STATE_DIR/current-build-context"
  rm -f -- "$STATE_DIR/auth-v1" "$STATE_DIR/auth-v2" \
    "$STATE_DIR/encryption-v1" "$STATE_DIR/encryption-wrong" \
    "$STATE_DIR/encryption-restore-target" "$STATE_DIR/encryption.key" \
    "$STATE_DIR/postgres-password" "$STATE_DIR/operator-password" \
    "$STATE_DIR/marker" "$STATE_DIR/cookies.txt" \
    "$STATE_DIR/project-id" "$STATE_DIR/environment-id" "$STATE_DIR/application-id"
fi

if docker container inspect "$SANDBOX" >/dev/null 2>&1 \
  || docker volume inspect "$SANDBOX-docker" >/dev/null 2>&1 \
  || docker container inspect ctd3513-build-redis >/dev/null 2>&1 \
  || docker network inspect ctd3513-build >/dev/null 2>&1; then
  printf 'teardown verification failed for %s\n' "$SANDBOX" >&2
  exit 1
fi

printf 'removed synthetic containers, networks, credentials, and outer Docker volume for %s\n' "$SANDBOX"
printf 'sanitized evidence retained at %s\n' "$STATE_DIR"
