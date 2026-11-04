#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
docker pull alpine:3.21
docker save alpine:3.21 -o .state/alpine.tar
for node in manager worker-a worker-b; do
  docker compose exec -T "$node" docker load < .state/alpine.tar
done
docker compose exec -T manager docker service create --no-resolve-image \
  --name worker-ui-fixture --replicas 2 --replicas-max-per-node 1 \
  --constraint node.role==worker --limit-cpu 0.25 --limit-memory 64M \
  alpine:3.21 sh -c 'while :; do echo "worker fixture $(hostname) $(date -u +%FT%TZ)"; dd if=/dev/zero bs=1M count=16 2>/dev/null | sha256sum; sleep 2; done'
