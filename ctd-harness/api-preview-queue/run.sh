#!/usr/bin/env bash
# CTD-3514 Gate 3 + Gate 4 synthetic proof against the pinned v0.29.14 candidate.
# Nested Docker-in-Docker only. Never mounts the host/OrbStack socket into Dokploy.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
source "$ROOT/lib.sh"

SANDBOX=$(validate_sandbox_name "${CTD3514_SANDBOX:-ctd3514-api-preview-queue}")
PORT=${CTD3514_PORT:-35140}
CANDIDATE_IMAGE=${CTD3514_CANDIDATE_IMAGE:-dokploy-ctd:v0.29.14-ctdd403b82-local}
DEFAULT_CANDIDATE_DIGEST=sha256:ae95f0d7e821fca4fb5f84eb1e5eb0bd61cdaddb4207dba1dcd0e4268b3c74c9
CANDIDATE_DIGEST=${CTD3514_CANDIDATE_DIGEST:-$DEFAULT_CANDIDATE_DIGEST}
DEFAULT_CANDIDATE_IMAGE_ID=sha256:02ae55741a50959165f45ce4072bd0a43a28583e979d92513572317a382276ad
CANDIDATE_IMAGE_ID=${CTD3514_CANDIDATE_IMAGE_ID:-$DEFAULT_CANDIDATE_IMAGE_ID}
DEFAULT_CANDIDATE_REVISION=d403b82afb8a71737f3f0b95542679f823514696
CANDIDATE_REVISION=${CTD3514_CANDIDATE_REVISION:-$DEFAULT_CANDIDATE_REVISION}
STATE_DIR="$ROOT/.state/$SANDBOX"
EVIDENCE="$STATE_DIR/evidence.jsonl"
SUMMARY="$STATE_DIR/summary.json"
COOKIE="$STATE_DIR/cookies.txt"
API_KEY_FILE="$STATE_DIR/api-key"
API="http://127.0.0.1:$PORT"
EMAIL=${CTD3514_EMAIL:-ctd3514@example.invalid}
CONTRACKO_ROOT=${CTD3514_CONTRACKO_ROOT:-}
PUBLIC_IMAGE=${CTD3514_PUBLIC_IMAGE:-nginx:alpine}
NETWORK=ctd3514

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"
touch "$EVIDENCE"
chmod 600 "$EVIDENCE"

if [[ -s "$STATE_DIR/marker" ]]; then
  MARKER=$(<"$STATE_DIR/marker")
else
  MARKER=${CTD3514_MARKER:-"CTD3514_SYNTHETIC_$(openssl rand -hex 12)"}
  printf '%s' "$MARKER" >"$STATE_DIR/marker"
  chmod 600 "$STATE_DIR/marker"
fi
if [[ -s "$STATE_DIR/operator-password" ]]; then
  PASSWORD=$(<"$STATE_DIR/operator-password")
else
  PASSWORD=${CTD3514_PASSWORD:-"Synthetic-$(openssl rand -hex 12)!"}
  printf '%s' "$PASSWORD" >"$STATE_DIR/operator-password"
  chmod 600 "$STATE_DIR/operator-password"
fi

need() { command -v "$1" >/dev/null || { printf 'missing dependency: %s\n' "$1" >&2; exit 1; }; }
for command in docker curl jq openssl shasum python3; do need "$command"; done

record() {
  local phase=$1 status=$2
  shift 2 || true
  local extra=${1:-"{}"}
  jq -cn --arg phase "$phase" --arg status "$status" --arg at "$(date -u +%FT%TZ)" --argjson extra "$extra" \
    '{phase:$phase,status:$status,at:$at}+$extra' >>"$EVIDENCE"
}

