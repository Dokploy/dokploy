FROM node:18-slim AS base
ENV HUSKY=0
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# Pruning stage
FROM base AS pruner
RUN pnpm add -g turbo
COPY . .
RUN turbo prune dokploy --docker

FROM base AS base-deps
RUN apt-get update && apt-get install -y python3 make g++ git && rm -rf /var/lib/apt/lists/*
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/.husky/install.mjs ./.husky/install.mjs

FROM base-deps AS prod-deps
ENV NODE_ENV=production
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base-deps AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
WORKDIR /app/apps/dokploy
RUN pnpm build

FROM base AS production
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y curl apache2-utils && rm -rf /var/lib/apt/lists/*

# Copy built files and dependencies
COPY --from=build /app/apps/dokploy/.next ./.next
COPY --from=build /app/apps/dokploy/dist ./dist
COPY --from=build /app/apps/dokploy/next.config.mjs ./next.config.mjs
COPY --from=build /app/apps/dokploy/public ./public
COPY --from=build /app/apps/dokploy/package.json ./package.json
COPY --from=build /app/apps/dokploy/drizzle ./drizzle
COPY --from=build /app/apps/dokploy/.env.production ./.env
COPY --from=build /app/apps/dokploy/components.json ./components.json
COPY --from=prod-deps /app/node_modules ./node_modules

# Install docker
RUN curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh && rm get-docker.sh

# Install Nixpacks and tsx
RUN curl -sSL https://nixpacks.com/install.sh -o install.sh \
    && chmod +x install.sh \
    && ./install.sh \
    && pnpm install -g tsx

# Install buildpacks
RUN curl -sSL "https://github.com/buildpacks/pack/releases/download/v0.35.0/pack-v0.35.0-linux.tgz" | tar -C /usr/local/bin/ --no-same-owner -xzv pack

EXPOSE 3000
CMD ["pnpm", "start"]