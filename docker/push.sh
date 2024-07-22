#!/bin/bash

# Determine the type of build based on the first script argument
BUILD_TYPE=${1:-production}


BUILDER_NAME="dokploy-builder"
docker buildx create --name $BUILDER_NAME --use

if [ "$BUILD_TYPE" == "canary" ]; then
    TAG="canary"
    echo PUSHING CANARY
        docker buildx build --builder $BUILDER_NAME --platform linux/amd64,linux/arm64  -t "dokploy/dokploy:${TAG}" -f 'Dockerfile' --push .
else
    echo  "PUSHING PRODUCTION"
    VERSION=$(node -p "require('./package.json').version")
    docker buildx build --builder $BUILDER_NAME --platform linux/amd64,linux/arm64  -t "dokploy/dokploy:latest" -t "dokploy/dokploy:${VERSION}" -f 'Dockerfile' --push .
fi

docker buildx rm $BUILDER

