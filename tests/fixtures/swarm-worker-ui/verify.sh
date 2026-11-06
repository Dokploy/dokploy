#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[[ $(docker info --format '{{.Swarm.LocalNodeState}}') == inactive ]]
[[ $(docker compose exec -T manager docker node ls -q | wc -l | tr -d ' ') == 3 ]]
docker compose cp .state/id_ed25519 manager:/root/lab-ssh-key
docker compose exec -T manager chmod 600 /root/lab-ssh-key
for worker in worker-a worker-b; do
  worker_ip=$(docker inspect "$(docker compose ps -q "$worker")" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
  docker compose exec -T manager ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i /root/lab-ssh-key "root@$worker_ip" '
    set -eu
    test "$(docker ps -q --filter label=com.docker.swarm.service.name=worker-ui-fixture | wc -l)" -eq 1
    docker info --format "{{.Name}} {{json .Swarm}}"
    docker stats --no-stream --format "{{.Name}} {{.CPUPerc}} {{.MemUsage}}"
  '
done
docker compose exec -T manager docker service ps worker-ui-fixture
docker compose exec -T manager docker service logs --tail 2 worker-ui-fixture
