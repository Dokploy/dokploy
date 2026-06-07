# Fleet custom Dokploy — `feat/native-passkeys` (v0.29.8)

Deploy the iyobo fork (`feat/native-passkeys`) to the production fleet Droplet instead of upstream `dokploy/dokploy`.

## Execution status

| Step | Status | Notes |
|------|--------|-------|
| Plan written | done | This file |
| Fix build (esbuild + `@better-auth/utils`) | done | `Dockerfile`, `apps/dokploy/package.json` |
| Set `BETTER_AUTH_URL` in build env | done | `https://fleet.opsific.com` |
| Build `linux/amd64` image | done | digest `sha256:4fd470bea287…` |
| Push to DOCR | done | `registry.digitalocean.com/opsific-fleet/dokploy:v0.29.8-passkeys` |
| DOCR login on Droplet | done | `/root/.docker/config.json` on manager |
| `docker service update` dokploy | done | Converged 1/1 Running |
| Post-deploy verify | done | Health 204; `Running DokployVersion: v0.29.8` |

## Target environment

| Item | Value |
|------|--------|
| Droplet | `dokploy-manager-1` — `68.183.149.141` |
| Public URL | `https://fleet.opsific.com` |
| Current image | `registry.digitalocean.com/opsific-fleet/dokploy:v0.29.8-passkeys` |
| Target image | `registry.digitalocean.com/opsific-fleet/dokploy:v0.29.8-passkeys` |
| Branch | `feat/native-passkeys` @ `v0.29.8` |
| Registry | `opsific-fleet` (`registry.digitalocean.com`) |

## Why custom image

Upstream Docker Hub `dokploy/dokploy` does not include:

- Native WebAuthn passkeys (`@better-auth/passkey`)
- Migration `0172_huge_next_avengers.sql` (passkey table)
- Passkey UI on login + Profile → Manage passkeys

## Build prerequisites

```bash
# From repo root — CI copies example; no BETTER_AUTH_URL required if Server → Host is set
cp apps/dokploy/.env.production.example .env.production
```

Root `.env.production` is copied into the image as `.env` (see `Dockerfile` line 43).

## Build and push (local, Apple Silicon → amd64)

```bash
GIT_SHA=$(git rev-parse --short HEAD)
TAG="v0.29.8-passkeys"
IMAGE="registry.digitalocean.com/opsific-fleet/dokploy:${TAG}"

doctl registry login
docker build --platform linux/amd64 -t "${IMAGE}" -f Dockerfile .
docker push "${IMAGE}"
```

## Fleet cutover (on Droplet)

```bash
# Authenticate Swarm node to DOCR
doctl registry docker-config | ssh root@68.183.149.141 'mkdir -p /root/.docker && cat > /root/.docker/config.json'

# Rolling update
ssh root@68.183.149.141 docker service update dokploy \
  --image registry.digitalocean.com/opsific-fleet/dokploy:v0.29.8-passkeys \
  --env-rm RELEASE_TAG \
  --env-add RELEASE_TAG=v0.29.8-passkeys \
  --with-registry-auth
```

Confirm **Settings → Server** Host is `fleet.opsific.com` with HTTPS enabled (same as today). Do **not** set `BETTER_AUTH_URL` unless you want env to override the UI.

`--with-registry-auth` passes DOCR credentials to Swarm workers for the pull.

## Post-deploy verification

1. `curl -sI https://fleet.opsific.com/api/trpc/settings.health` → `204`
2. Sign in at `https://fleet.opsific.com` (email/password)
3. Settings → Profile → **Manage passkeys** visible
4. Optional: register a passkey, sign out, **Sign in with passkey**
5. On Droplet: confirm migration ran — `docker service logs dokploy --tail 50` shows migration success

## Rollback

```bash
ssh root@68.183.149.141 docker service update dokploy \
  --image dokploy/dokploy:v0.29.5 \
  --env-rm RELEASE_TAG \
  --env-add RELEASE_TAG=v0.29.5
```

Passkeys registered under the custom build remain in Postgres but are unused until the custom image is restored.

## Security implications

- **Medium — custom image supply chain**: Fleet control plane runs a private build, not upstream digest. Mitigation: tag includes version + branch; keep image in DOCR with access controls.
- **Low — canonical URL**: Passkeys use **Settings → Server** Host + HTTPS by default. Ensure `https://fleet.opsific.com` matches the browser URL; optional `BETTER_AUTH_URL` override not required for this fleet.
- **Low — in-app auto-update**: Set `RELEASE_TAG=v0.29.8-passkeys` so Dokploy does not pull upstream `latest` from Docker Hub.

## Replay notes

1. Checkout `feat/native-passkeys`, confirm `apps/dokploy/package.json` version.
2. Confirm **Settings → Server** Host + HTTPS on fleet (or set optional `BETTER_AUTH_URL` only if env must override UI).
3. Build amd64, push to `opsific-fleet/dokploy:<tag>`.
4. `docker service update dokploy` on `dokploy-manager-1` with `--with-registry-auth`.
5. Verify health + passkey UI.
