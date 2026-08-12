#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
source "$ROOT/lib.sh"

require_teardown_approval "${1:-}"
SANDBOX=$(validate_sandbox_name "${CTD3513_SANDBOX:-ctd3513-encryption}")
PORT=${CTD3513_PORT:-35130}
CURRENT_IMAGE=${CTD3513_CURRENT_IMAGE:-dokploy-ctd:v0.29.8-ctd3f3a559-local}
DEFAULT_CURRENT_IMAGE_ID=sha256:1c254fbe41054892cc7e64d14f0ccc97d4726670fe38020dbb2728ef6972063c
CURRENT_IMAGE_ID=${CTD3513_CURRENT_IMAGE_ID:-$DEFAULT_CURRENT_IMAGE_ID}
CANDIDATE_IMAGE=${CTD3513_CANDIDATE_IMAGE:-dokploy-ctd:v0.29.14-ctdd403b82-local}
STATE_DIR="$ROOT/.state/$SANDBOX"
EVIDENCE="$STATE_DIR/evidence.jsonl"
COOKIE="$STATE_DIR/cookies.txt"
API="http://127.0.0.1:$PORT"
EMAIL=${CTD3513_EMAIL:-ctd3513@example.invalid}

[[ -f "$STATE_DIR/encryption-v1" && -f "$STATE_DIR/auth-v1" \
  && -f "$STATE_DIR/operator-password" && -f "$STATE_DIR/application-id" ]] || {
  printf 'focused harness state is incomplete; run run.sh focused first\n' >&2
  exit 1
}
PASSWORD=$(<"$STATE_DIR/operator-password")
APPLICATION_ID=$(<"$STATE_DIR/application-id")

record() {
  jq -cn --arg phase "$1" --arg status "$2" --arg at "$(date -u +%FT%TZ)" \
    '{phase:$phase,status:$status,at:$at}' >>"$EVIDENCE"
}

wait_service() {
  local service=$1
  wait_for "$service" 90 2 bash -c \
    '[[ "$(docker exec "$1" docker service ps "$2" --filter desired-state=running --format "{{.CurrentState}}" 2>/dev/null | grep -c "^Running ")" == "1" ]]' \
    _ "$SANDBOX" "$service"
}

wait_api() {
  wait_for "Dokploy API" 120 2 \
    curl --connect-timeout 2 --max-time 5 -fsS "$API/api/health"
}

login() {
  : >"$COOKIE"
  curl --max-time 30 -fsS -b "$COOKIE" -c "$COOKIE" -H 'content-type: application/json' \
    -H "origin: $API" \
    --data "$(jq -cn --arg email "$EMAIL" --arg password "$PASSWORD" '{email:$email,password:$password}')" \
    "$API/api/auth/sign-in/email" >/dev/null
}

app_read_env() {
  local encoded
  encoded=$(jq -cn --arg id "$APPLICATION_ID" '{json:{applicationId:$id}}' | jq -sRr @uri)
  curl --max-time 30 -fsS -b "$COOKIE" -H "origin: $API" \
    "$API/api/trpc/application.one?input=$encoded" | jq -er '.result.data.json.env'
}

create_nested_secret() {
  local name=$1 file=$2
  if ! nested_docker "$SANDBOX" secret inspect "$name" >/dev/null 2>&1; then
    docker exec -i "$SANDBOX" docker secret create "$name" - <"$file" >/dev/null
  fi
}

# Execute exportEncryptionKeys() from the exact candidate artifact under test.
candidate_container=$(nested_docker "$SANDBOX" ps -q --filter label=com.docker.swarm.service.name=dokploy | head -n1)
nested_docker "$SANDBOX" exec "$candidate_container" sh -ceu '
  module=$(find /app/node_modules/.pnpm -path "*/@dokploy/server/dist/lib/encryption.js" -print -quit)
  test -n "$module"
  node --input-type=module -e '\''
    import { writeFileSync } from "node:fs";
    const { exportEncryptionKeys } = await import(process.argv[1]);
    writeFileSync("/tmp/ctd3513-encryption.key", exportEncryptionKeys(), { mode: 0o600 });
  '\'' "$module"
