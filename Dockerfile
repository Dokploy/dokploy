# Etapa 1: Prepare image for building
FROM node:18-slim AS base

# Install dependencies
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && apt-get update && apt-get install -y python3 make g++ git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Disable husky
ENV HUSKY=0
COPY .husky/install.mjs ./.husky/install.mjs

# Copy package.json and pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# Install dependencies only for building
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Copy the rest of the source code
COPY . .

#  Build the application
RUN pnpm run build

# Stage 2: Prepare image for production
FROM node:18-slim AS production

# Disable husky
ENV HUSKY=0

# Install dependencies only for production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && apt-get update && apt-get install -y curl && apt-get install -y apache2-utils && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV production

# Disable husky
ENV HUSKY=0
COPY --from=base /app/.husky/install.mjs ./.husky/install.mjs

#  Copy the rest of the source code
COPY --from=base /app/.next ./.next
COPY --from=base /app/dist ./dist
COPY --from=base /app/next.config.mjs ./next.config.mjs
COPY --from=base /app/public ./public
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/drizzle ./drizzle
COPY --from=base /app/.env.production ./.env
COPY --from=base /app/components.json ./components.json

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