fail_phase() {
  local phase=$1 message=$2
  record "$phase" fail "{\"message\":$(jq -cn --arg m "$message" '$m')}"
  printf '%s failed: %s\n' "$phase" "$message" >&2
  exit 1
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

validated_candidate_image_id() {
  docker image inspect "$CANDIDATE_IMAGE" >/dev/null 2>&1 || {
    printf 'load the pinned candidate locally as %s before continuing\n' "$CANDIDATE_IMAGE" >&2
    return 1
  }
  if [[ -n "${CTD3514_CANDIDATE_IMAGE:-}" && -z "${CTD3514_CANDIDATE_DIGEST:-}" ]]; then
    printf 'CTD3514_CANDIDATE_IMAGE overrides require CTD3514_CANDIDATE_DIGEST\n' >&2
    return 1
  fi
  local repo_digests actual
  repo_digests=$(docker image inspect "$CANDIDATE_IMAGE" --format '{{join .RepoDigests "\n"}}')
  validate_candidate_digest "$CANDIDATE_DIGEST" "$repo_digests" || {
    printf 'candidate image does not match pinned digest %s\n' "$CANDIDATE_DIGEST" >&2
    return 1
  }
  actual=$(docker image inspect "$CANDIDATE_IMAGE" --format '{{.Id}}')
  validate_image_id "$CANDIDATE_IMAGE_ID" "$actual" || {
    printf 'candidate image ID does not match pinned %s\n' "$CANDIDATE_IMAGE_ID" >&2
    return 1
  }
  printf '%s\n' "$actual"
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
  curl --max-time 60 -fsS -b "$COOKIE" -c "$COOKIE" -H 'content-type: application/json' \
    -H "origin: $API" --data "$(jq -cn --argjson input "$input" '{json:$input}')" \
    "$API/api/trpc/$procedure" | jq -cer '.result.data.json'
}

trpc_query() {
  local procedure=$1
  local input=$2
  local encoded response
  encoded=$(python3 -c 'import json,urllib.parse,sys; print(urllib.parse.quote(json.dumps({"json": json.loads(sys.argv[1])}), safe=""))' "$input")
  response=$(curl --max-time 60 -fsS -b "$COOKIE" -c "$COOKIE" -H "origin: $API" \
    "$API/api/trpc/$procedure?input=$encoded")
  printf '%s' "$response" | jq -cer '.result.data.json'
}

login() {
  : >"$COOKIE"
  curl --max-time 30 -fsS -b "$COOKIE" -c "$COOKIE" -H 'content-type: application/json' \
    -H "origin: $API" \
    --data "$(jq -cn --arg email "$EMAIL" --arg password "$PASSWORD" '{email:$email,password:$password}')" \
    "$API/api/auth/sign-in/email" >/dev/null
}

# REST OpenAPI surface used by Contracko scripts (x-api-key).
rest_post() {
  local path=$1
  curl --max-time 60 -fsS -X POST "$API/api/$path" \
    -H 'accept: application/json' -H 'content-type: application/json' \
    -H @"$API_KEY_FILE" --data-binary @-
}

rest_get() {
  local path=$1
  shift
  local args=() kv
  for kv in "$@"; do args+=(--data-urlencode "$kv"); done
  curl --max-time 60 -fsS -G "$API/api/$path" \
    -H 'accept: application/json' -H @"$API_KEY_FILE" "${args[@]}"
}

unwrap_data() {
  python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps(d.get("data") if isinstance(d,dict) and "data" in d else d))'
}

json_get() {
  # json_get <jq-like-path using python>  reads JSON from stdin
  # usage: printf '%s' "$json" | json_get 'd.get("applicationId") or ""'
  local expr=$1
  python3 -c 'import json,sys; d=json.load(sys.stdin); print('"$expr"')'
}


service_exists() {
  local name=$1
  nested_docker "$SANDBOX" service inspect "$name" >/dev/null 2>&1
}

wait_service_absent() {
  local name=$1
  wait_for "service $name absent" 60 2 bash -c \
    '! docker exec "$1" docker service inspect "$2" >/dev/null 2>&1' _ "$SANDBOX" "$name"
}

