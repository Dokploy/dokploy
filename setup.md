# Setup

1. Install: export DOKPLOY_VERSION=v0.26.6 && curl -sSL https://raw.githubusercontent.com/shuvoooo/dokploy/refs/heads/shuvos_modify/setup.sh | sh
2. Update: export DOKPLOY_VERSION=v0.26.6 && curl -sSL https://raw.githubusercontent.com/shuvoooo/dokploy/refs/heads/shuvos_modify/setup.sh | sh -s update
3. docker service update --publish-rm "published=3000,target=3000,mode=host" dokploy