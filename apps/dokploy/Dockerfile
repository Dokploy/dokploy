FROM node:18-slim AS base

# Disable husky
ENV HUSKY=0

# Set pnpm home
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Enable corepack
RUN corepack enable

# Set workdir
WORKDIR /app

FROM base AS pruner

RUN pnpm add -g turbo
COPY . .
RUN turbo prune dokploy --docker


FROM base AS base-deps
# Install dependencies only for production
RUN apt-get update && apt-get install -y python3 make g++ git && rm -rf /var/lib/apt/lists/*

# Copy install script for husky
COPY .husky/install.mjs ./.husky/install.mjs

# Copy package.json and pnpm-lock.yaml
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
# Copy install script for husky
COPY --from=pruner /app/.husky/install.mjs ./.husky/install.mjs

FROM base-deps AS prod-deps

# Set production
ENV NODE_ENV=production

# Install dependencies only for production
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base-deps AS build

# Install dependencies only for building
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Copy the rest of the source code
COPY . .

# Build the application
COPY --from=pruner /app/out/full/ .

FROM base AS production

# Set production
ENV NODE_ENV=production

# Install dependencies only for production
RUN apt-get update && apt-get install -y curl apache2-utils && rm -rf /var/lib/apt/lists/*

# Copy the rest of the source code
COPY --from=base /app/apps/dokploy/.next ./apps/dokploy/.next
COPY --from=base /app/apps/dokploy/dist ./apps/dokploy/dist
COPY --from=base /app/apps/dokploy/next.config.js ./apps/dokploy/next.config.js
COPY --from=base /app/apps/dokploy/public ./apps/dokploy/public
COPY --from=base /app/apps/dokploy/package.json ./apps/dokploy/package.json
COPY --from=base /app/apps/dokploy/drizzle ./apps/dokploy/drizzle
COPY --from=base /app/apps/dokploy/.env.production ./apps/dokploy/.env.production
COPY --from=base /app/apps/dokploy/components.json ./apps/dokploy/components.json

# Install docker
RUN curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh && rm get-docker.sh

# Install Nixpacks and tsx
# | VERBOSE=1 VERSION=1.21.0 bash
RUN curl -sSL https://nixpacks.com/install.sh -o install.sh \
    && chmod +x install.sh \
    && ./install.sh \
    && pnpm install -g tsx

# Install buildpacks
RUN curl -sSL "https://github.com/buildpacks/pack/releases/download/v0.35.0/pack-v0.35.0-linux.tgz" | tar -C /usr/local/bin/ --no-same-owner -xzv pack

# Expose port
EXPOSE 3000

CMD ["pnpm", "start"]