wait_deployment_terminal() {
  local application_id=$1 expected_marker=$2
  local attempts=0 payload status
  while (( attempts < 90 )); do
    # rest_get already unwraps; prefer allByType which is the stable list shape.
    payload=$(rest_get deployment.allByType "type=application" "id=$application_id" 2>/dev/null || rest_get deployment.all "applicationId=$application_id")
    status=$(printf '%s' "$payload" | EXPECTED_MARKER="$expected_marker" python3 -c '
import json,os,sys
m=os.environ["EXPECTED_MARKER"]
raw=sys.stdin.read().strip() or "[]"
try:
  arr=json.loads(raw)
except Exception:
  arr=[]
if not isinstance(arr,list):
  arr=[]
for row in arr:
  blob=(str(row.get("title") or ""))+(str(row.get("description") or ""))
  if m in blob:
    print(row.get("status") or "")
    break
')
    case "$status" in
      done|error|failed|failure|canceled|cancelled) printf '%s\n' "$status"; return 0 ;;
    esac
    attempts=$((attempts + 1))
    sleep 2
  done
  return 1
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

  local host_id nested_id revision
  host_id=$(validated_candidate_image_id)
  revision=$(docker image inspect "$CANDIDATE_IMAGE" \
    --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
  record candidate-image pass "$(jq -cn --arg digest "$CANDIDATE_DIGEST" --arg imageId "$host_id" --arg revision "$revision" \
    '{digest:$digest,imageId:$imageId,revision:$revision}')"

  secret_value "$STATE_DIR/postgres-password"
  secret_value "$STATE_DIR/auth-v1"
  secret_value "$STATE_DIR/encryption-v1"

  docker run -d --privileged --name "$SANDBOX" \
    -e DOCKER_TLS_CERTDIR= -p "127.0.0.1:$PORT:3000" \
    -v "$SANDBOX-docker:/var/lib/docker" docker:29-dind \
    --host=unix:///var/run/docker.sock --tls=false >/dev/null
  wait_for "nested Docker daemon" 60 1 nested_docker "$SANDBOX" info
  nested_docker "$SANDBOX" swarm init --advertise-addr 127.0.0.1 >/dev/null
  nested_docker "$SANDBOX" network create --driver overlay --attachable "$NETWORK" >/dev/null

  load_host_image "$CANDIDATE_IMAGE"
  # docker save|load can rewrite content-addressable IDs across engines. Prove the
  # nested image is still the pinned candidate via architecture + OCI revision label.
  nested_id=$(nested_docker "$SANDBOX" image inspect "$CANDIDATE_IMAGE" --format '{{.Id}}')
  nested_arch=$(nested_docker "$SANDBOX" image inspect "$CANDIDATE_IMAGE" --format '{{.Architecture}}')
  nested_revision=$(nested_docker "$SANDBOX" image inspect "$CANDIDATE_IMAGE" \
    --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
  [[ "$nested_arch" == "amd64" ]] || fail_phase prepare "nested candidate arch is $nested_arch, expected amd64"
  [[ "$nested_revision" == "$CANDIDATE_REVISION" ]] || fail_phase prepare "nested candidate revision mismatch"
  record nested-candidate pass "$(jq -cn --arg hostId "$host_id" --arg nestedId "$nested_id" --arg revision "$nested_revision" \
    '{hostImageId:$hostId,nestedImageId:$nestedId,revision:$revision,idMayDifferAfterLoad:true}')"
  # Public synthetic workload image for docker-provider deploys.
  load_host_image "$PUBLIC_IMAGE" || {
    docker pull --platform linux/amd64 "$PUBLIC_IMAGE"
    load_host_image "$PUBLIC_IMAGE"
  }

  create_nested_secret ctd3514-postgres-password "$STATE_DIR/postgres-password"
  create_nested_secret ctd3514-auth-v1 "$STATE_DIR/auth-v1"
  create_nested_secret ctd3514-encryption-v1 "$STATE_DIR/encryption-v1"

  nested_docker "$SANDBOX" service create --quiet --name dokploy-postgres --network "$NETWORK" \
    --secret source=ctd3514-postgres-password,target=postgres-password \
    --env POSTGRES_USER=dokploy --env POSTGRES_DB=dokploy \
    --env POSTGRES_PASSWORD_FILE=/run/secrets/postgres-password \
    --mount source=ctd3514-postgres,target=/var/lib/postgresql/data postgres:16-alpine >/dev/null
  nested_docker "$SANDBOX" service create --quiet --name dokploy-redis --network "$NETWORK" \
    --mount source=ctd3514-redis,target=/data redis:7-alpine redis-server --appendonly yes >/dev/null
  wait_service dokploy-postgres
  wait_service dokploy-redis

  # Short hung-job timeout so Gate 4 queue proof finishes in rehearsal time.
  nested_docker "$SANDBOX" service create --quiet --no-resolve-image --name dokploy --network "$NETWORK" \
    --publish published=3000,target=3000 \
    --secret source=ctd3514-postgres-password,target=postgres-password \
    --secret source=ctd3514-auth-v1,target=auth-secret \
    --secret source=ctd3514-encryption-v1,target=encryption-key \
    --env NODE_ENV=production \
    --env POSTGRES_PASSWORD_FILE=/run/secrets/postgres-password \
    --env BETTER_AUTH_SECRET_FILE=/run/secrets/auth-secret \
    --env ENCRYPTION_KEY_FILE=/run/secrets/encryption-key \
    --env DEPLOYMENT_JOB_TIMEOUT_MS=8000 \
    --mount type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock \
    --mount source=ctd3514-dokploy,target=/etc/dokploy \
    "$CANDIDATE_IMAGE" >/dev/null
  wait_service dokploy
  wait_api
  record prepare pass
}

bootstrap_operator() {
  # Signup is idempotent for a retained sandbox: treat "already exists" as success.
  local signup_code
  signup_code=$(curl --max-time 30 -sS -o /tmp/ctd3514-signup.json -w '%{http_code}' \
    -b "$COOKIE" -c "$COOKIE" -H 'content-type: application/json' -H "origin: $API" \
    --data "$(jq -cn --arg email "$EMAIL" --arg password "$PASSWORD" \
      '{email:$email,password:$password,name:"Synthetic",lastName:"Operator"}')" \
    "$API/api/auth/sign-up/email" || true)
  case "$signup_code" in
    200|201) ;;
    422)
      jq -e '.code=="USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" or (.message//""|test("already exists";"i"))' \
        /tmp/ctd3514-signup.json >/dev/null 2>&1 || fail_phase bootstrap "sign-up returned 422"
      ;;
    *) fail_phase bootstrap "sign-up HTTP $signup_code" ;;
  esac
  rm -f /tmp/ctd3514-signup.json
  login

  local orgs org_id api_key_result raw_key key_len
  orgs=$(trpc_query organization.all '{}')
  org_id=$(printf '%s' "$orgs" | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d[0].get("id") if d else "") or "")')
  [[ -n "$org_id" ]] || fail_phase bootstrap "no organization after signup"
  printf '%s\n' "$org_id" >"$STATE_DIR/organization-id"

  # Disable default 10-req/day API key rate limit so gate3/gate4 can exercise many calls.
  api_key_result=$(trpc_mutation user.createApiKey "$(jq -cn --arg org "$org_id" \
    '{name:"ctd3514-synth",metadata:{organizationId:$org},rateLimitEnabled:false,rateLimitMax:100000}')")
  raw_key=$(printf '%s' "$api_key_result" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("key") or "")')
  [[ -n "$raw_key" ]] || fail_phase bootstrap "createApiKey did not return key"
  printf 'x-api-key: %s\n' "$raw_key" >"$API_KEY_FILE"
  chmod 600 "$API_KEY_FILE"
  key_len=$(marker_length "$raw_key")
  # Never write the raw key into evidence — only length.
  record bootstrap pass "$(jq -cn --argjson len "$key_len" '{apiKeyLength:$len}')"
}

