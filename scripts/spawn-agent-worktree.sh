#!/usr/bin/env bash
set -euo pipefail

NAME="${1:?usage: spawn-agent-worktree.sh <name>}"
# --show-toplevel would return the CURRENT worktree's own root if this is
# run from inside one (e.g. another agent's worktree) instead of the main
# checkout. --git-common-dir always points at the shared .git regardless of
# which worktree you're standing in.
REPO_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
WORKTREE_PATH="$REPO_ROOT/.claude/worktrees/$NAME"
BRANCH="worktree-$NAME"

if [ -e "$WORKTREE_PATH" ]; then
	echo "Worktree already exists: $WORKTREE_PATH" >&2
	exit 1
fi

git -C "$REPO_ROOT" fetch origin canary --quiet
git -C "$REPO_ROOT" worktree add -b "$BRANCH" "$WORKTREE_PATH" origin/canary >&2

# .worktreeinclude lists gitignored files (.env, .env.local) that a plain
# `git worktree add` won't check out on its own - copy them in.
while IFS= read -r pattern; do
	[ -z "$pattern" ] && continue
	find "$REPO_ROOT" \( -path "$REPO_ROOT/.claude/worktrees" -o -path "$REPO_ROOT/node_modules" \) -prune -o -name "$pattern" -print 2>/dev/null
done < "$REPO_ROOT/.worktreeinclude" | while read -r src; do
	rel="${src#"$REPO_ROOT"/}"
	dest="$WORKTREE_PATH/$rel"
	mkdir -p "$(dirname "$dest")"
	cp "$src" "$dest"
done

cd "$WORKTREE_PATH"
pnpm install --prefer-offline >&2

FREE_PORT=$(node "$REPO_ROOT/scripts/find-free-port.mjs")
sed -i.bak "s/^PORT=.*/PORT=$FREE_PORT/" apps/dokploy/.env
sed -i.bak -E "s#^(BETTER_AUTH_URL=https?://[^:/]+):[0-9]+#\1:$FREE_PORT#" apps/dokploy/.env
rm -f apps/dokploy/.env.bak

pnpm --filter=dokploy run dev > "$WORKTREE_PATH/dev-server.log" 2>&1 &
echo $! > "$WORKTREE_PATH/dev-server.pid"

BASE_URL="http://localhost:$FREE_PORT"
for _ in $(seq 1 30); do
	CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 1 "$BASE_URL/" || true)
	if [ "$CODE" != "000" ]; then
		break
	fi
	sleep 1
done

echo "export WORKTREE_PATH=$WORKTREE_PATH"
echo "export DOKPLOY_BASE_URL=$BASE_URL"
echo "export PORT=$FREE_PORT"
