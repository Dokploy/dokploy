


# BUILDER=$(docker buildx create --use)

# docker buildx build --platform linux/amd64,linux/arm64 --pull --rm -t "dokploy/dokploy:feature" -f 'Dockerfile' --push .

docker build --platform linux/amd64 --pull --rm -t "a3180623/dokploy-i18n:feature" -f 'Dockerfile' .

# docker  build --platform linux/amd64 --pull --rm -t "dokploy/dokploy:feature" -f 'Dockerfile' .
