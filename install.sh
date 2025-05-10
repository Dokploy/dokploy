#!/bin/bash

# This script is used to install the required packages for the project.
export NODE_ENV=production
export REDIS_HOST=127.0.0.1

mkdir -p ./build
mkdir -p ./build-tmp

pnpm install --frozen-lockfile

pnpm --filter=@dokploy/server build
pnpm --filter=./apps/dokploy run build
pnpm --filter=./apps/dokploy --prod deploy ./build-tmp

cp -R ./apps/dokploy/.next ./build/.next
cp -R ./apps/dokploy/dist ./build/dist

cp -R ./build-tmp/next.config.mjs ./build/next.config.js
cp -R ./build-tmp/package.json ./build/package.json
cp -R ./build-tmp/package-lock.json ./build/package-lock.json
cp -R ./build-tmp/public ./build/public
cp -R ./build-tmp/drizzle ./build/drizzle
cp -R ./build-tmp/.env.production ./build/.env
cp -R ./build-tmp/components.json ./build/components.json
cp -R ./build-tmp/node_modules ./build/node_modules

