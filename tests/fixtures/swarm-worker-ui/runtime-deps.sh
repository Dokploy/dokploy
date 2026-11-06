#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
umask 077
if [[ ! -f .state/runtime.env ]]; then
  password=$(openssl rand -hex 24)
  auth_secret=$(openssl rand -hex 32)
  printf 'POSTGRES_USER=dokploy\nPOSTGRES_DB=dokploy\nPOSTGRES_PASSWORD=%s\nDATABASE_URL=postgres://dokploy:%s@dokploy-postgres:5432/dokploy\nREDIS_HOST=dokploy-redis\nREDIS_PORT=6379\nREDIS_URL=redis://dokploy-redis:6379\nNODE_ENV=production\nPORT=3000\n' "$password" "$password" > .state/runtime.env
  printf 'BETTER_AUTH_SECRET=%s\n' "$auth_secret" >> .state/runtime.env
fi
for image in postgres:16-alpine redis:7-alpine; do
  docker pull "$image"
  docker save "$image" | docker compose exec -T manager docker load
done
docker compose cp .state/runtime.env manager:/root/runtime.env
docker compose exec -T manager sh -eu -c '
  docker network inspect dokploy-network >/dev/null 2>&1 || docker network create --driver overlay --attachable dokploy-network
  docker volume create dokploy-config >/dev/null
  docker container inspect dokploy-postgres >/dev/null 2>&1 || docker run -d --name dokploy-postgres --network dokploy-network --env-file /root/runtime.env --volume dokploy-postgres:/var/lib/postgresql/data postgres:16-alpine
  docker container inspect dokploy-redis >/dev/null 2>&1 || docker run -d --name dokploy-redis --network dokploy-network --volume dokploy-redis:/data redis:7-alpine
'
