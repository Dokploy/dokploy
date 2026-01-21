FROM node:20.16.0-alpine

# Install git, Python, build tools and other dependencies needed for native modules
RUN apk add --no-cache \
    git \
    python3 \
    py3-pip \
    make \
    g++ \
    libc6-compat \
    openssl-dev

# Create symlink for python (some tools expect 'python' command)
RUN ln -sf python3 /usr/bin/python

# Install pnpm
RUN npm install -g pnpm@9.12.0

# Install Biome
RUN npm install -g @biomejs/biome@2.1.1

# Set working directory
WORKDIR /workspace

COPY . .

RUN pnpm install

CMD ["tail", "-f", "/dev/null"]