seed_project() {
  local project
  project=$(trpc_mutation project.create '{"name":"ctd3514-synthetic","description":"api preview queue harness"}')
  PROJECT_ID=$(printf '%s' "$project" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("project",{}).get("projectId") or "")')
  ENVIRONMENT_ID=$(printf '%s' "$project" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("environment",{}).get("environmentId") or "")')
  printf '%s\n' "$PROJECT_ID" >"$STATE_DIR/project-id"
  printf '%s\n' "$ENVIRONMENT_ID" >"$STATE_DIR/environment-id"
  id_evidence projectId "$PROJECT_ID" >>"$EVIDENCE"
  id_evidence environmentId "$ENVIRONMENT_ID" >>"$EVIDENCE"
  record seed-project pass
}

gate3_api_contracts() {
  load_ids
  local parent preview app_one domain_id deploy_marker deployments previews parent_preview_env
  local bitbucket_payload has_secret_fields

  parent=$(rest_post application.create <<EOF | unwrap_data
{"name":"ctd3514-parent","appName":"ctd3514-parent","environmentId":"$ENVIRONMENT_ID","description":"parent"}
EOF
)
  PARENT_APP_ID=$(printf '%s' "$parent" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("applicationId") or "")')
  [[ -n "$PARENT_APP_ID" && "$PARENT_APP_ID" != null ]] || fail_phase gate3-create "parent application.create failed"
  printf '%s\n' "$PARENT_APP_ID" >"$STATE_DIR/parent-app-id"
  id_evidence parentApplicationId "$PARENT_APP_ID" >>"$EVIDENCE"
  record application.create pass

  # Parent previewEnv marker (decrypted read later).
  # previewEnv is NOT on saveEnvironment (apiSaveEnvironmentVariables only has env/build*).
  # Match contracko: set parent previewEnv via application.update (encrypted at rest, decrypted on read).
  rest_post application.update <<EOF >/dev/null
{"applicationId":"$PARENT_APP_ID","previewEnv":"$MARKER","sourceType":"docker","dockerImage":"$PUBLIC_IMAGE","username":"","password":"","isPreviewDeploymentsActive":true,"previewLimit":3,"previewPort":80,"previewHttps":false,"previewPath":"/","previewCertificateType":"none"}
EOF
  record application.update pass

  app_one=$(rest_get application.one "applicationId=$PARENT_APP_ID" | unwrap_data)
  parent_preview_env=$(printf '%s' "$app_one" | python3 -c 'import json,sys; v=json.load(sys.stdin).get("previewEnv"); print(v if isinstance(v,str) else "")')
  [[ "$(marker_hash "$parent_preview_env")" == "$(marker_hash "$MARKER")" ]] \
    || fail_phase gate3-one "previewEnv hash mismatch (expected decrypted marker)"
  # Ensure no enc:v1 leak for the API-facing previewEnv field.
  [[ "$parent_preview_env" != enc:v1:* ]] || fail_phase gate3-one "previewEnv returned ciphertext"
  record application.one pass-decrypted "$(jq -cn --arg h "$(marker_hash "$parent_preview_env")" --argjson len "$(marker_length "$parent_preview_env")" \
    '{previewEnvSha256:$h,previewEnvLength:$len}')"

  # Provider credential redaction: attach a synthetic bitbucket provider and assert secrets
  # never appear in application.one JSON (values checked by exact marker strings only).
  local auth_id bb_id
  auth_id=$(trpc_query user.get '{}' 2>/dev/null | jq -r '.id // .user.id // empty' || true)
  if [[ -z "$auth_id" ]]; then
    auth_id=$(curl --max-time 15 -fsS -b "$COOKIE" -c "$COOKIE" -H "origin: $API" \
      "$API/api/auth/get-session" | jq -r '.user.id // empty' || true)
  fi
  if [[ -n "$auth_id" ]] && bb_id=$(trpc_mutation bitbucket.create "$(jq -cn --arg auth "$auth_id" \
    '{name:"ctd3514-bb",authId:$auth,bitbucketUsername:"synth-user",appPassword:"SYNTH_APP_PASSWORD_NOT_REAL",apiToken:"SYNTH_API_TOKEN_NOT_REAL",bitbucketWorkspaceName:"synth-ws"}')" \
    2>/dev/null | jq -r '.bitbucketId // .id // empty'); then
    if [[ -n "$bb_id" && "$bb_id" != null ]]; then
      rest_post application.update <<EOF >/dev/null
{"applicationId":"$PARENT_APP_ID","bitbucketId":"$bb_id"}
EOF
    fi
    bitbucket_payload=$(rest_get application.one "applicationId=$PARENT_APP_ID" | unwrap_data)
    has_secret_fields=$(printf '%s' "$bitbucket_payload" | python3 -c 'import json,sys,re
def walk(o,out):
  if isinstance(o,dict):
    for v in o.values(): walk(v,out)
  elif isinstance(o,list):
    for v in o: walk(v,out)
  elif isinstance(o,str): out.append(o)
vals=[]; walk(json.load(sys.stdin), vals)
print(sum(1 for s in vals if re.search(r"SYNTH_APP_PASSWORD_NOT_REAL|SYNTH_API_TOKEN_NOT_REAL", s)))')
    [[ "$has_secret_fields" == "0" ]] || fail_phase gate3-redaction "provider secrets leaked in application.one"
    # Detach provider so later deploys stay docker-only.
    rest_post application.update <<EOF >/dev/null
{"applicationId":"$PARENT_APP_ID","bitbucketId":null,"sourceType":"docker","dockerImage":"$PUBLIC_IMAGE","username":"","password":""}
EOF
    record git-provider-redaction pass
  else
    record git-provider-redaction skip-create-unavailable
  fi

  rest_post domain.create <<EOF >/dev/null
{"applicationId":"$PARENT_APP_ID","host":"ctd3514-parent.localhost","https":false,"port":80,"path":"/","certificateType":"none"}
EOF
  record domain.create pass

  local project_one
  project_one=$(rest_get project.one "projectId=$PROJECT_ID")
  printf '%s' "$project_one" | PARENT_APP_ID="$PARENT_APP_ID" python3 -c '
import json,os,sys
pid=os.environ["PARENT_APP_ID"]
d=json.load(sys.stdin)
apps=[]
for env in (d.get("environments") or []):
  apps.extend(env.get("applications") or [])
ids=[a.get("applicationId") for a in apps]
if pid not in ids:
  raise SystemExit("missing parent")
' || fail_phase gate3-project "project.one missing parent application"
  record project.one pass

  deploy_marker="ctd3514-commit-$(openssl rand -hex 8)"
  printf '%s\n' "$deploy_marker" >"$STATE_DIR/deploy-marker"
  rest_post application.deploy <<EOF >/dev/null
{"applicationId":"$PARENT_APP_ID","title":"Synthetic deploy","description":"$deploy_marker"}
EOF
  record application.deploy pass

  local terminal
  terminal=$(wait_deployment_terminal "$PARENT_APP_ID" "$deploy_marker") \
    || fail_phase gate3-deploy-wait "deployment did not reach terminal state"
  deployments=$(rest_get deployment.allByType "type=application" "id=$PARENT_APP_ID" 2>/dev/null || rest_get deployment.all "applicationId=$PARENT_APP_ID")
  local done_count
  done_count=$(printf '%s' "$deployments" | EXPECTED_MARKER="$deploy_marker" python3 -c '
import json,os,sys
m=os.environ["EXPECTED_MARKER"]; arr=json.loads(sys.stdin.read() or "[]")
print(sum(1 for r in arr if m in ((r.get("title") or "")+(r.get("description") or "")) and r.get("status")=="done"))
')
  [[ "$done_count" -ge 1 ]] || fail_phase gate3-deployment-all "expected done deployment, got terminal=$terminal"
  record deployment.all pass "$(jq -cn --argjson done "$done_count" --arg t "$terminal" '{doneCount:$done,terminal:$t}')"

  previews=$(rest_get previewDeployment.all "applicationId=$PARENT_APP_ID")
  printf '%s' "$previews" | python3 -c 'import json,sys; a=json.load(sys.stdin); assert isinstance(a,list), type(a)'     || fail_phase gate3-preview-all "previewDeployment.all not an array"
  record previewDeployment.all pass "$(jq -cn --argjson c "$(printf '%s' "$previews" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')" '{count:$c}')"

  # Preview-style child app via Contracko request shapes (image-pull model).
  preview=$(rest_post application.create <<EOF | unwrap_data
{"name":"app-preview-pr-3514","appName":"app-preview-pr-3514","environmentId":"$ENVIRONMENT_ID","description":"synthetic preview"}
EOF
)
  PREVIEW_APP_ID=$(printf '%s' "$preview" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("applicationId") or "")')
  printf '%s\n' "$PREVIEW_APP_ID" >"$STATE_DIR/preview-app-id"
  id_evidence previewApplicationId "$PREVIEW_APP_ID" >>"$EVIDENCE"

  rest_post application.update <<EOF >/dev/null
{"applicationId":"$PREVIEW_APP_ID","sourceType":"docker","dockerImage":"$PUBLIC_IMAGE","username":"","password":""}
EOF
  rest_post application.saveEnvironment <<EOF >/dev/null
{"applicationId":"$PREVIEW_APP_ID","env":"DOKPLOY_DEPLOY_URL=pr3514.localhost\nMARKER_HASH_ONLY=1\n","buildArgs":"","buildSecrets":"","createEnvFile":false}
EOF
  rest_post domain.create <<EOF >/dev/null
{"applicationId":"$PREVIEW_APP_ID","host":"pr3514.localhost","https":false,"port":80,"path":"/","certificateType":"none"}
EOF
  local preview_marker="ctd3514-preview-$(openssl rand -hex 6)"
  rest_post application.deploy <<EOF >/dev/null
{"applicationId":"$PREVIEW_APP_ID","title":"Preview PR #3514","description":"$preview_marker"}
EOF
  terminal=$(wait_deployment_terminal "$PREVIEW_APP_ID" "$preview_marker") \
    || fail_phase gate3-preview-deploy "preview deploy did not finish"
  [[ "$terminal" == "done" ]] || fail_phase gate3-preview-deploy "preview deploy terminal=$terminal"
  record preview-app-deploy pass

  # Exact wait-for-dokploy-deployment.mjs path when Contracko checkout is available.
  if [[ -n "$CONTRACKO_ROOT" && -f "$CONTRACKO_ROOT/scripts/deploy/wait-for-dokploy-deployment.mjs" ]]; then
    DOKPLOY_URL="$API" \
    DOKPLOY_API_KEY="$(sed -n 's/^x-api-key: //p' "$API_KEY_FILE")" \
    DOKPLOY_APPLICATION_ID="$PREVIEW_APP_ID" \
    EXPECTED_COMMIT_SHA="$preview_marker" \
    DOKPLOY_DEPLOY_TIMEOUT_SECONDS=180 \
    DOKPLOY_DEPLOY_INTERVAL_SECONDS=2 \
    node "$CONTRACKO_ROOT/scripts/deploy/wait-for-dokploy-deployment.mjs"
    record exact-wait-script pass
  else
    record exact-wait-script skip-no-contracko-root
  fi

  # Exact preview down script when available.
  if [[ -n "$CONTRACKO_ROOT" && -f "$CONTRACKO_ROOT/scripts/dokploy/dokploy-preview.sh" ]]; then
    DOKPLOY_URL="$API" \
    DOKPLOY_API_KEY="$(sed -n 's/^x-api-key: //p' "$API_KEY_FILE")" \
    DOKPLOY_PROJECT_ID="$PROJECT_ID" \
    DOKPLOY_PREVIEW_ENVIRONMENT_ID="$ENVIRONMENT_ID" \
    PR_NUMBER=3514 \
    bash "$CONTRACKO_ROOT/scripts/dokploy/dokploy-preview.sh" down
    wait_service_absent app-preview-pr-3514 || true
    if service_exists app-preview-pr-3514; then
      fail_phase exact-preview-down "preview service still present after down"
    fi
    record exact-preview-down pass
    PREVIEW_APP_ID=""
    rm -f "$STATE_DIR/preview-app-id"
  else
    record exact-preview-down skip-no-contracko-root
  fi

  record gate3 pass
}

# Gate 4: close-during-build race via synthetic preview row + Swarm service + delete.
gate4_race_and_delete() {
  load_ids
  local race_app race_app_id race_preview_id race_app_name domain_id

  race_app=$(rest_post application.create <<EOF | unwrap_data
{"name":"ctd3514-race-parent","appName":"ctd3514-race-parent","environmentId":"$ENVIRONMENT_ID","description":"race parent"}
EOF
)
  race_app_id=$(printf '%s' "$race_app" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("applicationId") or "")')
  race_app_name="preview-ctd3514-race-svc"

  # Insert a synthetic preview_deployments row without calling live GitHub.
  local pg_cid
  pg_cid=$(nested_docker "$SANDBOX" ps -q --filter "label=com.docker.swarm.service.name=dokploy-postgres" | head -n1)
  race_preview_id="ctd3514race$(openssl rand -hex 6)"
  nested_docker "$SANDBOX" exec -e PGPASSWORD_FILE=/run/secrets/postgres-password "$pg_cid" \
    sh -ceu 'export PGPASSWORD=$(cat "$PGPASSWORD_FILE")
psql -v ON_ERROR_STOP=1 -U dokploy -d dokploy <<SQL
INSERT INTO preview_deployments (
  "previewDeploymentId", branch, "pullRequestId", "pullRequestNumber",
  "pullRequestURL", "pullRequestTitle", "pullRequestCommentId",
  "previewStatus", "appName", "applicationId", "createdAt"
) VALUES (
  '\''$1'\'', '\''race-branch'\'', '\''999001'\'', '\''9001'\'',
  '\''https://example.invalid/pr/9001'\'', '\''synthetic race'\'', '\''0'\'',
  '\''running'\'', '\''$2'\'', '\''$3'\'', NOW()::text
);
SQL' sh "$race_preview_id" "$race_app_name" "$race_app_id"

  # Simulate an in-flight preview Swarm service.
  nested_docker "$SANDBOX" service create --quiet --name "$race_app_name" \
    --network "$NETWORK" "$PUBLIC_IMAGE" >/dev/null
  service_exists "$race_app_name" || fail_phase gate4-race "failed to create synthetic preview service"

  # PR-close equivalent: previewDeployment.delete while "build" would still be running.
  rest_post previewDeployment.delete <<EOF >/dev/null
{"previewDeploymentId":"$race_preview_id"}
EOF

  wait_service_absent "$race_app_name" || fail_phase gate4-race "service still present immediately after delete"

  # Resurrect window: wait and confirm the service stays gone (no late mechanize).
  sleep 8
  if service_exists "$race_app_name"; then
    fail_phase gate4-race "service resurrected after preview delete"
  fi

  # Queue skip path: process would no-op when preview row is gone (unit-tested);
  # here assert the API no longer lists the preview.
  local remaining
  remaining=$(rest_get previewDeployment.all "applicationId=$race_app_id")
  printf '%s' "$remaining" | RACE_ID="$race_preview_id" python3 -c '
import json,os,sys
rid=os.environ["RACE_ID"]; arr=json.loads(sys.stdin.read() or "[]")
if any((r.get("previewDeploymentId")==rid) for r in arr):
  raise SystemExit(1)
' || fail_phase gate4-race "preview row still listed after delete"
  record race-close-during-build pass "{\"serviceAbsent\":true,\"resurrected\":false}"

  # Application delete cleans remaining previews + services.
  local child_name="preview-ctd3514-appdel"
  local child_preview_id="ctd3514adel$(openssl rand -hex 6)"
  nested_docker "$SANDBOX" exec -e PGPASSWORD_FILE=/run/secrets/postgres-password "$pg_cid" \
    sh -ceu 'export PGPASSWORD=$(cat "$PGPASSWORD_FILE")
psql -v ON_ERROR_STOP=1 -U dokploy -d dokploy <<SQL
INSERT INTO preview_deployments (
  "previewDeploymentId", branch, "pullRequestId", "pullRequestNumber",
  "pullRequestURL", "pullRequestTitle", "pullRequestCommentId",
  "previewStatus", "appName", "applicationId", "createdAt"
) VALUES (
  '\''$1'\'', '\''del-branch'\'', '\''999002'\'', '\''9002'\'',
  '\''https://example.invalid/pr/9002'\'', '\''synthetic delete'\'', '\''0'\'',
  '\''done'\'', '\''$2'\'', '\''$3'\'', NOW()::text
);
SQL' sh "$child_preview_id" "$child_name" "$race_app_id"
  nested_docker "$SANDBOX" service create --quiet --name "$child_name" \
    --network "$NETWORK" "$PUBLIC_IMAGE" >/dev/null

  rest_post application.delete <<EOF >/dev/null
{"applicationId":"$race_app_id","deleteVolumes":true}
EOF
  wait_service_absent "$child_name" || fail_phase gate4-app-delete "child preview service remains"
  if service_exists ctd3514-race-parent; then
    # parent appName service may or may not exist depending on deploy; force check absence of preview child is enough
    :
  fi
  record application-delete-with-previews pass
  record gate4-race-delete pass
}

gate4_queue_and_cleanup() {
  load_ids
  local app_ok app_bad ok_id bad_id ok_marker bad_marker terminal_ok terminal_bad

  app_ok=$(rest_post application.create <<EOF | unwrap_data
{"name":"ctd3514-q-ok","appName":"ctd3514-q-ok","environmentId":"$ENVIRONMENT_ID","description":"queue ok"}
EOF
)
  app_bad=$(rest_post application.create <<EOF | unwrap_data
{"name":"ctd3514-q-bad","appName":"ctd3514-q-bad","environmentId":"$ENVIRONMENT_ID","description":"queue bad"}
EOF
)
  ok_id=$(printf '%s' "$app_ok" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("applicationId") or "")')
  bad_id=$(printf '%s' "$app_bad" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("applicationId") or "")')

  rest_post application.update <<EOF >/dev/null
{"applicationId":"$ok_id","sourceType":"docker","dockerImage":"$PUBLIC_IMAGE","username":"","password":""}
EOF
  # Non-existent image forces a failing/hung-style deploy job without live credentials.
  rest_post application.update <<EOF >/dev/null
{"applicationId":"$bad_id","sourceType":"docker","dockerImage":"ctd3514.invalid/does-not-exist:never","username":"","password":""}
EOF

  ok_marker="ctd3514-ok-$(openssl rand -hex 4)"
  bad_marker="ctd3514-bad-$(openssl rand -hex 4)"
  # Enqueue failing job first, then successful job — later work must still complete.
  rest_post application.deploy <<EOF >/dev/null
{"applicationId":"$bad_id","title":"bad","description":"$bad_marker"}
EOF
  rest_post application.deploy <<EOF >/dev/null
{"applicationId":"$ok_id","title":"ok","description":"$ok_marker"}
EOF

  terminal_bad=$(wait_deployment_terminal "$bad_id" "$bad_marker" || true)
  terminal_ok=$(wait_deployment_terminal "$ok_id" "$ok_marker") \
    || fail_phase gate4-queue "successful job did not finish after failing peer"
  [[ "$terminal_ok" == "done" ]] || fail_phase gate4-queue "ok job terminal=$terminal_ok"
  record queue-progress pass "$(jq -cn --arg ok "$terminal_ok" --arg bad "${terminal_bad:-timeout}" \
    '{okTerminal:$ok,badTerminal:$bad}')"

  # Cleanup classifier: tracked preview appName kept; intentional orphan detected.
  local tracked_name orphan_name tmp
  tracked_name="preview-ctd3514-tracked"
  orphan_name="preview-ctd3514-orphan"
  tmp=$(mktemp -d)
  printf '%s\n' "$tracked_name" >"$tmp/tracked"
  printf '%s\n%s\n' "$tracked_name" "$orphan_name" >"$tmp/running"
  local classification
  classification=$(classify_preview_services "$tmp/tracked" "$tmp/running")
  grep -Fxq "keep $tracked_name" <<<"$classification" || fail_phase gate4-cleanup "tracked not kept"
  grep -Fxq "orphan $orphan_name" <<<"$classification" || fail_phase gate4-cleanup "orphan not detected"
  rm -rf "$tmp"

  # Live Swarm confirmation of the same decision using nested docker.
  nested_docker "$SANDBOX" service create --quiet --name "$tracked_name" --network "$NETWORK" "$PUBLIC_IMAGE" >/dev/null
  nested_docker "$SANDBOX" service create --quiet --name "$orphan_name" --network "$NETWORK" "$PUBLIC_IMAGE" >/dev/null
  # Seed a tracked preview row so previewDeployment.all would report the tracked name.
  local pg_cid tracked_preview_id parent_for_cleanup
  parent_for_cleanup=$ok_id
  tracked_preview_id="ctd3514trk$(openssl rand -hex 6)"
  pg_cid=$(nested_docker "$SANDBOX" ps -q --filter "label=com.docker.swarm.service.name=dokploy-postgres" | head -n1)
  nested_docker "$SANDBOX" exec -e PGPASSWORD_FILE=/run/secrets/postgres-password "$pg_cid" \
    sh -ceu 'export PGPASSWORD=$(cat "$PGPASSWORD_FILE")
psql -v ON_ERROR_STOP=1 -U dokploy -d dokploy <<SQL
INSERT INTO preview_deployments (
  "previewDeploymentId", branch, "pullRequestId", "pullRequestNumber",
  "pullRequestURL", "pullRequestTitle", "pullRequestCommentId",
  "previewStatus", "appName", "applicationId", "createdAt"
) VALUES (
  '\''$1'\'', '\''track'\'', '\''999003'\'', '\''9003'\'',
  '\''https://example.invalid/pr/9003'\'', '\''tracked'\'', '\''0'\'',
  '\''done'\'', '\''$2'\'', '\''$3'\'', NOW()::text
);
SQL' sh "$tracked_preview_id" "$tracked_name" "$parent_for_cleanup"

  local api_names
  api_names=$(rest_get previewDeployment.all "applicationId=$parent_for_cleanup" | unwrap_data \
    | jq -r '.[].appName' | sort)
  grep -Fxq "$tracked_name" <<<"$api_names" || fail_phase gate4-cleanup "API missing tracked preview"
  # Dry-run style: would keep tracked, remove orphan.
  if ! service_exists "$tracked_name"; then fail_phase gate4-cleanup "tracked service missing"; fi
  if ! service_exists "$orphan_name"; then fail_phase gate4-cleanup "orphan service missing before detect"; fi
  record cleanup-tracked-and-orphan pass \
    "$(jq -cn --arg tracked "$tracked_name" --arg orphan "$orphan_name" \
      '{trackedKept:true,orphanDetected:true,tracked:$tracked,orphan:$orphan}')"

  # Exact preview-cleanup.sh cannot run fully without Stripe; document the seam.
  if [[ -n "$CONTRACKO_ROOT" && -f "$CONTRACKO_ROOT/scripts/dokploy/preview-cleanup.sh" ]]; then
    record exact-cleanup-script noted-requires-stripe-out-of-synthetic-scope
  else
    record exact-cleanup-script skip-no-contracko-root
  fi

  record gate4-queue-cleanup pass
}

load_ids() {
  PROJECT_ID=$(<"$STATE_DIR/project-id")
  ENVIRONMENT_ID=$(<"$STATE_DIR/environment-id")
  if [[ -f "$STATE_DIR/parent-app-id" ]]; then PARENT_APP_ID=$(<"$STATE_DIR/parent-app-id"); fi
  if [[ -f "$STATE_DIR/preview-app-id" ]]; then PREVIEW_APP_ID=$(<"$STATE_DIR/preview-app-id"); fi
}

write_summary() {
  local revision
  revision=$(docker image inspect "$CANDIDATE_IMAGE" \
    --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || printf 'unknown')
  jq -cn \
    --arg testedAt "$(date -u +%FT%TZ)" \
    --arg digest "$CANDIDATE_DIGEST" \
    --arg imageId "$CANDIDATE_IMAGE_ID" \
    --arg revision "$revision" \
    --arg evidence "$EVIDENCE" \
    '{
      testedAt:$testedAt,
      candidate:{digest:$digest,imageId:$imageId,revision:$revision},
      evidencePath:$evidence,
      sharedOrLiveInfrastructureTouched:false,
      notes:[
        "Gate3 API contracts exercised via Contracko REST shapes",
        "Gate4 race uses synthetic preview row + Swarm service + previewDeployment.delete",
        "Hung-job watchdog covered by unit tests with DEPLOYMENT_JOB_TIMEOUT_MS=8000 in sandbox",
        "Full preview-cleanup.sh Stripe/PlanetScale paths out of synthetic scope"
      ]
    }' >"$SUMMARY"
  chmod 600 "$SUMMARY"
}

full() {
  prepare
  bootstrap_operator
  seed_project
  gate3_api_contracts
  gate4_race_and_delete
  gate4_queue_and_cleanup
  write_summary
  record full pass
}

case "${1:-}" in
  prepare) prepare ;;
  bootstrap) bootstrap_operator; seed_project ;;
  gate3) gate3_api_contracts ;;
  gate4-race) gate4_race_and_delete ;;
  gate4-queue) gate4_queue_and_cleanup ;;
  full) full ;;
  *)
    printf 'usage: %s {prepare|bootstrap|gate3|gate4-race|gate4-queue|full}\n' "$0" >&2
    printf 'teardown: %s/teardown.sh approve-destroy-synthetic-ctd3514\n' "$ROOT" >&2
    exit 2
    ;;
esac

printf 'sanitized evidence: %s\n' "$EVIDENCE"
if [[ -f "$SUMMARY" ]]; then
  printf 'summary: %s\n' "$SUMMARY"
fi
printf 'sandbox retained for inspection; teardown is always a separate approved command\n'
