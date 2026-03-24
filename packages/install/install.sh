#!/bin/bash

# DeployBox — установочный скрипт
# Форк Dokploy с русским UI, Aeza provisioning, ЮKassa биллингом
#
# Использование:
#   curl -sSL https://deploybox.ru/install.sh | sh
#   DEPLOYBOX_VERSION=v0.1.0 curl -sSL https://deploybox.ru/install.sh | sh

# ── Настройки образа ──────────────────────────────────────────────────────────
# Замени YOUR_GITHUB_USERNAME на свой username/org в GitHub
GITHUB_OWNER="YOUR_GITHUB_USERNAME"
IMAGE_NAME="ghcr.io/${GITHUB_OWNER}/deploybox"
GITHUB_REPO="${GITHUB_OWNER}/deploybox"
# ─────────────────────────────────────────────────────────────────────────────

# Цвета
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
BLUE="\033[0;34m"
RED="\033[0;31m"
NC="\033[0m"

detect_version() {
    local version="${DEPLOYBOX_VERSION}"

    if [ -z "$version" ]; then
        echo "Определяем последнюю версию DeployBox..." >&2

        version=$(curl -fsSL -o /dev/null -w '%{url_effective}\n' \
            "https://github.com/${GITHUB_REPO}/releases/latest" 2>/dev/null | \
            sed 's#.*/tag/##')

        if [ -z "$version" ]; then
            echo "Предупреждение: не удалось определить версию, используем latest" >&2
            version="latest"
        else
            echo "Найдена версия: $version" >&2
        fi
    fi

    echo "$version"
}

is_proxmox_lxc() {
    if [ -n "$container" ] && [ "$container" = "lxc" ]; then
        return 0
    fi
    if grep -q "container=lxc" /proc/1/environ 2>/dev/null; then
        return 0
    fi
    return 1
}

