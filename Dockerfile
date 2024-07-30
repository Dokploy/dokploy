FROM node:18-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
COPY . /usr/src/app
WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y python3 make g++ git && rm -rf /var/lib/apt/lists/*

# Install dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Deploy only the dokploy app

ENV NODE_ENV=production
RUN pnpm --filter=./apps/dokploy run build
RUN pnpm --filter=./apps/dokploy --prod deploy /prod/dokploy

RUN cp -R /usr/src/app/apps/dokploy/.next /prod/dokploy/.next
RUN cp -R /usr/src/app/apps/dokploy/dist /prod/dokploy/dist

FROM base AS dokploy
WORKDIR /app

# Set production
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y curl apache2-utils && rm -rf /var/lib/apt/lists/*

# Copy only the necessary files
COPY --from=build /prod/dokploy/.next ./.next
COPY --from=build /prod/dokploy/dist ./dist
COPY --from=build /prod/dokploy/next.config.mjs ./next.config.mjs
COPY --from=build /prod/dokploy/public ./public
COPY --from=build /prod/dokploy/package.json ./package.json
COPY --from=build /prod/dokploy/drizzle ./drizzle
COPY .env.production ./.env
COPY --from=build /prod/dokploy/components.json ./components.json
COPY --from=build /prod/dokploy/node_modules ./node_modules


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

EXPOSE 3000
CMD [ "pnpm", "start" ]
