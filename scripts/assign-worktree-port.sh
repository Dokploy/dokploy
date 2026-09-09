#!/usr/bin/env bash
set -euo pipefail

PAYLOAD=$(cat)
WORKTREE_PATH=$(echo "$PAYLOAD" | jq -r '.tool_response.worktreePath // empty')

if [ -z "$WORKTREE_PATH" ]; then
	exit 0
fi

ENV_FILE="$WORKTREE_PATH/apps/dokploy/.env"
if [ ! -f "$ENV_FILE" ]; then
	exit 0
fi

FREE_PORT=$(node "$CLAUDE_PROJECT_DIR/scripts/find-free-port.mjs")

sed -i.bak "s/^PORT=.*/PORT=$FREE_PORT/" "$ENV_FILE"
sed -i.bak -E "s#^(BETTER_AUTH_URL=https?://[^:/]+):[0-9]+#\1:$FREE_PORT#" "$ENV_FILE"
rm -f "$ENV_FILE.bak"

echo "Worktree $WORKTREE_PATH -> dokploy dev PORT=$FREE_PORT"
