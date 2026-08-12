#!/usr/bin/env bash

validate_sandbox_name() {
  local name=${1:-}
  [[ "$name" =~ ^ctd3514-[a-z0-9][a-z0-9-]{2,40}$ ]] || {
    printf 'sandbox name must match ^ctd3514-[a-z0-9][a-z0-9-]{2,40}$\n' >&2
    return 1
  }
  printf '%s\n' "$name"
}

marker_hash() {
  printf '%s' "$1" | shasum -a 256 | awk '{print $1}'
}

marker_length() {
  LC_ALL=C printf '%s' "$1" | wc -c | tr -d ' '
}

id_evidence() {
  local label=$1 value=$2
  printf '{"label":"%s","sha256":"%s","length":%s}\n' \
    "$label" "$(marker_hash "$value")" "$(marker_length "$value")"
}

validate_image_id() {
  local expected=${1:-} actual=${2:-}
  [[ "$expected" =~ ^sha256:[0-9a-f]{64}$ && "$actual" == "$expected" ]]
}

validate_candidate_digest() {
  local digest=${1:-} repo_digests=${2:-}
  [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  grep -q "@$digest$" <<<"$repo_digests"
}

require_teardown_approval() {
  [[ "${1:-}" == approve-destroy-synthetic-ctd3514 ]] || {
    printf 'refusing destructive synthetic operation without approve-destroy-synthetic-ctd3514\n' >&2
    return 1
  }
}

nested_docker() {
  local sandbox=$1
  shift
  docker exec "$sandbox" docker "$@"
}

wait_for() {
  local description=$1 attempts=$2 delay=$3
  shift 3
  local count=1
  until "$@"; do
    if (( count >= attempts )); then
      printf 'timed out waiting for %s\n' "$description" >&2
      return 1
    fi
    count=$((count + 1))
    sleep "$delay"
  done
}

# Mirror of scripts/dokploy/preview-cleanup.sh tracked-vs-orphan decision.
# Inputs: tracked service names file, running service names file.
# Prints keep/orphan decisions without invoking docker rm.
classify_preview_services() {
  local tracked_file=$1 running_file=$2
  local service
  while IFS= read -r service || [[ -n "$service" ]]; do
    [[ -n "$service" ]] || continue
    if grep -Fxq -- "$service" "$tracked_file"; then
      printf 'keep %s\n' "$service"
    else
      printf 'orphan %s\n' "$service"
    fi
  done <"$running_file"
}
