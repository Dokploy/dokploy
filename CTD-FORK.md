# Contracko Dokploy Fork

This fork of [Dokploy/dokploy](https://github.com/Dokploy/dokploy) powers Contracko's self-hosted preview and staging infrastructure on Hetzner. Keep customizations minimal and disposable — when upstream ships equivalent features, rip ours out.

## Build and deploy

CI builds, humans deploy. GitHub Actions never reaches production; it only publishes images.

### 1. CI (automatic on push)

`.github/workflows/ctd-image.yml` builds a multi-arch image on every push to `feat/*`, `fix/*`, or `canary-ctd`, and pushes it to GHCR.

Two tags per build:

- **Pinned:** `ghcr.io/budivoogt/dokploy:vX.Y.Z-ctd<sha7>` — use this for rollouts. Immutable.
- **Rolling:** `ghcr.io/budivoogt/dokploy:<branch-slug>` — tracks the branch tip.

Required repo secret: `GHCR_PAT`, a classic PAT with `write:packages` and `read:packages` on the `budivoogt` namespace.

### 2. Deploy (manual, local)

```sh
./bin/deploy-ctd.sh vX.Y.Z-ctd<sha7>
```

The script SSHes to the Hetzner host over Tailscale and runs `docker service update` on the `dokploy` swarm service. Rollback is the same command with a previous tag.

Environment overrides:

- `CTD_DOKPLOY_HOST` — Tailscale IP, defaults to `100.71.164.32`
- `CTD_DOKPLOY_USER` — SSH user, defaults to `root`
- `CTD_DOKPLOY_SERVICE` — swarm service name, defaults to `dokploy`

### 3. GHCR package visibility

First-time image pushes land as **private** GHCR packages. Either:

- Flip the package to public in GitHub (`budivoogt/dokploy` → Package settings → Change visibility), or
- Run `docker login ghcr.io` once on the Hetzner host using a PAT with `read:packages`, so swarm can pull with `--with-registry-auth`.

The deploy script already passes `--with-registry-auth`, so either path works.

## Branch conventions

- `canary` — tracks upstream, don't commit here directly.
- `fix/preview-teardown-race` — current long-lived fork patch stack on top of upstream canary. New features branch off this.
- `feat/*`, `fix/*` — per-change branches. PR against `fix/preview-teardown-race`.

## Rebasing on upstream

When upstream cuts a new release worth taking:

```sh
git fetch upstream
git checkout fix/preview-teardown-race
git rebase upstream/canary
# resolve conflicts in packages/server/src/services/application.ts
# and apps/dokploy/pages/api/deploy/github.ts, the usual suspects
git push --force-with-lease origin fix/preview-teardown-race
```

Then rebuild and redeploy via the steps above.

## Active fork customizations

| Area | Files | Why |
|---|---|---|
| Preview teardown race fixes | `packages/server/src/services/application.ts`, related | Upstream lost preview deployments under teardown+redeploy races |
| GitHub Deployments API | `packages/server/src/services/github-deployment.ts`, `application.ts`, `apps/dokploy/pages/api/deploy/github.ts` | Upstream only writes commit statuses; we want the "This branch is being deployed" panel populated |
| GitHub App manifest | `apps/dokploy/components/dashboard/settings/git/github/add-github-provider.tsx` | Adds `deployments: write` for the above |
| Fork CI | `.github/workflows/ctd-image.yml` | Upstream workflows target their Docker Hub namespace; ours pushes to GHCR |

## When to remove this file

When upstream merges equivalents of all the rows above, delete this file, delete `bin/deploy-ctd.sh`, delete `.github/workflows/ctd-image.yml`, and go back to upstream's image + update flow.
