#!/bin/bash

# Determine the type of build based on the first script argument
BUILD_TYPE=${1:-production}

if [ "$BUILD_TYPE" == "canary" ]; then
    TAG="canary"
else
    VERSION=$(node -p "require('./package.json').version")
    TAG="$VERSION"
fi

# The Dockerfile expects these files to exist in the build context (see
# CONTRIBUTING.md#docker); generate them from the example if missing so the
# build doesn't fail with a confusing "file not found" error.
[ -f .env.production ] || cp apps/dokploy/.env.production.example .env.production
[ -f apps/dokploy/.env.production ] || cp apps/dokploy/.env.production.example apps/dokploy/.env.production

BUILDER=$(docker buildx create --use)

docker buildx build --platform linux/amd64,linux/arm64 --pull --rm -t "dokploy/dokploy:${TAG}" -f 'Dockerfile' .

docker buildx rm $BUILDER
