# Start with the base image
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

# Install dependencies for the base image
RUN apt-get update && apt-get install -y python3 make g++ git curl apache2-utils && rm -rf /var/lib/apt/lists/*

# Copy the entire workspace
COPY . .

# Install dependencies for the entire workspace
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Build the dokploy app
RUN pnpm dokploy:build

# Production stage
FROM node:18-slim AS production

# Set production environment
ENV NODE_ENV=production

# Set workdir
WORKDIR /app

# Copy necessary files from the build stage
COPY --from=base /app/apps/dokploy/.next ./apps/dokploy/.next
COPY --from=base /app/apps/dokploy/dist ./apps/dokploy/dist
COPY --from=base /app/apps/dokploy/next.config.mjs ./apps/dokploy/next.config.mjs
COPY --from=base /app/apps/dokploy/public ./apps/dokploy/public
COPY --from=base /app/apps/dokploy/package.json ./apps/dokploy/package.json
COPY --from=base /app/apps/dokploy/drizzle ./apps/dokploy/drizzle
COPY --from=base /app/apps/dokploy/.env.production ./apps/dokploy/.env
COPY --from=base /app/apps/dokploy/components.json ./apps/dokploy/components.json
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Install docker
RUN curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh && rm get-docker.sh

# Install Nixpacks
RUN curl -sSL https://nixpacks.com/install.sh | bash

# Install tsx
RUN npm install -g tsx

# Install buildpacks
RUN curl -sSL "https://github.com/buildpacks/pack/releases/download/v0.35.0/pack-v0.35.0-linux.tgz" | tar -C /usr/local/bin/ --no-same-owner -xzv pack

# Expose port
EXPOSE 3000

# Set the working directory to the dokploy app
WORKDIR /app/apps/dokploy

# Start the application
CMD ["pnpm", "start"]