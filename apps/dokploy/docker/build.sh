#!/bin/bash

# Determine the type of build based on the first script argument
BUILD_TYPE=${1:-production}

if [ "$BUILD_TYPE" == "canary" ]; then
    TAG="canary"
else
    VERSION=$(node -p "require('./package.json').version")
    TAG="$VERSION"
fi

BUILDER=$(docker buildx create --use)

# docker build --platform linux/arm64 --pull --rm -t  "dokploy/dokploy:${TAG}" -f 'apps/dokploy/Dockerfile' .
docker buildx build --platform linux/arm64 --pull --rm -t "dokploy/dokploy:bug" -f 'apps/dokploy/Dockerfile'  --push . 

docker buildx rm $BUILDER
