#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
source "$ROOT/lib.sh"

SANDBOX=$(validate_sandbox_name "${CTD3513_SANDBOX:-ctd3513-encryption}")
PORT=${CTD3513_PORT:-35130}
CURRENT_IMAGE=${CTD3513_CURRENT_IMAGE:-dokploy-ctd:v0.29.8-ctd3f3a559-local}
DEFAULT_CURRENT_IMAGE_ID=sha256:1c254fbe41054892cc7e64d14f0ccc97d4726670fe38020dbb2728ef6972063c
CURRENT_IMAGE_ID=${CTD3513_CURRENT_IMAGE_ID:-$DEFAULT_CURRENT_IMAGE_ID}
CANDIDATE_IMAGE=${CTD3513_CANDIDATE_IMAGE:-dokploy-ctd:v0.29.14-ctdd403b82-local}
DEFAULT_CANDIDATE_DIGEST=sha256:ae95f0d7e821fca4fb5f84eb1e5eb0bd61cdaddb4207dba1dcd0e4268b3c74c9
CANDIDATE_DIGEST=${CTD3513_CANDIDATE_DIGEST:-$DEFAULT_CANDIDATE_DIGEST}
STATE_DIR="$ROOT/.state/$SANDBOX"
EVIDENCE="$STATE_DIR/evidence.jsonl"
COOKIE="$STATE_DIR/cookies.txt"
API="http://127.0.0.1:$PORT"
EMAIL=${CTD3513_EMAIL:-ctd3513@example.invalid}

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"
touch "$EVIDENCE"
chmod 600 "$EVIDENCE"

if [[ -s "$STATE_DIR/marker" ]]; then
  MARKER=$(<"$STATE_DIR/marker")
else
  MARKER=${CTD3513_MARKER:-"CTD3513_SYNTHETIC_$(openssl rand -hex 12)"}
  printf '%s' "$MARKER" >"$STATE_DIR/marker"
  chmod 600 "$STATE_DIR/marker"
fi
if [[ -s "$STATE_DIR/operator-password" ]]; then
  PASSWORD=$(<"$STATE_DIR/operator-password")
else
  PASSWORD=${CTD3513_PASSWORD:-"Synthetic-$(openssl rand -hex 12)!"}
  printf '%s' "$PASSWORD" >"$STATE_DIR/operator-password"
  chmod 600 "$STATE_DIR/operator-password"
fi

need() { command -v "$1" >/dev/null || { printf 'missing dependency: %s\n' "$1" >&2; exit 1; }; }
for command in docker curl jq openssl shasum; do need "$command"; done

record() {
  local phase=$1 status=$2
  jq -cn --arg phase "$phase" --arg status "$status" --arg at "$(date -u +%FT%TZ)" \
    '{phase:$phase,status:$status,at:$at}' >>"$EVIDENCE"
}

secret_value() {
  local file=$1
  if [[ ! -s "$file" ]]; then
    openssl rand -hex 32 >"$file"
    chmod 600 "$file"
  fi
}

create_nested_secret() {
  local name=$1 file=$2
  if ! nested_docker "$SANDBOX" secret inspect "$name" >/dev/null 2>&1; then
    docker exec -i "$SANDBOX" docker secret create "$name" - <"$file" >/dev/null
  fi
}

load_host_image() {
  local image=$1
  docker image inspect "$image" >/dev/null 2>&1 || {
    printf 'required local image is missing: %s\n' "$image" >&2
    return 1
  }
  docker save "$image" | docker exec -i "$SANDBOX" docker load >/dev/null
}

validated_current_image_id() {
  docker image inspect "$CURRENT_IMAGE" >/dev/null 2>&1 || {
    printf 'build or load the exact current image locally as %s before continuing\n' "$CURRENT_IMAGE" >&2
    return 1
  }
  if [[ -n "${CTD3513_CURRENT_IMAGE:-}" && -z "${CTD3513_CURRENT_IMAGE_ID:-}" ]]; then
    printf 'CTD3513_CURRENT_IMAGE overrides require CTD3513_CURRENT_IMAGE_ID\n' >&2
    return 1
  fi
  local actual
  actual=$(docker image inspect "$CURRENT_IMAGE" --format '{{.Id}}')
  validate_image_id "$CURRENT_IMAGE_ID" "$actual" || {
    printf 'current image does not match pinned image ID %s\n' "$CURRENT_IMAGE_ID" >&2
    return 1
  }
  printf '%s\n' "$actual"
}

