# syntax=docker/dockerfile:1
FROM node:24.14.1-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN corepack prepare pnpm@10.22.0 --activate

FROM base AS build
COPY . /usr/src/app
WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y python3 make g++ git python3-pip pkg-config libsecret-1-dev && rm -rf /var/lib/apt/lists/*

# Install dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Deploy only the dokploy app

ENV NODE_ENV=production
RUN pnpm --filter=@dokploy/server build
RUN pnpm --filter=./apps/dokploy run build

RUN pnpm --filter=./apps/dokploy --prod deploy --legacy /prod/dokploy

RUN cp -R /usr/src/app/apps/dokploy/.next /prod/dokploy/.next
RUN cp -R /usr/src/app/apps/dokploy/dist /prod/dokploy/dist

# Runtime does not need pnpm, Corepack, or npm; start from the clean Node image
# instead of the package-manager-enabled build base.
FROM node:24.14.1-slim AS dokploy
WORKDIR /app

ARG RELEASE_TAG=latest
ARG VCS_REF=unknown

# Set production and expose candidate identity at runtime.
ENV NODE_ENV=production \
  RELEASE_TAG=${RELEASE_TAG}

LABEL org.opencontainers.image.source="https://github.com/budivoogt/dokploy" \
  org.opencontainers.image.version="${RELEASE_TAG}" \
  org.opencontainers.image.revision="${VCS_REF}"

RUN apt-get update && apt-get upgrade -y && apt-get install -y curl unzip zip apache2-utils iproute2 rsync git-lfs && git lfs install && rm -rf /var/lib/apt/lists/*

# Copy only the necessary files
COPY --from=build /prod/dokploy/.next ./.next
COPY --from=build /prod/dokploy/dist ./dist
COPY --from=build /prod/dokploy/next.config.mjs ./next.config.mjs
COPY --from=build /prod/dokploy/public ./public
COPY --from=build /prod/dokploy/package.json ./package.json
COPY --from=build /prod/dokploy/drizzle ./drizzle
COPY --from=build /prod/dokploy/components.json ./components.json
COPY --from=build /prod/dokploy/node_modules ./node_modules


# Install docker
RUN curl -fsSL https://get.docker.com -o get-docker.sh \
    && sh get-docker.sh --version 29.7.2 \
    && apt-mark manual docker-ce-cli docker-buildx-plugin docker-compose-plugin \
    && apt-get purge -y docker-ce docker-ce-rootless-extras containerd.io docker-model-plugin \
    && apt-get autoremove -y \
    && rm -rf get-docker.sh /var/lib/apt/lists/* \
    && curl https://rclone.org/install.sh | bash

# Install Nixpacks
# | VERBOSE=1 VERSION=1.21.0 bash

ARG NIXPACKS_VERSION=1.41.0
RUN curl -sSL https://nixpacks.com/install.sh -o install.sh \
    && chmod +x install.sh \
    && ./install.sh \
    && rm install.sh

# Install Railpack
ARG RAILPACK_VERSION=0.35.0
RUN curl -sSL https://railpack.com/install.sh | bash

# Install buildpacks
COPY --from=buildpacksio/pack:0.40.9 /usr/local/bin/pack /usr/local/bin/pack

# The process starts with node directly. Remove package-manager tooling and caches
# from the runtime image so build-only dependencies cannot become scan findings.
RUN rm -rf /root/.cache/node /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD curl -fs http://localhost:3000/api/trpc/settings.health || exit 1

# Ejecutar node directamente: pnpm como wrapper queda residente (~100MB RSS)
  CMD ["sh", "-c", "node -r dotenv/config dist/wait-for-postgres.mjs && node -r dotenv/config dist/migration.mjs && exec node -r dotenv/config dist/server.mjs"]
