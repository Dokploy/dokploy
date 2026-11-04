#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ $(docker info --format '{{.Swarm.LocalNodeState}}') != inactive ]]; then
  echo 'Expected host Docker Swarm to be inactive; refusing setup.' >&2
  exit 1
fi
mkdir -p .state
chmod 700 .state
if [[ ! -f .state/id_ed25519 ]]; then
  ssh-keygen -q -t ed25519 -N '' -C dokploy-worker-ui-poc -f .state/id_ed25519
fi
chmod 600 .state/id_ed25519
# Fetch through the host because Docker Desktop container egress can be restricted.
arch=$(docker info --format '{{.Architecture}}')
mkdir -p .packages
for package in openssh-client-common openssh-client-default openssh-keygen openssh-server-common openssh-server; do
  filename="$package-9.9_p2-r0.apk"
  [[ -s ".packages/$filename" ]] && continue
  curl -fsSL --max-time 30 --retry 3 "https://dl-cdn.alpinelinux.org/alpine/v3.21/main/$arch/$filename" -o ".packages/$filename.part"
  mv ".packages/$filename.part" ".packages/$filename"
done
docker compose up --build -d --wait
manager_ip=$(docker inspect "$(docker compose ps -q manager)" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
if [[ $(docker compose exec -T manager docker info --format '{{.Swarm.LocalNodeState}}') == inactive ]]; then
  docker compose exec -T manager docker swarm init --advertise-addr "$manager_ip" >/dev/null
fi
token=$(docker compose exec -T manager docker swarm join-token -q worker)
for worker in worker-a worker-b; do
  worker_ip=$(docker inspect "$(docker compose ps -q "$worker")" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
  if [[ $(docker compose exec -T "$worker" docker info --format '{{.Swarm.LocalNodeState}}') == inactive ]]; then
    docker compose exec -T "$worker" docker swarm join --token "$token" --advertise-addr "$worker_ip" "$manager_ip:2377"
  fi
done
[[ $(docker info --format '{{.Swarm.LocalNodeState}}') == inactive ]]
docker compose exec -T manager docker node ls
