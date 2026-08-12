#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
source "$ROOT/lib.sh"

fail() {
  printf 'not ok - %s\n' "$1" >&2
  exit 1
}

assert_eq() {
  local expected=$1 actual=$2 message=$3
  [[ "$actual" == "$expected" ]] || fail "$message (expected $expected, got $actual)"
}

assert_rejects() {
  local message=$1
  shift
  if "$@" >/dev/null 2>&1; then
    fail "$message"
  fi
}

assert_eq "ctd3513-demo" "$(validate_sandbox_name ctd3513-demo)" "accepts a scoped sandbox name"
assert_rejects "rejects an unscoped sandbox name" validate_sandbox_name dokploy
assert_rejects "rejects shell metacharacters" validate_sandbox_name 'ctd3513-demo;rm'

marker='SYNTHETIC_MARKER=not-a-secret'
expected_hash=$(printf '%s' "$marker" | shasum -a 256 | awk '{print $1}')
assert_eq "$expected_hash" "$(marker_hash "$marker")" "hashes markers without returning marker content"
assert_eq "29" "$(marker_length "$marker")" "reports marker length"
assert_eq "enc:v1:" "$(ciphertext_prefix 'enc:v1:opaque-ciphertext')" "reports only the encryption prefix"
assert_rejects "rejects plaintext as ciphertext evidence" ciphertext_prefix "$marker"

safe=$(evidence_json marker "$marker")
[[ "$safe" == *'"phase":"marker"'* ]] || fail "evidence uses the common phase key"
[[ "$safe" == *"$expected_hash"* ]] || fail "evidence contains marker hash"
[[ "$safe" == *'"length":29'* ]] || fail "evidence contains marker length"
[[ "$safe" != *"$marker"* ]] || fail "evidence leaked marker"

image_id=sha256:1c254fbe41054892cc7e64d14f0ccc97d4726670fe38020dbb2728ef6972063c
validate_image_id "$image_id" "$image_id" || fail "accepts the pinned current image ID"
assert_rejects "rejects a different current image ID" validate_image_id "$image_id" \
  sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
assert_rejects "rejects a malformed current image ID" validate_image_id sha256:nope sha256:nope

digest=sha256:ae95f0d7e821fca4fb5f84eb1e5eb0bd61cdaddb4207dba1dcd0e4268b3c74c9
validate_candidate_digest "$digest" "ghcr.io/budivoogt/dokploy@$digest" || fail "accepts the pinned RepoDigest"
assert_rejects "rejects a different RepoDigest" validate_candidate_digest "$digest" \
  'ghcr.io/budivoogt/dokploy@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
assert_rejects "rejects a malformed digest" validate_candidate_digest sha256:nope "repo@$digest"

assert_rejects "teardown requires the exact approval phrase" require_teardown_approval wrong
require_teardown_approval approve-destroy-synthetic-ctd3513

printf 'ok - harness safety helpers\n'
