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

# Turbo prune
FROM base AS pruner
RUN pnpm install turbo -g
COPY . .
RUN pnpm turbo prune dokploy --docker

# Etapa de dependencias
FROM base AS installer
RUN apt-get update && apt-get install -y python3 make g++ git && rm -rf /var/lib/apt/lists/*
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml


RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Etapa de construcción
FROM installer AS build

COPY --from=pruner /app/out/full/ .

COPY turbo.json turbo.json

RUN pnpm turbo run build --filter=dokploy... 

# Etapa de producción
FROM base AS production

# Set production
ENV NODE_ENV=production

# Install dependencies only for production
RUN apt-get update && apt-get install -y curl apache2-utils && rm -rf /var/lib/apt/lists/*

# Copiar archivos de construcción y dependencias
COPY --from=build /app/apps/dokploy/.next ./.next
COPY --from=build /app/apps/dokploy/dist ./dist
COPY --from=build /app/apps/dokploy/next.config.mjs ./next.config.mjs
COPY --from=build /app/apps/dokploy/public ./public
COPY --from=build /app/apps/dokploy/package.json ./package.json
COPY --from=build /app/apps/dokploy/drizzle ./drizzle
COPY --from=build /app/apps/dokploy/.env.production ./.env
COPY --from=build /app/apps/dokploy/components.json ./components.json
COPY --from=installer /app/node_modules ./node_modules

# Instalar herramientas adicionales
RUN curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh && rm get-docker.sh
RUN curl -sSL https://nixpacks.com/install.sh -o install.sh && chmod +x install.sh && ./install.sh && pnpm install -g tsx
RUN curl -sSL "https://github.com/buildpacks/pack/releases/download/v0.35.0/pack-v0.35.0-linux.tgz" | tar -C /usr/local/bin/ --no-same-owner -xzv pack

EXPOSE 3000

CMD ["pnpm", "start"]