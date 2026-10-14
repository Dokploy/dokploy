#!/usr/bin/env bash
set -euo pipefail

PAYLOAD=$(cat)
WORKTREE_PATH=$(echo "$PAYLOAD" | jq -r '.tool_response.worktreePath // empty')

if [ -z "$WORKTREE_PATH" ]; then
	exit 0
fi

# Turbopack refuses to resolve through anything outside its detected
# workspace root, so a symlinked node_modules (whole dir or per-entry)
# doesn't work for apps/dokploy. A real `pnpm install` is required, but
# since pnpm's global content-addressable store is already warm, this
# only links locally — no network fetch, a few seconds.
cd "$WORKTREE_PATH"
pnpm install --prefer-offline
