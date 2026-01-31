#!/usr/bin/env bash
set -euo pipefail

SCRIPT_NAME="dokploy-vps-install"
SCRIPT_VERSION="1.0.0"

OWNER_DEFAULT="destinoantagonista-wq"
TAG_DEFAULT="canary-amd64"
IMAGE_NAME_DEFAULT="dokploy"

POSTGRES_IMAGE_DEFAULT="postgres:16"
REDIS_IMAGE_DEFAULT="redis:7"
TRAEFIK_VERSION_DEFAULT="3.6.7"

BASE_PATH="/etc/dokploy"
TRAEFIK_PATH="${BASE_PATH}/traefik"
DYNAMIC_TRAEFIK_PATH="${TRAEFIK_PATH}/dynamic"
ACME_FILE="${DYNAMIC_TRAEFIK_PATH}/acme.json"
POSTGRES_SECRET_NAME="dokploy_postgres_password"
POSTGRES_SECRET_FILE="${BASE_PATH}/postgres_password"
NETWORK_NAME="dokploy-network"

log() {
  printf "[%s] %s\n" "$SCRIPT_NAME" "$*" >&2
}

die() {
  log "ERROR: $*"
  exit 1
}

usage() {
  cat <<EOF
$SCRIPT_NAME $SCRIPT_VERSION

Instala o Dokploy (stack completa) com Docker Swarm + Postgres + Redis + Traefik + SSL.

Uso:
  sudo bash scripts/install-vps.sh [opções]

Opções:
  --owner <owner>          GitHub owner (default: ${OWNER_DEFAULT})
  --tag <tag>              Tag da imagem (default: ${TAG_DEFAULT})
  --image <full-image>     Imagem completa (override: ghcr.io/<owner>/<image>:<tag>)
  --image-name <name>      Nome da imagem no GHCR (default: ${IMAGE_NAME_DEFAULT})
  --ghcr-user <user>       Usuário GHCR para login
  --ghcr-token <token>     Token GHCR para login (read:packages)
  --public-image           Pula login no GHCR (imagem pública)
  --email <email>          Email do Let's Encrypt (recomendado)
  --traefik-version <ver>  Versão do Traefik (default: ${TRAEFIK_VERSION_DEFAULT})
  --install-docker         Instala Docker automaticamente (Ubuntu/Debian)
  --force-recreate         Recria serviços existentes
  --skip-traefik           Não inicia Traefik
  --skip-redis             Não cria Redis
  --skip-postgres          Não cria Postgres
  --skip-dokploy           Não cria Dokploy
  --advertise-addr <ip>    IP para swarm init (default: auto)
  -h, --help               Ajuda

Exemplos:
  sudo bash scripts/install-vps.sh --owner destinoantagonista-wq --tag canary-amd64 --email seu@email.com
  sudo bash scripts/install-vps.sh --image ghcr.io/destinoantagonista-wq/dokploy:latest --public-image
EOF
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    die "Execute como root: sudo bash scripts/install-vps.sh"
  fi
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || return 1
}

ensure_dependencies() {
  local missing=()
  for cmd in curl openssl; do
    if ! require_cmd "$cmd"; then
      missing+=("$cmd")
    fi
  done

  if [[ "${#missing[@]}" -eq 0 ]]; then
    return
  fi

  if [[ -f /etc/os-release ]]; then
    # shellcheck source=/dev/null
    . /etc/os-release
  else
    die "Dependências ausentes: ${missing[*]}. Instale manualmente."
  fi

  if [[ "${ID:-}" == "ubuntu" || "${ID:-}" == "debian" ]]; then
    log "Instalando dependências: ${missing[*]}..."
    apt-get update -y
    apt-get install -y curl openssl
  else
    die "Dependências ausentes: ${missing[*]}. Instale manualmente."
  fi
}

