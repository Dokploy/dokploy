#!/usr/bin/env bash

validate_sandbox_name() {
  local name=${1:-}
  [[ "$name" =~ ^ctd3513-[a-z0-9][a-z0-9-]{2,40}$ ]] || {
    printf 'sandbox name must match ^ctd3513-[a-z0-9][a-z0-9-]{2,40}$\n' >&2
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

ciphertext_prefix() {
  local value=${1:-}
  [[ "$value" == enc:v1:* ]] || {
    printf 'value does not have the enc:v1: prefix\n' >&2
    return 1
  }
  printf 'enc:v1:\n'
}

evidence_json() {
  local phase=$1 marker=$2
  printf '{"phase":"%s","sha256":"%s","length":%s}\n' \
    "$phase" "$(marker_hash "$marker")" "$(marker_length "$marker")"
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
  [[ "${1:-}" == approve-destroy-synthetic-ctd3513 ]] || {
    printf 'refusing teardown without approve-destroy-synthetic-ctd3513\n' >&2
    return 1
  }
}

nested_docker() {
  local sandbox=$1
  shift
  docker exec "$sandbox" docker "$@"
}

nested_sh() {
  local sandbox=$1
  shift
  docker exec "$sandbox" sh -ceu "$*"
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
