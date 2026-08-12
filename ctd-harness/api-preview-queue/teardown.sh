#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
source "$ROOT/lib.sh"

require_teardown_approval "${1:-}"
SANDBOX=$(validate_sandbox_name "${CTD3514_SANDBOX:-ctd3514-api-preview-queue}")
STATE_DIR="$ROOT/.state/$SANDBOX"

if docker container inspect "$SANDBOX" >/dev/null 2>&1; then
  docker rm -f "$SANDBOX" >/dev/null
fi

if docker volume inspect "$SANDBOX-docker" >/dev/null 2>&1; then
  docker volume rm "$SANDBOX-docker" >/dev/null
fi

# Retain only sanitized evidence; remove credentials, cookies, and raw IDs.
if [[ -d "$STATE_DIR" ]]; then
  find "$STATE_DIR" -mindepth 1 -maxdepth 1 ! -name 'evidence.jsonl' ! -name 'evidence.previous.*' ! -name 'summary.json' \
    -exec rm -rf -- {} +
fi

if docker container inspect "$SANDBOX" >/dev/null 2>&1 \
  || docker volume inspect "$SANDBOX-docker" >/dev/null 2>&1; then
  printf 'teardown verification failed for %s\n' "$SANDBOX" >&2
  exit 1
fi

printf 'removed synthetic containers, volumes, credentials for %s\n' "$SANDBOX"
printf 'sanitized evidence retained at %s\n' "$STATE_DIR"
