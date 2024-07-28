# Etapa base
FROM node:18-slim AS base
ENV HUSKY=0
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# Etapa de pruning
FROM base AS pruner
RUN apt-get update && apt-get install -y python3 make g++ git && rm -rf /var/lib/apt/lists/*
COPY . .
RUN pnpm install turbo -g
RUN pnpm turbo prune dokploy --docker

# Etapa de dependencias
FROM base AS deps
RUN apt-get update && apt-get install -y python3 make g++ git && rm -rf /var/lib/apt/lists/*
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
# copy husky folder 
COPY --from=pruner /app/.husky/ ./.husky
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Etapa de construcción
FROM deps AS builder
COPY --from=pruner /app/out/full/ .
COPY turbo.json turbo.json
RUN pnpm turbo run build --filter=dokploy

# Etapa de producción
FROM base AS production
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y curl apache2-utils && rm -rf /var/lib/apt/lists/*

# Copiar archivos de construcción y dependencias
COPY --from=builder /app/apps/dokploy/.next ./.next
COPY --from=builder /app/apps/dokploy/dist ./dist
COPY --from=builder /app/apps/dokploy/next.config.mjs ./next.config.mjs
COPY --from=builder /app/apps/dokploy/public ./public
COPY --from=builder /app/apps/dokploy/package.json ./package.json
COPY --from=builder /app/apps/dokploy/drizzle ./drizzle
COPY --from=builder /app/apps/dokploy/.env.production ./.env
COPY --from=builder /app/apps/dokploy/components.json ./components.json
COPY --from=deps /app/node_modules ./node_modules

# Instalar herramientas adicionales
RUN curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh && rm get-docker.sh
RUN curl -sSL https://nixpacks.com/install.sh -o install.sh && chmod +x install.sh && ./install.sh && pnpm install -g tsx
RUN curl -sSL "https://github.com/buildpacks/pack/releases/download/v0.35.0/pack-v0.35.0-linux.tgz" | tar -C /usr/local/bin/ --no-same-owner -xzv pack

EXPOSE 3000

CMD ["pnpm", "start"]