'
nested_docker "$SANDBOX" cp "$candidate_container:/tmp/ctd3513-encryption.key" /ctd3513-encryption.key
docker cp "$SANDBOX:/ctd3513-encryption.key" "$STATE_DIR/encryption.key"
chmod 600 "$STATE_DIR/encryption.key"

pg=$(nested_docker "$SANDBOX" ps -q --filter label=com.docker.swarm.service.name=dokploy-postgres | head -n1)
nested_docker "$SANDBOX" exec -e PGPASSWORD_FILE=/run/secrets/postgres-password "$pg" sh -ceu \
  'export PGPASSWORD=$(cat "$PGPASSWORD_FILE"); pg_dump -Fc -U dokploy -d dokploy -f /tmp/encrypted.dump'
nested_docker "$SANDBOX" cp "$pg:/tmp/encrypted.dump" /ctd3513-encrypted.dump
docker cp "$STATE_DIR/encryption.key" "$SANDBOX:/ctd3513-encryption.key"
record backup-keyring-created pass

# Restore the encrypted database and exported keyring into a second candidate stack
# with different synthetic auth and primary encryption secrets.
create_nested_secret ctd3513-postgres-restore "$STATE_DIR/postgres-password"
create_nested_secret ctd3513-auth-restore "$STATE_DIR/auth-v2"
create_nested_secret ctd3513-encryption-restore "$STATE_DIR/encryption-restore-target"

if ! nested_docker "$SANDBOX" service inspect dokploy-postgres-restore >/dev/null 2>&1; then
  nested_docker "$SANDBOX" service create --quiet --name dokploy-postgres-restore --network ctd3513 \
    --secret source=ctd3513-postgres-restore,target=postgres-password \
    --env POSTGRES_USER=dokploy --env POSTGRES_DB=dokploy \
    --env POSTGRES_PASSWORD_FILE=/run/secrets/postgres-password \
    --mount source=ctd3513-postgres-restore,target=/var/lib/postgresql/data postgres:16-alpine >/dev/null
fi
wait_service dokploy-postgres-restore
pg_restore_container=$(nested_docker "$SANDBOX" ps -q --filter label=com.docker.swarm.service.name=dokploy-postgres-restore | head -n1)
wait_for "restored PostgreSQL readiness" 60 2 \
  nested_docker "$SANDBOX" exec "$pg_restore_container" pg_isready -U dokploy -d dokploy
nested_docker "$SANDBOX" cp /ctd3513-encrypted.dump "$pg_restore_container:/tmp/encrypted.dump"
nested_docker "$SANDBOX" exec -e PGPASSWORD_FILE=/run/secrets/postgres-password "$pg_restore_container" sh -ceu \
  'export PGPASSWORD=$(cat "$PGPASSWORD_FILE"); pg_restore --clean --if-exists --no-owner -U dokploy -d dokploy /tmp/encrypted.dump'

nested_docker "$SANDBOX" run --rm -v ctd3513-dokploy-restore:/target -v /:/outer alpine sh -ceu \
  'cp /outer/ctd3513-encryption.key /target/encryption.key; chmod 600 /target/encryption.key'
if ! nested_docker "$SANDBOX" service inspect dokploy-restore >/dev/null 2>&1; then
  nested_docker "$SANDBOX" service create --quiet --no-resolve-image --name dokploy-restore --network ctd3513 \
    --secret source=ctd3513-postgres-restore,target=postgres-password \
    --secret source=ctd3513-auth-restore,target=auth-secret \
    --secret source=ctd3513-encryption-restore,target=encryption-key \
    --env NODE_ENV=production --env POSTGRES_HOST=dokploy-postgres-restore \
    --env POSTGRES_PASSWORD_FILE=/run/secrets/postgres-password \
    --env BETTER_AUTH_SECRET_FILE=/run/secrets/auth-secret \
    --env ENCRYPTION_KEY_FILE=/run/secrets/encryption-key \
    --mount type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock \
    --mount source=ctd3513-dokploy-restore,target=/etc/dokploy "$CANDIDATE_IMAGE" >/dev/null
