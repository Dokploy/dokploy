#!/bin/bash

# Determine the type of build based on the first script argument
BUILD_TYPE=${1:-production}

if [ "$BUILD_TYPE" == "canary" ]; then
    TAG="canary"
else
    VERSION=$(node -p "require('./package.json').version")
    TAG="$VERSION"
fi

# Ensure Docker's buildx plugin is being used and set as the default builder
BUILDER=$(docker buildx create --use)

# Build and push the images for different architectures
docker buildx build --platform linux/amd64,linux/arm64,linux/arm/v7 --pull --rm -t "dokploy/dokploy:${TAG}" -f 'Dockerfile' --push .

if [ "$BUILD_TYPE" != "canary" ]; then
    # Tag the production build as latest for all architectures and push
    docker buildx build --platform linux/amd64,linux/arm64,linux/arm/v7 --pull --rm -t "dokploy/dokploy:latest" -f 'Dockerfile' --push .
fi

# Clean up the buildx builder instance
docker buildx rm $BUILDER