install_docker_if_needed() {
  if require_cmd docker; then
    log "Docker já instalado."
    return
  fi

  if [[ "${INSTALL_DOCKER}" -ne 1 ]]; then
    die "Docker não encontrado. Reexecute com --install-docker."
  fi

  if [[ -f /etc/os-release ]]; then
    # shellcheck source=/dev/null
    . /etc/os-release
  else
    die "Não foi possível detectar o SO."
  fi

  if [[ "${ID:-}" != "ubuntu" && "${ID:-}" != "debian" ]]; then
    die "Instalação automática suportada apenas em Ubuntu/Debian."
  fi

  log "Instalando Docker via get.docker.com..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  log "Docker instalado."
}

ensure_swarm() {
  if docker info 2>/dev/null | grep -q "Swarm: active"; then
    log "Swarm já está ativo."
    return
  fi

  local addr="${ADVERTISE_ADDR:-}"
  if [[ -z "$addr" ]]; then
    addr="$(curl -4s ifconfig.io || true)"
  fi
  if [[ -z "$addr" ]]; then
    addr="$(hostname -I | awk '{print $1}')"
  fi
  if [[ -z "$addr" ]]; then
    die "Não consegui detectar o IP para swarm. Use --advertise-addr."
  fi

  log "Inicializando Swarm (advertise-addr=${addr})..."
  docker swarm init --advertise-addr "$addr"
}

ensure_network() {
  if docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
    log "Rede ${NETWORK_NAME} já existe."
  else
    log "Criando rede ${NETWORK_NAME}..."
    docker network create --driver overlay --attachable "$NETWORK_NAME"
  fi
}

ensure_secret() {
  mkdir -p "$BASE_PATH"
  if [[ ! -f "$POSTGRES_SECRET_FILE" ]]; then
    log "Gerando senha do Postgres..."
    openssl rand -hex 24 > "$POSTGRES_SECRET_FILE"
    chmod 600 "$POSTGRES_SECRET_FILE"
  fi

  if docker secret inspect "$POSTGRES_SECRET_NAME" >/dev/null 2>&1; then
    log "Secret ${POSTGRES_SECRET_NAME} já existe."
  else
    log "Criando secret ${POSTGRES_SECRET_NAME}..."
    docker secret create "$POSTGRES_SECRET_NAME" "$POSTGRES_SECRET_FILE"
  fi
}

service_exists() {
  local name="$1"
  docker service inspect "$name" >/dev/null 2>&1
}

recreate_or_skip() {
  local name="$1"
  if service_exists "$name"; then
    if [[ "${FORCE_RECREATE}" -eq 1 ]]; then
      log "Removendo serviço existente ${name}..."
      docker service rm "$name"
      sleep 3
      return 0
    fi
    log "Serviço ${name} já existe. Use --force-recreate para recriar."
    return 1
  fi
  return 0
}

create_postgres() {
  if [[ "${SKIP_POSTGRES}" -eq 1 ]]; then
    log "Pulando Postgres (--skip-postgres)."
    return
  fi

  if ! recreate_or_skip "dokploy-postgres"; then
    return
  fi

  log "Criando serviço Postgres..."
  docker service create \
    --name dokploy-postgres \
    --network "$NETWORK_NAME" \
    --constraint 'node.role==manager' \
    --secret source="$POSTGRES_SECRET_NAME",target="$POSTGRES_SECRET_NAME" \
    -e POSTGRES_USER=dokploy \
    -e POSTGRES_DB=dokploy \
    -e POSTGRES_PASSWORD_FILE="/run/secrets/${POSTGRES_SECRET_NAME}" \
    --mount type=volume,source=dokploy-postgres,target=/var/lib/postgresql/data \
    "$POSTGRES_IMAGE"
}

create_redis() {
  if [[ "${SKIP_REDIS}" -eq 1 ]]; then
    log "Pulando Redis (--skip-redis)."
    return
  fi

  if ! recreate_or_skip "dokploy-redis"; then
    return
  fi

  log "Criando serviço Redis..."
  docker service create \
    --name dokploy-redis \
    --network "$NETWORK_NAME" \
    --constraint 'node.role==manager' \
    --mount type=volume,source=dokploy-redis,target=/data \
    "$REDIS_IMAGE"
}

