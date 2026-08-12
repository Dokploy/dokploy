# CTD-3514 API, preview, and queue compatibility harness

Synthetic Docker-in-Docker proof that the pinned `v0.29.14` candidate remains compatible with Contracko's Dokploy automation (Gate 3) and that preview teardown / queue / cleanup behavior holds (Gate 4).

Dokploy receives only the nested daemon's `/var/run/docker.sock`. The OrbStack/host socket is never mounted into Dokploy.

## Safety boundary

- Never run this on a server or with live credentials.
- Outer container name must start with `ctd3514-`.
- Secrets and raw markers stay in `.state/` (gitignored, mode `0600`/`0700`).
- Evidence contains only hashes, lengths, statuses, timings, and pass/fail — never credentials or env values.
- No Hetzner, staging, preview, production, live registry account, or live GitHub App access.
- Teardown requires the exact argument `approve-destroy-synthetic-ctd3514`.
- No failure trap tears resources down automatically.

## Prerequisites

- macOS with OrbStack or another local Docker engine
- Bash 3.2+, Docker, `curl`, `jq`, `openssl`, `shasum`, `python3`, `node` (for optional exact Contracko wait script)
- Pinned candidate loaded locally:

```sh
docker tag \
  ghcr.io/budivoogt/dokploy@sha256:ae95f0d7e821fca4fb5f84eb1e5eb0bd61cdaddb4207dba1dcd0e4268b3c74c9 \
  dokploy-ctd:v0.29.14-ctdd403b82-local
```

- Public synthetic workload image (default `nginx:alpine`) pullable on the host
- Free TCP port `35140`
- Optional: `CTD3514_CONTRACKO_ROOT` pointing at a Contracko checkout so exact `dokploy-preview.sh` / `wait-for-dokploy-deployment.mjs` paths run

Defaults:

```text
candidate: dokploy-ctd:v0.29.14-ctdd403b82-local
digest:    sha256:ae95f0d7e821fca4fb5f84eb1e5eb0bd61cdaddb4207dba1dcd0e4268b3c74c9
image ID:  sha256:02ae55741a50959165f45ce4072bd0a43a28583e979d92513572317a382276ad
sandbox:   ctd3514-api-preview-queue
port:      35140
```

## What is proven

### Gate 3 (API contracts)

REST shapes matching Contracko for:

- `project.one`
- `application.create` / `update` / `one` / `saveEnvironment` / `deploy` / `delete`
- `domain.create`
- `deployment.all`
- `previewDeployment.all`

Also checks that `application.one` returns decrypted `previewEnv` (marker hash) and does not echo synthetic provider secrets.

When `CTD3514_CONTRACKO_ROOT` is set:

- exact `scripts/deploy/wait-for-dokploy-deployment.mjs`
- exact `scripts/dokploy/dokploy-preview.sh down`

### Gate 4 (preview / queue / cleanup)

- Synthetic preview row + in-flight Swarm service deleted via `previewDeployment.delete`; service stays absent (no `#4203` resurrection window).
- `application.delete` removes child preview services.
- Failing deploy job does not prevent a later successful deploy (queue progress).
- Cleanup classifier keeps tracked preview service names and detects intentional orphans (mirrors `preview-cleanup.sh` keep/orphan decision).

Out of synthetic scope (documented, not failed):

- Live GitHub PR webhooks / Deployments API (covered by existing unit tests).
- Full `preview-cleanup.sh` end-to-end (requires Stripe + optional PlanetScale secrets).
- Hung-job watchdog body (unit-tested; sandbox sets `DEPLOYMENT_JOB_TIMEOUT_MS=8000`).

## Commands

Helper contract test (no Docker sandbox):

```sh
bash ctd-harness/api-preview-queue/test-harness.sh
```

Full proof:

```sh
# optional exact Contracko scripts
export CTD3514_CONTRACKO_ROOT=/path/to/contracko

bash ctd-harness/api-preview-queue/run.sh full
```

Phased:

```sh
bash ctd-harness/api-preview-queue/run.sh prepare
bash ctd-harness/api-preview-queue/run.sh bootstrap
bash ctd-harness/api-preview-queue/run.sh gate3
bash ctd-harness/api-preview-queue/run.sh gate4-race
bash ctd-harness/api-preview-queue/run.sh gate4-queue
```

Focused unit companions in the fork (run from `apps/dokploy`):

```sh
pnpm exec vitest --config __test__/vitest.config.ts \
  __test__/queues/deployments-queue.test.ts \
  __test__/queues/concurrency.test.ts \
  __test__/deploy/github-webhook-handler.test.ts \
  --run
```

## Evidence

```sh
jq . ctd-harness/api-preview-queue/.state/ctd3514-api-preview-queue/evidence.jsonl
jq . ctd-harness/api-preview-queue/.state/ctd3514-api-preview-queue/summary.json
```

## Teardown

After separate explicit approval:

```sh
bash ctd-harness/api-preview-queue/teardown.sh approve-destroy-synthetic-ctd3514
```

Verify:

```sh
! docker container inspect ctd3514-api-preview-queue >/dev/null 2>&1
! docker volume inspect ctd3514-api-preview-queue-docker >/dev/null 2>&1
```
