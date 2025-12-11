#!/bin/bash

# Determine the type of build based on the first script argument
BUILD_TYPE=${1:-production}

BUILDER=$(docker buildx create --use)

if [ "$BUILD_TYPE" == "canary" ]; then
    TAG="canary"
    echo PUSHING CANARY
    docker buildx build --platform linux/amd64,linux/arm64 --pull --rm -t "a3180623/dokploy-i18n:${TAG}" -f 'Dockerfile' --push .
else
    echo  "PUSHING PRODUCTION"
    VERSION=$(node -p "require('./package.json').version")
    docker buildx build --platform linux/amd64,linux/arm64 --pull --rm -t "a3180623/dokploy-i18n:latest" -t "a3180623/dokploy-i18n:${VERSION}" -f 'Dockerfile' --push .
fi

docker buildx rm $BUILDER
