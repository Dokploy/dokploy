# Docker

Here's how to install docker on different operating systems:

## macOS

1. Visit [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop)
2. Download the Docker Desktop installer
3. Double-click the downloaded `.dmg` file
4. Drag Docker to your Applications folder
5. Open Docker Desktop from Applications
6. Follow the onboarding tutorial if desired

## Linux

### Ubuntu

```bash
# Update package index
sudo apt-get update

# Install prerequisites
sudo apt-get install \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Add Docker's official GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Set up stable repository
echo \
  "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io
```

## Windows

1. Enable WSL2 if not already enabled
2. Visit [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop)
3. Download the installer
4. Run the installer and follow the prompts
5. Start Docker Desktop from the Start menu

# Redis

## Installation

### macOS

```bash
brew install redis
```

### Ubuntu

```bash
sudo apt-get update
sudo apt-get install redis-server
```

### Windows

1. Download the Redis Windows Subsystem for Linux (WSL) package
2. Follow WSL installation instructions
3. Install Redis through WSL using Ubuntu instructions

## Start Redis Server

### macOS and Linux

```bash
# Start Redis server
redis-server

# To start Redis in the background
redis-server --daemonize yes

# To stop Redis server
redis-cli shutdown
```

### Using Docker

```bash
# Pull Redis image
docker pull redis

# Run Redis container
docker run --name my-redis -d -p 6379:6379 redis

# Connect to Redis CLI
docker exec -it my-redis redis-cli
```

## Testing Redis Connection

```bash
# Connect to Redis CLI
redis-cli

# Test connection
ping
# Should respond with "PONG"

# Set and get a test value
set test "Hello Redis"
get test
```

## Common Redis Commands

```bash
# Set a key
SET key value

# Get a value
GET key

# Delete a key
DEL key

# Check if key exists
EXISTS key

# Set expiration (in seconds)
EXPIRE key seconds

# List all keys
KEYS *

# Get key type
TYPE key
```