validated_candidate_image_id() {
  docker image inspect "$CANDIDATE_IMAGE" >/dev/null 2>&1 || {
    printf 'load the pinned candidate locally as %s before continuing\n' "$CANDIDATE_IMAGE" >&2
    return 1
  }
  if [[ -n "${CTD3513_CANDIDATE_IMAGE:-}" && -z "${CTD3513_CANDIDATE_DIGEST:-}" ]]; then
    printf 'CTD3513_CANDIDATE_IMAGE overrides require CTD3513_CANDIDATE_DIGEST\n' >&2
    return 1
  fi
  local repo_digests
  repo_digests=$(docker image inspect "$CANDIDATE_IMAGE" --format '{{join .RepoDigests "\n"}}')
  validate_candidate_digest "$CANDIDATE_DIGEST" "$repo_digests" || {
    printf 'candidate image does not match pinned digest %s\n' "$CANDIDATE_DIGEST" >&2
    return 1
  }
  docker image inspect "$CANDIDATE_IMAGE" --format '{{.Id}}'
}

wait_service() {
  local service=$1
  wait_for "$service" 90 2 bash -c \
    '[[ "$(docker exec "$1" docker service ps "$2" --filter desired-state=running --format "{{.CurrentState}}" 2>/dev/null | grep -c "^Running ")" == "1" ]]' \
    _ "$SANDBOX" "$service"
}

wait_api() {
  wait_for "Dokploy API on $API" 120 2 \
    curl --connect-timeout 2 --max-time 5 -fsS "$API/api/health"
}

trpc_mutation() {
  local procedure=$1 input=$2
  curl --max-time 30 -fsS -b "$COOKIE" -c "$COOKIE" -H 'content-type: application/json' \
    -H "origin: $API" --data "$(jq -cn --argjson input "$input" '{json:$input}')" \
    "$API/api/trpc/$procedure" | jq -cer '.result.data.json'
}

trpc_query() {
  local procedure=$1 input=$2 encoded
  encoded=$(jq -cn --argjson input "$input" '{json:$input}' | jq -sRr @uri)
  curl --max-time 30 -fsS -b "$COOKIE" -c "$COOKIE" -H "origin: $API" \
    "$API/api/trpc/$procedure?input=$encoded" | jq -cer '.result.data.json'
}

login() {
  : >"$COOKIE"
  curl --max-time 30 -fsS -b "$COOKIE" -c "$COOKIE" -H 'content-type: application/json' \
    -H "origin: $API" \
    --data "$(jq -cn --arg email "$EMAIL" --arg password "$PASSWORD" '{email:$email,password:$password}')" \
    "$API/api/auth/sign-in/email" >/dev/null
}

app_read_env() {
  trpc_query application.one "$(jq -cn --arg id "$APPLICATION_ID" '{applicationId:$id}')" | jq -r '.env'
}

raw_db_env() {
  local postgres_service=${1:-dokploy-postgres} app_id=${2:-$APPLICATION_ID}
  local cid
  cid=$(nested_docker "$SANDBOX" ps -q --filter "label=com.docker.swarm.service.name=$postgres_service" | head -n1)
  nested_docker "$SANDBOX" exec -e PGPASSWORD_FILE=/run/secrets/postgres-password "$cid" \
    sh -ceu 'export PGPASSWORD=$(cat "$PGPASSWORD_FILE"); psql -At -U dokploy -d dokploy -c "select env from application where \"applicationId\" = '\''$1'\'';"' sh "$app_id"
}

assert_marker_read() {
  local phase=$1 value
  value=$(app_read_env)
  [[ "$(marker_hash "$value")" == "$(marker_hash "$MARKER")" ]] || {
    printf '%s did not return the synthetic marker\n' "$phase" >&2
    return 1
  }
  evidence_json "$phase" "$value" >>"$EVIDENCE"
}

assert_ciphertext_read() {
  local phase=$1 value
  value=$(app_read_env)
  ciphertext_prefix "$value" >/dev/null
  jq -cn --arg phase "$phase" --arg prefix "$(ciphertext_prefix "$value")" \
    --argjson length "$(marker_length "$value")" '{phase:$phase,prefix:$prefix,length:$length}' >>"$EVIDENCE"
}

