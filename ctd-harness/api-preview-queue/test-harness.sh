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

assert_eq "ctd3514-demo" "$(validate_sandbox_name ctd3514-demo)" "accepts a scoped sandbox name"
assert_rejects "rejects an unscoped sandbox name" validate_sandbox_name dokploy
assert_rejects "rejects CTD-3513 namespace" validate_sandbox_name ctd3513-encryption
assert_rejects "rejects shell metacharacters" validate_sandbox_name 'ctd3514-demo;rm'

marker='SYNTHETIC_MARKER=not-a-secret'
expected_hash=$(printf '%s' "$marker" | shasum -a 256 | awk '{print $1}')
assert_eq "$expected_hash" "$(marker_hash "$marker")" "hashes markers without returning marker content"
assert_eq "29" "$(marker_length "$marker")" "reports marker length"

safe=$(id_evidence projectId "$marker")
[[ "$safe" == *'"label":"projectId"'* ]] || fail "evidence uses the label key"
[[ "$safe" == *"$expected_hash"* ]] || fail "evidence contains marker hash"
[[ "$safe" != *"$marker"* ]] || fail "evidence leaked marker"

image_id=sha256:02ae55741a50959165f45ce4072bd0a43a28583e979d92513572317a382276ad
validate_image_id "$image_id" "$image_id" || fail "accepts the pinned candidate image ID"
assert_rejects "rejects a different image ID" validate_image_id "$image_id" \
  sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

digest=sha256:ae95f0d7e821fca4fb5f84eb1e5eb0bd61cdaddb4207dba1dcd0e4268b3c74c9
validate_candidate_digest "$digest" "ghcr.io/budivoogt/dokploy@$digest" || fail "accepts the pinned RepoDigest"
assert_rejects "rejects a different RepoDigest" validate_candidate_digest "$digest" \
  'ghcr.io/budivoogt/dokploy@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

assert_rejects "teardown requires the exact approval phrase" require_teardown_approval wrong
require_teardown_approval approve-destroy-synthetic-ctd3514

tmp=$(mktemp -d)
printf 'preview-tracked-a\npreview-tracked-b\n' >"$tmp/tracked"
printf 'preview-tracked-a\npreview-orphan-x\npreview-tracked-b\n' >"$tmp/running"
classification=$(classify_preview_services "$tmp/tracked" "$tmp/running")
assert_eq $'keep preview-tracked-a\norphan preview-orphan-x\nkeep preview-tracked-b' \
  "$classification" "classifies tracked keep and intentional orphan"
rm -rf "$tmp"

printf 'ok - harness safety helpers and cleanup classifier\n'
