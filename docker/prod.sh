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
if ss -tulnp | grep ':80 ' >/dev/null; then
    echo "Error: something is already running on port 80" >&2
    exit 1
fi

# check if something is running on port 443
if ss -tulnp | grep ':443 ' >/dev/null; then
    echo "Error: something is already running on port 443" >&2
    exit 1
fi






command_exists() {
  command -v "$@" > /dev/null 2>&1
}

if command_exists docker; then
  echo "Docker already installed"
else
  curl -sSL https://get.docker.com | sh
fi

docker swarm leave --force 2>/dev/null
docker swarm init --advertise-addr 127.0.0.1 --listen-addr 0.0.0.0;

echo "Swarm initialized"

docker network rm -f dokploy-network 2>/dev/null
docker network create --driver overlay --attachable dokploy-network

echo "Network created"

mkdir -p /etc/dokploy

chmod -R 777 /etc/dokploy

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


public_ip=$(hostname -I | awk '{print $1}')

GREEN="\033[0;32m"
YELLOW="\033[1;33m"
BLUE="\033[0;34m"
NC="\033[0m" # No Color


echo ""
printf "${GREEN}Congratulations, Dokploy is installed!${NC}\n"
printf "${BLUE}Wait 15 seconds for the server to start${NC}\n"
printf "${YELLOW}Please go to http://${public_ip}:3000${NC}\n\n"
echo ""
