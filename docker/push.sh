#!/bin/bash

# Determine the type of build based on the first script argument
BUILD_TYPE=${1:-production}

if [ "$BUILD_TYPE" == "canary" ]; then
    TAG="canary"
    echo PUSHING CANARY
    docker push "dokploy/dokploy:${TAG}"
else
    echo  "PUSHING PRODUCTION"
    VERSION=$(node -p "require('./package.json').version")
    docker push "dokploy/dokploy:${VERSION}"
    docker push "dokploy/dokploy:latest"
fi