prepare() {
  if docker container inspect "$SANDBOX" >/dev/null 2>&1; then
    printf 'sandbox %s already exists; refusing to replace it\n' "$SANDBOX" >&2
    exit 1
  fi
  if [[ -s "$EVIDENCE" ]]; then
    mv "$EVIDENCE" "$STATE_DIR/evidence.previous.$(date -u +%Y%m%dT%H%M%SZ).$$.jsonl"
  fi
  : >"$EVIDENCE"
  chmod 600 "$EVIDENCE"
  local host_current_id nested_current_id revision
  host_current_id=$(validated_current_image_id)
  validated_candidate_image_id >/dev/null
  revision=$(docker image inspect "$CANDIDATE_IMAGE" \
    --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
  jq -cn --arg phase current-image --arg imageId "$host_current_id" \
    '{phase:$phase,imageId:$imageId}' >>"$EVIDENCE"
  jq -cn --arg phase candidate-image --arg digest "$CANDIDATE_DIGEST" --arg revision "$revision" \
    '{phase:$phase,digest:$digest,revision:$revision}' >>"$EVIDENCE"

  secret_value "$STATE_DIR/postgres-password"
  secret_value "$STATE_DIR/auth-v1"
  secret_value "$STATE_DIR/auth-v2"
  secret_value "$STATE_DIR/encryption-v1"
  secret_value "$STATE_DIR/encryption-wrong"
  secret_value "$STATE_DIR/encryption-restore-target"
  docker run -d --privileged --name "$SANDBOX" \
    -e DOCKER_TLS_CERTDIR= -p "127.0.0.1:$PORT:3000" \
    -v "$SANDBOX-docker:/var/lib/docker" docker:29-dind \
    --host=unix:///var/run/docker.sock --tls=false >/dev/null
  wait_for "nested Docker daemon" 60 1 nested_docker "$SANDBOX" info
  nested_docker "$SANDBOX" swarm init --advertise-addr 127.0.0.1 >/dev/null
  nested_docker "$SANDBOX" network create --driver overlay --attachable ctd3513 >/dev/null
  # Keep peak disk use bounded. The candidate is streamed only after the
  # pre-upgrade backup exists and the current nested image is retired.
  load_host_image "$CURRENT_IMAGE"
  nested_current_id=$(nested_docker "$SANDBOX" image inspect "$CURRENT_IMAGE" --format '{{.Id}}')
  [[ "$nested_current_id" == "$host_current_id" ]] || {
    printf 'nested current image ID does not match the pinned host image\n' >&2
    exit 1
  }

  create_nested_secret ctd3513-postgres-password "$STATE_DIR/postgres-password"
  create_nested_secret ctd3513-auth-v1 "$STATE_DIR/auth-v1"

  nested_docker "$SANDBOX" service create --quiet --name dokploy-postgres --network ctd3513 \
    --secret source=ctd3513-postgres-password,target=postgres-password \
    --env POSTGRES_USER=dokploy --env POSTGRES_DB=dokploy \
    --env POSTGRES_PASSWORD_FILE=/run/secrets/postgres-password \
    --mount source=ctd3513-postgres,target=/var/lib/postgresql/data postgres:16-alpine >/dev/null
  nested_docker "$SANDBOX" service create --quiet --name dokploy-redis --network ctd3513 \
    --mount source=ctd3513-redis,target=/data redis:7-alpine redis-server --appendonly yes >/dev/null
  wait_service dokploy-postgres
  wait_service dokploy-redis

  nested_docker "$SANDBOX" service create --quiet --no-resolve-image --name dokploy --network ctd3513 --publish published=3000,target=3000 \
    --secret source=ctd3513-postgres-password,target=postgres-password \
    --secret source=ctd3513-auth-v1,target=auth-secret \
    --env NODE_ENV=production --env POSTGRES_PASSWORD_FILE=/run/secrets/postgres-password \
    --env BETTER_AUTH_SECRET_FILE=/run/secrets/auth-secret \
    --mount type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock \
    --mount source=ctd3513-dokploy,target=/etc/dokploy "$CURRENT_IMAGE" >/dev/null
  wait_service dokploy
  wait_api
  record prepare pass
}

seed_plaintext() {
  curl --max-time 30 -fsS -b "$COOKIE" -c "$COOKIE" -H 'content-type: application/json' \
    -H "origin: $API" \
    --data "$(jq -cn --arg email "$EMAIL" --arg password "$PASSWORD" \
      '{email:$email,password:$password,name:"Synthetic",lastName:"Operator"}')" \
    "$API/api/auth/sign-up/email" >/dev/null
  login

  local project
  project=$(trpc_mutation project.create '{"name":"ctd3513-synthetic","description":"synthetic rollback harness"}')
  PROJECT_ID=$(jq -r '.project.projectId' <<<"$project")
  ENVIRONMENT_ID=$(jq -r '.environment.environmentId' <<<"$project")
  local application
  application=$(trpc_mutation application.create "$(jq -cn --arg env "$ENVIRONMENT_ID" \
    '{name:"Synthetic application",appName:"ctd3513-synthetic",description:"synthetic",environmentId:$env}')")
  APPLICATION_ID=$(jq -r '.applicationId' <<<"$application")
  trpc_mutation application.saveEnvironment "$(jq -cn --arg id "$APPLICATION_ID" --arg marker "$MARKER" \
    '{applicationId:$id,env:$marker,buildArgs:"",buildSecrets:"",createEnvFile:true}')" >/dev/null

  local raw
  raw=$(raw_db_env)
  [[ "$(marker_hash "$raw")" == "$(marker_hash "$MARKER")" ]]
  evidence_json current-plaintext "$raw" >>"$EVIDENCE"
  printf '%s\n' "$PROJECT_ID" >"$STATE_DIR/project-id"
  printf '%s\n' "$ENVIRONMENT_ID" >"$STATE_DIR/environment-id"
  printf '%s\n' "$APPLICATION_ID" >"$STATE_DIR/application-id"

  local pg
  pg=$(nested_docker "$SANDBOX" ps -q --filter label=com.docker.swarm.service.name=dokploy-postgres | head -n1)
  nested_docker "$SANDBOX" exec -e PGPASSWORD_FILE=/run/secrets/postgres-password "$pg" sh -ceu \
    'export PGPASSWORD=$(cat "$PGPASSWORD_FILE"); pg_dump -Fc -U dokploy -d dokploy -f /tmp/preupgrade.dump'
  nested_docker "$SANDBOX" cp "$pg:/tmp/preupgrade.dump" /ctd3513-preupgrade.dump
  nested_docker "$SANDBOX" run --rm -v ctd3513-dokploy:/source:ro -v /:/outer alpine \
    sh -ceu 'tar -C /source -czf /outer/ctd3513-preupgrade-filesystem.tgz .'
  record seed-plaintext pass
}

load_ids() {
  PROJECT_ID=$(<"$STATE_DIR/project-id")
  ENVIRONMENT_ID=$(<"$STATE_DIR/environment-id")
  APPLICATION_ID=$(<"$STATE_DIR/application-id")
}

use_candidate() {
  require_teardown_approval "${1:-}"
  load_ids
  local host_candidate_id nested_candidate_id
  host_candidate_id=$(validated_candidate_image_id)
  if ! nested_docker "$SANDBOX" image inspect "$CANDIDATE_IMAGE" >/dev/null 2>&1; then
    nested_docker "$SANDBOX" service scale dokploy=0 >/dev/null
    wait_for "current scale-down" 60 1 bash -c \
      '[[ "$(docker exec "$1" docker service ps dokploy --filter desired-state=running -q | wc -l | tr -d " ")" == 0 ]]' _ "$SANDBOX"
    sleep 2
    nested_docker "$SANDBOX" container prune -f >/dev/null
    nested_docker "$SANDBOX" image rm -f "$CURRENT_IMAGE" >/dev/null
    nested_docker "$SANDBOX" image prune -f >/dev/null
    load_host_image "$CANDIDATE_IMAGE"
  fi
  nested_candidate_id=$(nested_docker "$SANDBOX" image inspect "$CANDIDATE_IMAGE" --format '{{.Id}}')
  [[ "$nested_candidate_id" == "$host_candidate_id" ]] || {
    printf 'nested candidate image ID does not match the digest-validated host image\n' >&2
    exit 1
  }
  create_nested_secret ctd3513-encryption-v1 "$STATE_DIR/encryption-v1"
  if nested_docker "$SANDBOX" service inspect dokploy \
    --format '{{range .Spec.TaskTemplate.ContainerSpec.Secrets}}{{.SecretName}}:{{.File.Name}}{{"\n"}}{{end}}' \
    | grep -qx 'ctd3513-encryption-v1:encryption-key'; then
    nested_docker "$SANDBOX" service update --quiet --no-resolve-image --image "$CANDIDATE_IMAGE" \
      --env-add ENCRYPTION_KEY_FILE=/run/secrets/encryption-key --force dokploy >/dev/null
  else
    nested_docker "$SANDBOX" service update --quiet --no-resolve-image --image "$CANDIDATE_IMAGE" \
      --secret-add source=ctd3513-encryption-v1,target=encryption-key \
      --env-add ENCRYPTION_KEY_FILE=/run/secrets/encryption-key --force dokploy >/dev/null
  fi
  nested_docker "$SANDBOX" service scale dokploy=1 >/dev/null
  wait_service dokploy
  wait_api
  login
  assert_marker_read candidate-legacy-read
  local untouched
  untouched=$(raw_db_env)
  [[ "$(marker_hash "$untouched")" == "$(marker_hash "$MARKER")" ]]

  trpc_mutation application.saveEnvironment "$(jq -cn --arg id "$APPLICATION_ID" --arg marker "$MARKER" \
    '{applicationId:$id,env:$marker,buildArgs:"",buildSecrets:"",createEnvFile:true}')" >/dev/null
  local raw
  raw=$(raw_db_env)
  ciphertext_prefix "$raw" >/dev/null
  jq -cn --arg phase lazy-write --arg prefix "$(ciphertext_prefix "$raw")" \
    --argjson length "$(marker_length "$raw")" '{phase:$phase,prefix:$prefix,length:$length}' >>"$EVIDENCE"
  nested_docker "$SANDBOX" service update --quiet --force dokploy >/dev/null
  wait_service dokploy; wait_api; login
  assert_marker_read dedicated-key-restart
  record candidate-lazy-encryption pass
}

rotate_auth() {
  load_ids
  create_nested_secret ctd3513-auth-v2 "$STATE_DIR/auth-v2"
  nested_docker "$SANDBOX" service update --quiet --secret-rm ctd3513-auth-v1 \
    --secret-add source=ctd3513-auth-v2,target=auth-secret --force dokploy >/dev/null
  wait_service dokploy; wait_api; login
  assert_marker_read auth-secret-rotated
  nested_docker "$SANDBOX" service update --quiet --secret-rm ctd3513-auth-v2 \
    --secret-add source=ctd3513-auth-v1,target=auth-secret --force dokploy >/dev/null
  wait_service dokploy; wait_api; login
  assert_marker_read auth-secret-restored
  record auth-separation pass
}

wrong_and_missing_key() {
  load_ids
  create_nested_secret ctd3513-encryption-wrong "$STATE_DIR/encryption-wrong"
  nested_docker "$SANDBOX" service update --quiet --secret-rm ctd3513-encryption-v1 \
    --secret-add source=ctd3513-encryption-wrong,target=encryption-key --force dokploy >/dev/null
  wait_service dokploy; wait_api; login
  assert_ciphertext_read wrong-dedicated-key
  nested_docker "$SANDBOX" service update --quiet --secret-rm ctd3513-encryption-wrong \
    --secret-add source=ctd3513-encryption-v1,target=encryption-key --force dokploy >/dev/null
  wait_service dokploy; wait_api; login
  assert_marker_read correct-key-restored

  nested_docker "$SANDBOX" service update --quiet --secret-rm ctd3513-encryption-v1 \
    --env-rm ENCRYPTION_KEY_FILE --force dokploy >/dev/null
  wait_service dokploy; wait_api; login
  assert_ciphertext_read missing-dedicated-key
  nested_docker "$SANDBOX" service update --quiet \
    --secret-add source=ctd3513-encryption-v1,target=encryption-key \
    --env-add ENCRYPTION_KEY_FILE=/run/secrets/encryption-key --force dokploy >/dev/null
  wait_service dokploy; wait_api; login
  assert_marker_read missing-key-restored
  record key-failures pass
}

case "${1:-}" in
  prepare) prepare ;;
  seed) seed_plaintext ;;
  candidate) use_candidate "${2:-}" ;;
  key-separation) rotate_auth ;;
  key-failures) wrong_and_missing_key ;;
  focused)
    require_teardown_approval "${2:-}"
    prepare
    seed_plaintext
    use_candidate "${2:-}"
    rotate_auth
    wrong_and_missing_key
    ;;
  *)
    printf 'usage: %s {prepare|seed|key-separation|key-failures} | {candidate|focused} approve-destroy-synthetic-ctd3513\n' "$0" >&2
    exit 2
    ;;
esac

printf 'sanitized evidence: %s\n' "$EVIDENCE"
printf 'sandbox retained for inspection; teardown is always a separate approved command\n'
