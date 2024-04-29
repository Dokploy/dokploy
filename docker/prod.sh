#!/bin/bash

if [ "$(id -u)" != "0" ]; then
    echo "This script must be run as root" >&2
    exit 1
fi

# check if is Mac OS
if [ "$(uname)" = "Darwin" ]; then
    echo "This script must be run on Linux" >&2
    exit 1
fi


# check if is running inside a container
if [ -f /.dockerenv ]; then
    echo "This script must be run on Linux" >&2
    exit 1
fi

# check if something is running on port 80
if lsof -i :80 >/dev/null; then
    echo "Error: something is already running on port 80" >&2
    exit 1
fi

# check if something is running on port 443
if lsof -i :443 >/dev/null; then
    echo "Error: something is already running on port 443" >&2
    exit 1
fi


# Network
network_exists=$(docker network ls | grep dokploy-network)

if [ -z "$network_exists" ]; then
    docker network create --driver overlay --attachable dokploy-network
    echo "Network was initialized"
else
    echo "Network is already initialized"
fi


# Swarm
swarm_status=$(docker info --format '{{.Swarm.LocalNodeState}}')

if [ "$swarm_status" = "active" ]; then
    docker swarm leave --force 1> /dev/null 2> /dev/null || true
    echo "Swarm is already initialized"
else
    docker swarm init --advertise-addr 127.0.0.1 --listen-addr 0.0.0.0
    echo "Swarm was initialized"
fi

command_exists() {
  command -v "$@" > /dev/null 2>&1
}

if command_exists docker; then
  echo "Docker already installed"
else
  curl -sSL https://get.docker.com | sh
fi

docker pull dokploy/dokploy:latest

# Installation
docker service create \
  --name dokploy \
  --replicas 1 \
  --network dokploy-network \
  --mount type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock \
  --mount type=bind,source=/etc/dokploy,target=/etc/dokploy \
  --publish published=3000,target=3000,mode=host \
  --update-parallelism 1 \
  --update-order stop-first \
  dokploy/dokploy:latest