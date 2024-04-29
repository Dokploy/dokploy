#!/bin/bash

VERSION=$(node -p "require('./package.json').version")

docker push "dokploy/dokploy:${VERSION}"
docker push "dokploy/dokploy:latest"