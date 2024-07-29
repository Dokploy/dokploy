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

# Build only the dokploy app
RUN pnpm --filter=dokploy run build

# Deploy only the dokploy app
RUN pnpm --filter=dokploy --prod deploy /prod/dokploy

FROM base AS dokploy
COPY --from=build /prod/dokploy /app
WORKDIR /app
EXPOSE 3000
CMD [ "pnpm", "start" ]