#!/bin/bash

# Determine the type of build based on the first script argument
BUILD_TYPE=${1:-production}

BUILDER=$(docker buildx create --use)

if [ "$BUILD_TYPE" == "canary" ]; then
    TAG="canary"
    echo PUSHING CANARY
        docker buildx build --platform linux/amd64,linux/arm64 --pull --rm -t "kamik2k/deploybox:${TAG}" -f 'Dockerfile' --push .
else
    echo  "PUSHING PRODUCTION"
    VERSION=$(node -p "require('./package.json').version")
    docker buildx build --platform linux/amd64,linux/arm64 --pull --rm -t "kamik2k/deploybox:latest" -t "kamik2k/deploybox:${VERSION}" -f 'Dockerfile' --push .
fi

docker buildx rm $BUILDER

