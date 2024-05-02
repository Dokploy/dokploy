#!/bin/bash

# Determine the type of build based on the first script argument
BUILD_TYPE=${1:-production}

if [ "$BUILD_TYPE" == "canary" ]; then
    TAG="canary"
else
    VERSION=$(node -p "require('./package.json').version")
    TAG="$VERSION"
fi

docker build --platform linux/amd64 --pull --rm -f 'Dockerfile' -t "dokploy/dokploy:${TAG}" .

if [ "$BUILD_TYPE" != "canary" ]; then
    # Tag the production build as latest
    docker tag "dokploy/dokploy:${TAG}" "dokploy/dokploy:latest"
fi
