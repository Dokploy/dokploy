# CTD-3513 encryption and rollback harness

This operator harness rehearses Dokploy's `v0.29.8` → pinned `v0.29.14` upgrade using synthetic data inside a dedicated Docker-in-Docker daemon. Dokploy receives only the nested daemon's `/var/run/docker.sock`; the OrbStack/host socket is never mounted into a Dokploy service.

## Safety boundary

- Never run this on a server or with live credentials.
- The outer container name must start with `ctd3513-`.
- Secrets and raw markers stay in `.state/` (gitignored, mode `0600`/`0700`).
- Evidence contains only hashes, lengths, the literal `enc:v1:` prefix, timestamps, and pass/fail states.
- The rehearsal never deploys to Hetzner, staging, previews, production, or a live registry account.
- Rollback and teardown are destructive **only inside the named synthetic sandbox** and require the exact argument `approve-destroy-synthetic-ctd3513`. Obtain operator approval before invoking either command.
- No failure trap tears resources down automatically. This preserves evidence and prevents an unapproved removal.

## Prerequisites

- macOS with OrbStack or another local Docker engine
- Bash 3.2 or newer, Docker, `curl`, `jq`, `openssl`, and `shasum`
- the exact current and pinned candidate images loaded into the host's local image store
- no service already using TCP port `35130`

The harness streams Dokploy images from the host into the nested daemon one at a time with `docker save | docker load`. It does not forward GHCR credentials into the sandbox.

Defaults:

```text
current:   dokploy-ctd:v0.29.8-ctd3f3a559-local
current ID: sha256:1c254fbe41054892cc7e64d14f0ccc97d4726670fe38020dbb2728ef6972063c
candidate: dokploy-ctd:v0.29.14-ctdd403b82-local
sandbox:   ctd3513-encryption
port:      35130
```

Build the exact current commit locally and tag the already verified candidate digest without pulling any credential into the sandbox:

```sh
context=ctd-harness/encryption-rollback/.state/ctd3513-encryption/current-build-context
mkdir -p "$context"
git archive 3f3a5593022ca90d9d1d2008b2b60fcbf207ef20 | tar -x -C "$context"
: >"$context/.env.production" # synthetic empty build input; never copy a live env file

docker network create ctd3513-build
docker run -d --name ctd3513-build-redis --network ctd3513-build \
  -p 127.0.0.1:6379:6379 redis:7-alpine

docker build --platform linux/amd64 --network host \
  --add-host dokploy-redis=127.0.0.1 \
  -t dokploy-ctd:v0.29.8-ctd3f3a559-local "$context"

docker tag \
  ghcr.io/budivoogt/dokploy@sha256:ae95f0d7e821fca4fb5f84eb1e5eb0bd61cdaddb4207dba1dcd0e4268b3c74c9 \
  dokploy-ctd:v0.29.14-ctdd403b82-local
```

Override these with `CTD3513_CURRENT_IMAGE`, `CTD3513_CANDIDATE_IMAGE`, `CTD3513_SANDBOX`, and `CTD3513_PORT`. A current-image override must also set `CTD3513_CURRENT_IMAGE_ID`; a candidate-image override must also set `CTD3513_CANDIDATE_DIGEST`. The harness verifies both host identities and the image IDs loaded into the nested daemon. Keep the sandbox name within the enforced `ctd3513-*` namespace.

## Rehearsal

Run the helper contract test first:

```sh
bash ctd-harness/encryption-rollback/test-harness.sh
```

Run focused experiments A and B:

```sh
bash ctd-harness/encryption-rollback/run.sh focused approve-destroy-synthetic-ctd3513
```

The approval permits retiring only the synthetic current-image task and nested image before streaming the candidate, keeping peak disk use bounded.

This sequence:

1. Creates a privileged outer `docker:29-dind` container and initializes only its nested Swarm.
2. Starts disposable Postgres and Redis services in the nested daemon.
3. Boots the exact current fork and writes a synthetic plaintext application environment through Dokploy's tRPC API.
4. Captures a pre-upgrade database/filesystem backup.
5. Upgrades to the pinned candidate with `ENCRYPTION_KEY_FILE` backed by a nested Docker secret.
6. Proves untouched plaintext remains plaintext, then rewrites through `application.saveEnvironment` and observes only `enc:v1:` metadata.
7. Proves restart readability, Better Auth secret separation, wrong-key failure/recovery, and missing-key failure/recovery.

Each phase can also be run separately (`prepare`, `seed`, `candidate`, `key-separation`, `key-failures`) to diagnose a retained sandbox.

After explicit approval for synthetic destructive operations, run experiment C:

```sh
bash ctd-harness/encryption-rollback/backup-restore.sh approve-destroy-synthetic-ctd3513
```

It calls the candidate's real `exportEncryptionKeys()` implementation, restores the encrypted database and exported keyring into a second candidate with different synthetic secrets, proves decryption, demonstrates that an image-only downgrade returns `enc:v1:` ciphertext, and performs a full pre-upgrade database/filesystem restore back to the current image.

The rollback script executes `exportEncryptionKeys()` from the installed `@dokploy/server` artifact inside the exact running candidate container; it does not reproduce AES or key derivation in the harness.

## Evidence review

```sh
jq . ctd-harness/encryption-rollback/.state/ctd3513-encryption/evidence.jsonl
```

Starting a fresh `prepare`/`focused` rehearsal rotates any prior evidence to `evidence.previous.<timestamp>.<pid>.jsonl`, so the current file can never inherit stale passes.

Expected phases include:

- `current-image`
- `candidate-image`
- `current-plaintext`
- `candidate-legacy-read`
- `lazy-write`
- `dedicated-key-restart`
- `auth-secret-rotated`
- `wrong-dedicated-key` / `correct-key-restored`
- `missing-dedicated-key` / `missing-key-restored`
- `restored-keyring`
- `image-only-downgrade`
- `full-preupgrade-restore`

Search logs only for fixed failure text; never retain raw logs without review:

```sh
docker exec ctd3513-encryption docker service logs dokploy 2>&1 \
  | grep -F 'Failed to decrypt an encrypted column' \
  | wc -l
```

## Teardown

Teardown removes the outer synthetic container and its Docker data volume, the temporary build Redis/network, and all local marker/credential/keyring/build-context files. It retains only the sanitized evidence directory.

After separate explicit approval:

```sh
bash ctd-harness/encryption-rollback/teardown.sh approve-destroy-synthetic-ctd3513
```

Verify independently:

```sh
! docker container inspect ctd3513-encryption >/dev/null 2>&1
! docker volume inspect ctd3513-encryption-docker >/dev/null 2>&1
```