create_dokploy() {
  if [[ "${SKIP_DOKPLOY}" -eq 1 ]]; then
    log "Pulando Dokploy (--skip-dokploy)."
    return
  fi

  if port_in_use 3000; then
    die "Porta 3000 já está em uso. Libere a porta ou altere o mapeamento."
  fi

  if ! recreate_or_skip "dokploy"; then
    return
  fi

  log "Criando serviço Dokploy: ${IMAGE}"
  docker service create \
    --name dokploy \
    --replicas 1 \
    --network "$NETWORK_NAME" \
    --publish 3000:3000 \
    --with-registry-auth \
    -e NODE_ENV=production \
    -e PORT=3000 \
    -e POSTGRES_USER=dokploy \
    -e POSTGRES_DB=dokploy \
    -e POSTGRES_HOST=dokploy-postgres \
    -e POSTGRES_PORT=5432 \
    -e POSTGRES_PASSWORD_FILE="/run/secrets/${POSTGRES_SECRET_NAME}" \
    -e REDIS_HOST=dokploy-redis \
    --secret source="$POSTGRES_SECRET_NAME",target="$POSTGRES_SECRET_NAME" \
    --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
    --mount type=bind,src="$BASE_PATH",dst="$BASE_PATH" \
    "$IMAGE"
}

wait_for_traefik_config() {
  local timeout_sec=120
  local elapsed=0
  while [[ ! -f "${TRAEFIK_PATH}/traefik.yml" && "${elapsed}" -lt "${timeout_sec}" ]]; do
    sleep 2
    elapsed=$((elapsed + 2))
  done
}

write_default_traefik_config() {
  log "Criando traefik.yml padrão..."
  mkdir -p "$TRAEFIK_PATH"
  cat > "${TRAEFIK_PATH}/traefik.yml" <<EOF
global:
  sendAnonymousUsage: false
providers:
  swarm:
    exposedByDefault: false
    watch: true
  docker:
    exposedByDefault: false
    watch: true
    network: ${NETWORK_NAME}
  file:
    directory: /etc/dokploy/traefik/dynamic
    watch: true
entryPoints:
  web:
    address: ":80"
  websecure:
    address: ":443"
    http3:
      advertisedPort: 443
    http:
      tls:
        certResolver: "letsencrypt"
api:
  insecure: true
certificatesResolvers:
  letsencrypt:
    acme:
      email: "test@localhost.com"
      storage: "/etc/dokploy/traefik/dynamic/acme.json"
      httpChallenge:
        entryPoint: "web"
EOF
}

set_acme_email() {
  if [[ -z "${ACME_EMAIL}" ]]; then
    log "Aviso: email do Let's Encrypt não definido. Use --email para SSL válido."
    return
  fi
  if [[ -f "${TRAEFIK_PATH}/traefik.yml" ]]; then
    if grep -q "email:" "${TRAEFIK_PATH}/traefik.yml"; then
      sed -i "s/email: .*/email: \"${ACME_EMAIL}\"/" "${TRAEFIK_PATH}/traefik.yml"
    else
      printf "\n      email: \"%s\"\n" "${ACME_EMAIL}" >> "${TRAEFIK_PATH}/traefik.yml"
    fi
  fi
}

ports_in_use() {
  if require_cmd ss; then
    ss -tulnp | egrep -q ':80|:443'
  else
    return 1
  fi
}

port_in_use() {
  local port="$1"
  if require_cmd ss; then
    ss -tulnp | grep -q ":${port} "
  else
    return 1
  fi
}

start_traefik() {
  if [[ "${SKIP_TRAEFIK}" -eq 1 ]]; then
    log "Pulando Traefik (--skip-traefik)."
    return
  fi

  if ports_in_use && [[ "${FORCE_RECREATE}" -ne 1 ]]; then
    log "Portas 80/443 em uso. Pare o serviço conflitante ou use --force-recreate."
    return
  fi

  mkdir -p "$DYNAMIC_TRAEFIK_PATH"
  if [[ ! -f "$ACME_FILE" ]]; then
    touch "$ACME_FILE"
    chmod 600 "$ACME_FILE"
  fi

  if [[ ! -f "${TRAEFIK_PATH}/traefik.yml" ]]; then
    wait_for_traefik_config
  fi

  if [[ ! -f "${TRAEFIK_PATH}/traefik.yml" ]]; then
    write_default_traefik_config
  fi

  set_acme_email

  if docker ps -a --format '{{.Names}}' | grep -q '^dokploy-traefik$'; then
    log "Recriando container dokploy-traefik..."
    docker rm -f dokploy-traefik >/dev/null 2>&1 || true
  fi

  log "Iniciando Traefik v${TRAEFIK_VERSION}..."
  docker run -d --name dokploy-traefik --restart always \
    --network "$NETWORK_NAME" \
    -v "${TRAEFIK_PATH}/traefik.yml:/etc/traefik/traefik.yml" \
    -v "${DYNAMIC_TRAEFIK_PATH}:/etc/dokploy/traefik/dynamic" \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -p 80:80 -p 443:443 -p 443:443/udp \
    "traefik:v${TRAEFIK_VERSION}"
}

