#!/bin/bash

VERSION=$(node -p "require('./package.json').version")

docker build --platform linux/amd64 --pull --rm -f 'Dockerfile' -t "dokploy/dokploy:${VERSION}" .

docker tag "dokploy/dokploy:${VERSION}" "dokploy/dokploy:latest"