generate_random_password() {
    local password=""

    if command -v openssl >/dev/null 2>&1; then
        password=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
    elif [ -r /dev/urandom ]; then
        password=$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32)
    else
        if command -v sha256sum >/dev/null 2>&1; then
            password=$(date +%s%N | sha256sum | base64 | head -c 32)
        else
            password=$(echo "$(date +%s%N)-$(hostname)-$$-$RANDOM" | base64 | tr -d "=+/" | head -c 32)
        fi
    fi

    if [ -z "$password" ] || [ ${#password} -lt 20 ]; then
        echo "Ошибка: не удалось сгенерировать пароль" >&2
        exit 1
    fi

    echo "$password"
}

install_deploybox() {
    VERSION_TAG=$(detect_version)
    DOCKER_IMAGE="${IMAGE_NAME}:${VERSION_TAG}"

    printf "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
    printf "${GREEN}  DeployBox — установка версии ${VERSION_TAG}${NC}\n"
    printf "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n\n"

    if [ "$(id -u)" != "0" ]; then
        printf "${RED}Ошибка: скрипт должен запускаться от root${NC}\n" >&2
        exit 1
    fi

    if [ "$(uname)" = "Darwin" ]; then
        printf "${RED}Ошибка: скрипт предназначен только для Linux${NC}\n" >&2
        exit 1
    fi

    if [ -f /.dockerenv ]; then
        printf "${RED}Ошибка: не запускайте внутри Docker-контейнера${NC}\n" >&2
        exit 1
    fi

    for port in 80 443 3000; do
        if ss -tulnp | grep ":${port} " >/dev/null; then
            printf "${RED}Ошибка: порт ${port} уже занят${NC}\n" >&2
            exit 1
        fi
    done

    command_exists() {
        command -v "$@" > /dev/null 2>&1
    }

    echo "Проверка Docker..."
    if command_exists docker; then
        echo "Docker уже установлен"
    else
        echo "Устанавливаем Docker..."
        curl -sSL https://get.docker.com | sh -s -- --version 28.5.0
    fi

    endpoint_mode=""
    if is_proxmox_lxc; then
        printf "${YELLOW}⚠ Обнаружен Proxmox LXC — добавляем --endpoint-mode dnsrr${NC}\n"
        endpoint_mode="--endpoint-mode dnsrr"
        sleep 5
    fi

    docker swarm leave --force 2>/dev/null

    get_ip() {
        local ip=""
        ip=$(curl -4s --connect-timeout 5 https://ifconfig.io 2>/dev/null)
        [ -z "$ip" ] && ip=$(curl -4s --connect-timeout 5 https://icanhazip.com 2>/dev/null)
        [ -z "$ip" ] && ip=$(curl -4s --connect-timeout 5 https://ipecho.net/plain 2>/dev/null)
        [ -z "$ip" ] && ip=$(curl -6s --connect-timeout 5 https://ifconfig.io 2>/dev/null)
        [ -z "$ip" ] && ip=$(curl -6s --connect-timeout 5 https://icanhazip.com 2>/dev/null)

        if [ -z "$ip" ]; then
            printf "${RED}Ошибка: не удалось определить IP сервера${NC}\n" >&2
            echo "Укажи вручную: export ADVERTISE_ADDR=<твой-ip>" >&2
            exit 1
        fi
        echo "$ip"
    }

    get_private_ip() {
        ip addr show | grep -E "inet (192\.168\.|10\.|172\.1[6-9]\.|172\.2[0-9]\.|172\.3[0-1]\.)" | head -n1 | awk '{print $2}' | cut -d/ -f1
    }

    advertise_addr="${ADVERTISE_ADDR:-$(get_private_ip)}"

    if [ -z "$advertise_addr" ]; then
        printf "${RED}Ошибка: не найден приватный IP-адрес${NC}\n"
        echo "Укажи вручную: export ADVERTISE_ADDR=192.168.1.100"
        exit 1
    fi

    echo "Используем адрес: $advertise_addr"

    swarm_init_args="${DOCKER_SWARM_INIT_ARGS:-}"

    if [ -n "$swarm_init_args" ]; then
        docker swarm init --advertise-addr $advertise_addr $swarm_init_args
    else
        docker swarm init --advertise-addr $advertise_addr
    fi

    if [ $? -ne 0 ]; then
        printf "${RED}Ошибка: не удалось инициализировать Docker Swarm${NC}\n" >&2
        exit 1
    fi

    echo "Docker Swarm инициализирован"

    docker network rm -f dokploy-network 2>/dev/null
    docker network create --driver overlay --attachable dokploy-network
    echo "Сеть создана"

    mkdir -p /etc/dokploy
    chmod 777 /etc/dokploy

    POSTGRES_PASSWORD=$(generate_random_password)
    echo "$POSTGRES_PASSWORD" | docker secret create dokploy_postgres_password - 2>/dev/null || true
    echo "Пароль БД сгенерирован и сохранён в Docker Secrets"

    echo "Запускаем PostgreSQL..."
    docker service create \
        --name dokploy-postgres \
        --constraint 'node.role==manager' \
        --network dokploy-network \
        --env POSTGRES_USER=dokploy \
        --env POSTGRES_DB=dokploy \
        --secret source=dokploy_postgres_password,target=/run/secrets/postgres_password \
        --env POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password \
        --mount type=volume,source=dokploy-postgres,target=/var/lib/postgresql/data \
        $endpoint_mode \
        postgres:16

    echo "Запускаем Redis..."
    docker service create \
        --name dokploy-redis \
        --constraint 'node.role==manager' \
        --network dokploy-network \
        --mount type=volume,source=dokploy-redis,target=/data \
        $endpoint_mode \
        redis:7

    echo "Устанавливаем DeployBox..."

    # Для ghcr.io нужна авторизация (публичный пакет — авторизация не нужна)
    # Если образ приватный — раскомментируй:
    # echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GITHUB_OWNER}" --password-stdin

    release_tag_env=""
    if [[ "$VERSION_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+ ]]; then
        release_tag_env="-e RELEASE_TAG=latest"
    elif [ "$VERSION_TAG" != "latest" ]; then
        release_tag_env="-e RELEASE_TAG=$VERSION_TAG"
    fi

    docker service create \
        --name dokploy \
        --replicas 1 \
        --network dokploy-network \
        --mount type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock \
        --mount type=bind,source=/etc/dokploy,target=/etc/dokploy \
        --mount type=volume,source=dokploy,target=/root/.docker \
        --secret source=dokploy_postgres_password,target=/run/secrets/postgres_password \
        --publish published=3000,target=3000,mode=host \
        --update-parallelism 1 \
        --update-order stop-first \
        --constraint 'node.role == manager' \
        $endpoint_mode \
        $release_tag_env \
        -e ADVERTISE_ADDR=$advertise_addr \
        -e POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password \
        $DOCKER_IMAGE

    sleep 4

    echo "Запускаем Traefik..."
    docker run -d \
        --name dokploy-traefik \
        --restart always \
        -v /etc/dokploy/traefik/traefik.yml:/etc/traefik/traefik.yml \
        -v /etc/dokploy/traefik/dynamic:/etc/dokploy/traefik/dynamic \
        -v /var/run/docker.sock:/var/run/docker.sock:ro \
        -p 80:80/tcp \
        -p 443:443/tcp \
        -p 443:443/udp \
        traefik:v3.6.7

    docker network connect dokploy-network dokploy-traefik

    format_ip_for_url() {
        local ip="$1"
        if echo "$ip" | grep -q ':'; then
            echo "[${ip}]"
        else
            echo "${ip}"
        fi
    }

    public_ip="${ADVERTISE_ADDR:-$(get_ip)}"
    formatted_addr=$(format_ip_for_url "$public_ip")

    printf "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
    printf "${GREEN}  DeployBox успешно установлен!${NC}\n"
    printf "${BLUE}  Подожди 15 секунд пока сервер запустится${NC}\n"
    printf "${YELLOW}  Открой: http://${formatted_addr}:3000${NC}\n"
    printf "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n\n"
}

update_deploybox() {
    VERSION_TAG=$(detect_version)
    DOCKER_IMAGE="${IMAGE_NAME}:${VERSION_TAG}"

    echo "Обновляем DeployBox до версии: ${VERSION_TAG}"

    docker pull $DOCKER_IMAGE
    docker service update --image $DOCKER_IMAGE dokploy

    printf "${GREEN}DeployBox обновлён до версии: ${VERSION_TAG}${NC}\n"
}

case "$1" in
    update)
        update_deploybox
        ;;
    *)
        install_deploybox
        ;;
esac