fi
wait_service dokploy-restore

# Query through the restored candidate API from a one-shot container on the
# nested network. The output written to the host is only a hash and length.
docker cp "$STATE_DIR/operator-password" "$SANDBOX:/ctd3513-operator-password"
printf '%s' "$EMAIL" | docker exec -i "$SANDBOX" sh -ceu 'cat > /ctd3513-operator-email'
nested_docker "$SANDBOX" run --rm --network ctd3513 -v /:/outer alpine:3.22 sh -ceu '
  apk add --no-cache curl jq >/dev/null
  password=$(cat /outer/ctd3513-operator-password)
  email=$(cat /outer/ctd3513-operator-email)
  cookie=/tmp/cookie
  ready=false
  for attempt in $(seq 1 60); do
    if curl --max-time 5 -fsS http://dokploy-restore:3000/api/health >/dev/null; then ready=true; break; fi
    sleep 2
  done
  "$ready"
  curl --max-time 30 -fsS -c "$cookie" -H "content-type: application/json" \
    -H "origin: http://dokploy-restore:3000" \
    --data "$(jq -cn --arg email "$email" --arg password "$password" '\''{email:$email,password:$password}'\'')" \
    http://dokploy-restore:3000/api/auth/sign-in/email >/dev/null
  input=$(jq -cn --arg id '"$APPLICATION_ID"' '\''{json:{applicationId:$id}}'\'' | jq -sRr @uri)
  value=$(curl --max-time 30 -fsS -b "$cookie" -H "origin: http://dokploy-restore:3000" \
    "http://dokploy-restore:3000/api/trpc/application.one?input=$input" | jq -er .result.data.json.env)
  printf %s "$value" | sha256sum | awk '\''{print $1}'\'' >/outer/ctd3513-restored-marker.sha256
  printf %s "$value" | wc -c | tr -d " " >/outer/ctd3513-restored-marker.length
'
restored_hash=$(docker exec "$SANDBOX" cat /ctd3513-restored-marker.sha256)
restored_length=$(docker exec "$SANDBOX" cat /ctd3513-restored-marker.length)
current_value=$(login; app_read_env)
[[ "$restored_hash" == "$(marker_hash "$current_value")" ]]
jq -cn --arg phase restored-keyring --arg sha256 "$restored_hash" --argjson length "$restored_length" \
  '{phase:$phase,sha256:$sha256,length:$length}' >>"$EVIDENCE"
record second-candidate-keyring-restore pass

# Keep peak disk use bounded: retire candidate tasks, remove only their synthetic
# nested image, then stream the exact current image from the host daemon.
nested_docker "$SANDBOX" service rm dokploy-restore dokploy-postgres-restore >/dev/null
nested_docker "$SANDBOX" service scale dokploy=0 >/dev/null
wait_for "candidate scale-down" 60 1 bash -c \
  '[[ "$(docker exec "$1" docker service ps dokploy --filter desired-state=running -q | wc -l | tr -d " ")" == 0 ]]' _ "$SANDBOX"
sleep 2
nested_docker "$SANDBOX" container prune -f >/dev/null
nested_docker "$SANDBOX" image rm -f "$CANDIDATE_IMAGE" >/dev/null
nested_docker "$SANDBOX" image prune -f >/dev/null
if [[ -n "${CTD3513_CURRENT_IMAGE:-}" && -z "${CTD3513_CURRENT_IMAGE_ID:-}" ]]; then
  printf 'CTD3513_CURRENT_IMAGE overrides require CTD3513_CURRENT_IMAGE_ID\n' >&2
  exit 1
