#!/usr/bin/env bash
# Ensure the local development Postgres (docker-compose.dev.yml) is up or down.
# Usage: scripts/dev-db.sh up|down|reset
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.dev.yml}"
COMMAND="${1:-up}"

die() {
	echo "$*" >&2
	exit 1
}

require_docker() {
	if ! docker info >/dev/null 2>&1; then
		if docker info 2>&1 | grep -qi "permission denied"; then
			die "Docker socket permission denied.

Add your user to the docker group, then log out and back in:
  sudo usermod -aG docker \$USER
  newgrp docker"
		else
			die "Docker daemon is not running or not reachable.

Start Docker first (e.g. systemctl start docker), then re-run: just dev"
		fi
	fi
}

# Find docker services publishing host port 5432.
swarm_services_on_5432() {
	docker service ls --format '{{.Name}}' 2>/dev/null | while read -r svc; do
		if docker service inspect "$svc" --format \
			'{{range .Endpoint.Ports}}{{if eq .PublishedPort 5432}}5432 {{end}}{{end}}' \
			2>/dev/null | grep -qw 5432; then
			echo "$svc"
		fi
	done
}

# Find docker containers mapping host port 5432.
containers_on_5432() {
	docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null |
		awk -F '\t' '$2 ~ /:5432->/ {print $1}'
}

diagnose_port_conflict() {
	echo "Failed to start the dev database: port 5432 is already in use." >&2
	echo "Docker services on 5432: $(swarm_services_on_5432 | paste -sd' ' -)" >&2
	echo "Docker containers on 5432: $(containers_on_5432 | paste -sd' ' -)" >&2

	if swarm_services_on_5432 | grep -qx "dokploy-postgres"; then
		cat >&2 <<'EOF'

A leftover Dokploy Swarm postgres service (created by `dokploy:setup`) is
occupying port 5432. It is superseded by this compose database. Remove it and
re-run:

  docker service rm dokploy-postgres
  just db
EOF
	elif [ -n "$(swarm_services_on_5432)" ] || [ -n "$(containers_on_5432)" ]; then
		cat >&2 <<'EOF'

Stop or remove the docker service/container listed above, then re-run:
  just db
EOF
	else
		cat >&2 <<'EOF'

A non-docker process is listening on port 5432 (e.g. a local Postgres install).
Either stop it, or skip this dev database and point DATABASE_URL in
apps/dokploy/.env at your own Postgres, then run `just dev` without `just db`.
EOF
	fi
	exit 1
}

case "$COMMAND" in
up)
	require_docker
	if docker compose -f "$COMPOSE_FILE" up -d; then
		exit 0
	fi
	diagnose_port_conflict
	;;
down)
	require_docker
	docker compose -f "$COMPOSE_FILE" down
	;;
reset)
	require_docker
	docker compose -f "$COMPOSE_FILE" down -v
	;;
*)
	die "Usage: scripts/dev-db.sh up|down|reset"
	;;
esac