ghcr_login() {
  if [[ "${PUBLIC_IMAGE}" -eq 1 ]]; then
    log "Imagem pública, pulando login GHCR."
    return
  fi

  if [[ -n "${GHCR_TOKEN}" && -z "${GHCR_USER}" ]]; then
    die "Defina --ghcr-user junto com --ghcr-token."
  fi

  if [[ -n "${GHCR_USER}" && -n "${GHCR_TOKEN}" ]]; then
    log "Logando no GHCR..."
    echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USER}" --password-stdin
    return
  fi

  log "Aviso: GHCR token não fornecido. Se a imagem for privada, o pull vai falhar."
}

summary() {
  cat <<EOF

✅ Instalação concluída.

Serviços:
  - dokploy-postgres
  - dokploy-redis
  - dokploy
  - dokploy-traefik (se não foi pulado)

Acesso inicial:
  http://SEU_IP:3000

Próximos passos:
  1) Acesse o painel, crie o admin.
  2) Configure seu domínio no Dokploy.
  3) Aponte o DNS para o IP da VPS.
EOF
}

OWNER="${OWNER_DEFAULT}"
TAG="${TAG_DEFAULT}"
IMAGE_NAME="${IMAGE_NAME_DEFAULT}"
IMAGE=""
ACME_EMAIL=""
TRAEFIK_VERSION="${TRAEFIK_VERSION_DEFAULT}"
INSTALL_DOCKER=0
FORCE_RECREATE=0
SKIP_TRAEFIK=0
SKIP_REDIS=0
SKIP_POSTGRES=0
SKIP_DOKPLOY=0
PUBLIC_IMAGE=0
GHCR_USER=""
GHCR_TOKEN=""
ADVERTISE_ADDR=""
POSTGRES_IMAGE="${POSTGRES_IMAGE_DEFAULT}"
REDIS_IMAGE="${REDIS_IMAGE_DEFAULT}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --owner) OWNER="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    --image-name) IMAGE_NAME="$2"; shift 2 ;;
    --image) IMAGE="$2"; shift 2 ;;
    --email) ACME_EMAIL="$2"; shift 2 ;;
    --traefik-version) TRAEFIK_VERSION="$2"; shift 2 ;;
    --install-docker) INSTALL_DOCKER=1; shift ;;
    --force-recreate) FORCE_RECREATE=1; shift ;;
    --skip-traefik) SKIP_TRAEFIK=1; shift ;;
    --skip-redis) SKIP_REDIS=1; shift ;;
    --skip-postgres) SKIP_POSTGRES=1; shift ;;
    --skip-dokploy) SKIP_DOKPLOY=1; shift ;;
    --public-image) PUBLIC_IMAGE=1; shift ;;
    --ghcr-user) GHCR_USER="$2"; shift 2 ;;
    --ghcr-token) GHCR_TOKEN="$2"; shift 2 ;;
    --advertise-addr) ADVERTISE_ADDR="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Opção inválida: $1 (use --help)" ;;
  esac
done

if [[ -z "$IMAGE" ]]; then
  IMAGE="ghcr.io/${OWNER}/${IMAGE_NAME}:${TAG}"
fi

require_root
ensure_dependencies
install_docker_if_needed
ghcr_login
ensure_swarm
ensure_network
ensure_secret
create_postgres
create_redis
create_dokploy
start_traefik
summary
