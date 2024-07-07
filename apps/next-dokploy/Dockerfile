# Etapa 1: Prepare image for building
FROM node:18-slim AS base

# Install dependencies
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && apt-get update && apt-get install -y python3 make g++ git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN npm install turbo --global

COPY . .

RUN turbo prune dokploy --docker

# Copy package.json and pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# Install dependencies only for building
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Copy the rest of the source code

#  Build the application
RUN turbo run build --filter=dokploy

# Stage 2: Prepare image for production
FROM node:18-slim AS production

# Install dependencies only for production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && apt-get update && apt-get install -y curl && apt-get install -y apache2-utils && rm -rf /var/lib/apt/lists/*

WORKDIR /app

#  Copy the rest of the source code
COPY --from=base /app/apps/dokploy/.next ./.next
COPY --from=base /app/apps/dokploy/dist ./dist
COPY --from=base /app/apps/dokploy/next.config.js ./next.config.js
COPY --from=base /app/apps/dokploy/public ./public
COPY --from=base /app/apps/dokploy/package.json ./package.json
COPY --from=base /app/apps/dokploy/drizzle ./drizzle
COPY --from=base /app/apps/dokploy/.env.production ./.env
COPY --from=base /app/apps/dokploy/components.json ./components.json

#  Install dependencies only for production
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

# Install docker
RUN curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh && rm get-docker.sh

# Install Nixpacks and tsx
# | VERBOSE=1 VERSION=1.21.0 bash
RUN curl -sSL https://nixpacks.com/install.sh -o install.sh \
    && chmod +x install.sh \
    && ./install.sh \
    && pnpm install -g tsx


# Install buildpacks
RUN curl -sSL "https://github.com/buildpacks/pack/releases/download/v0.32.1/pack-v0.32.1-linux.tgz" | tar -C /usr/local/bin/ --no-same-owner -xzv pack

# Expose port
EXPOSE 3000

CMD ["pnpm", "start"]