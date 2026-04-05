# Dockerfile for DevContainer
FROM node:24.4.0-bullseye-slim

# Install essential packages
RUN apt-get update && apt-get install -y \
    curl \
    bash \
    git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set up PNPM
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

# Create workspace directory
WORKDIR /workspaces/dokploy

# Set up user permissions
USER node