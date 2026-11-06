#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
repo=$(cd ../../.. && pwd)
context=.state/runtime-image
[[ -f "$repo/apps/dokploy/.next/BUILD_ID" ]]
[[ -f "$repo/apps/dokploy/dist/server.mjs" ]]
[[ -d "$repo/packages/server/dist" ]]
mkdir -p "$context"
rsync -a --delete --exclude cache/ "$repo/apps/dokploy/.next/" "$context/next/"
rsync -a --delete "$repo/apps/dokploy/dist/" "$context/app-dist/"
rsync -a --delete "$repo/packages/server/dist/" "$context/server-dist/"
rsync -a --delete "$repo/apps/dokploy/drizzle/" "$context/drizzle/"
cp "$repo/apps/dokploy/next.config.mjs" "$context/next.config.mjs"
docker build -f runtime.Dockerfile -t dokploy-worker-ui-poc:local "$context"
docker save dokploy-worker-ui-poc:local | docker compose exec -T manager docker load