fi
actual_current_id=$(docker image inspect "$CURRENT_IMAGE" --format '{{.Id}}')
validate_image_id "$CURRENT_IMAGE_ID" "$actual_current_id" || {
  printf 'current image does not match pinned image ID %s\n' "$CURRENT_IMAGE_ID" >&2
  exit 1
}
docker save "$CURRENT_IMAGE" | docker exec -i "$SANDBOX" docker load >/dev/null
nested_current_id=$(nested_docker "$SANDBOX" image inspect "$CURRENT_IMAGE" --format '{{.Id}}')
[[ "$nested_current_id" == "$actual_current_id" ]] || {
  printf 'nested current image ID does not match the pinned host image\n' >&2
  exit 1
}

# Prove image-only downgrade exposes ciphertext after the protected write.
nested_docker "$SANDBOX" service update --quiet --no-resolve-image --image "$CURRENT_IMAGE" --force dokploy >/dev/null
nested_docker "$SANDBOX" service scale dokploy=1 >/dev/null
wait_service dokploy; wait_api; login
downgraded=$(app_read_env)
ciphertext_prefix "$downgraded" >/dev/null
jq -cn --arg phase image-only-downgrade --arg prefix "$(ciphertext_prefix "$downgraded")" \
  --argjson length "$(marker_length "$downgraded")" '{phase:$phase,prefix:$prefix,length:$length}' >>"$EVIDENCE"
record image-only-downgrade-fails pass

# Full rollback: stop Dokploy, restore the pre-upgrade database/filesystem, and
# remove candidate-only key configuration before restarting the old image.
nested_docker "$SANDBOX" service scale dokploy=0 >/dev/null
wait_for "Dokploy scale-down" 60 1 bash -c \
  '[[ "$(docker exec "$1" docker service ps dokploy --filter desired-state=running -q | wc -l | tr -d " ")" == 0 ]]' _ "$SANDBOX"
nested_docker "$SANDBOX" cp /ctd3513-preupgrade.dump "$pg:/tmp/preupgrade.dump"
nested_docker "$SANDBOX" exec -e PGPASSWORD_FILE=/run/secrets/postgres-password "$pg" sh -ceu '
  export PGPASSWORD=$(cat "$PGPASSWORD_FILE")
  dropdb --if-exists -U dokploy dokploy
  createdb -U dokploy dokploy
  pg_restore --no-owner -U dokploy -d dokploy /tmp/preupgrade.dump
'
nested_docker "$SANDBOX" run --rm -v ctd3513-dokploy:/target -v /:/outer alpine sh -ceu \
  'find /target -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +; tar -C /target -xzf /outer/ctd3513-preupgrade-filesystem.tgz'
nested_docker "$SANDBOX" service update --quiet --no-resolve-image --image "$CURRENT_IMAGE" \
  --secret-rm ctd3513-encryption-v1 --env-rm ENCRYPTION_KEY_FILE dokploy >/dev/null
final_image=$(nested_docker "$SANDBOX" service inspect dokploy --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}')
[[ "$final_image" == "$CURRENT_IMAGE" ]]
if nested_docker "$SANDBOX" service inspect dokploy \
  --format '{{range .Spec.TaskTemplate.ContainerSpec.Secrets}}{{.SecretName}}:{{.File.Name}}{{"\n"}}{{end}}' \
  | grep -q '^ctd3513-encryption-'; then
  printf 'rollback left an encryption secret attached\n' >&2
  exit 1
fi
if nested_docker "$SANDBOX" service inspect dokploy \
  --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' \
  | grep -q '^ENCRYPTION_KEY_FILE='; then
  printf 'rollback left ENCRYPTION_KEY_FILE configured\n' >&2
  exit 1
fi
nested_docker "$SANDBOX" service scale dokploy=1 >/dev/null
wait_service dokploy; wait_api; login
rolled_back=$(app_read_env)
[[ "$(marker_hash "$rolled_back")" == "$(marker_hash "$current_value")" ]]
evidence_json full-preupgrade-restore "$rolled_back" >>"$EVIDENCE"
record full-rollback pass

printf 'backup/keyring restore, downgrade failure, and full rollback passed\n'
printf 'sandbox retained; run teardown only with separate approval\n'
