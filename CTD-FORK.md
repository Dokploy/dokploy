# Contracko Dokploy Fork

This fork of [Dokploy/dokploy](https://github.com/Dokploy/dokploy) powers Contracko's self-hosted preview and staging infrastructure on Hetzner. Keep customizations minimal and disposable — when upstream ships equivalent features, rip ours out.

## Build and deploy

CI builds, humans deploy. GitHub Actions never reaches production; it only publishes images.

### 1. CI (manual publication)

`.github/workflows/ctd-image.yml` builds and publishes an amd64 image only through an explicit `workflow_dispatch`. Ordinary pushes and pull requests cannot publish candidates.

Two tags are published per approved run:

- **Pinned:** `ghcr.io/budivoogt/dokploy:vX.Y.Z-ctd<sha7>`, use its registry digest for rollouts.
- **Rolling:** `ghcr.io/budivoogt/dokploy:<branch-slug>`, tracks the dispatched branch tip.

The build embeds the candidate tag as `RELEASE_TAG` and records OCI version and revision labels. Required repo secret: `GHCR_PAT`, a classic PAT with `write:packages` and `read:packages` on the `budivoogt` namespace.

### 2. Deploy (manual, local)

```sh
./bin/deploy-ctd.sh vX.Y.Z-ctd<sha7>
```

The script accepts pinned CTD tags only, SSHes to the Hetzner host over Tailscale, and updates both the `dokploy` swarm image and `RELEASE_TAG`. Rollback is the same command with a previous pinned tag.

Environment overrides:

- `CTD_DOKPLOY_HOST` — SSH target, defaults to `contracko-01` (Tailscale MagicDNS alias)
- `CTD_DOKPLOY_SERVICE` — swarm service name, defaults to `dokploy`

### 3. GHCR package visibility

First-time image pushes land as **private** GHCR packages. Either:

- Flip the package to public in GitHub (`budivoogt/dokploy` → Package settings → Change visibility), or
- Run `docker login ghcr.io` once on the Hetzner host using a PAT with `read:packages`, so swarm can pull with `--with-registry-auth`.

The deploy script already passes `--with-registry-auth`, so either path works.

## Branch conventions

- `canary` tracks upstream; do not commit there directly.
- `fix/preview-teardown-race-v0.29.8` is the pre-upgrade source stack retained for provenance.
- `ctd-3512-dokploy-v02914-upgrade-slice-1-rebase-fork-and-publish` is the local `v0.29.14` candidate branch until the upgrade PR is reviewed.
- Use ticket branches for fork work so an ordinary push cannot match a publication trigger.

## Rebasing on upstream

When upstream cuts a new release worth taking:

```sh
git fetch upstream
git switch -c <ticket-branch> <current-fork-tip>
git rebase --onto vX.Y.Z <previous-upstream-tag> <ticket-branch>
# Trace every conflict against upstream security intent and retained fork intent.
# Publish or push only after the candidate gates and explicit approval.
```

Then rebuild and redeploy via the steps above.

## Active fork customizations

| Area | Files | Why |
|---|---|---|
| Preview teardown race fixes | `packages/server/src/services/application.ts`, related | Upstream lost preview deployments under teardown+redeploy races |
| GitHub Deployments API | `packages/server/src/services/github-deployment.ts`, `application.ts`, `apps/dokploy/pages/api/deploy/github.ts` | Upstream only writes commit statuses; we want the "This branch is being deployed" panel populated for deploys and redeploys |
| GitHub App manifest | `apps/dokploy/components/dashboard/settings/git/github/add-github-provider.tsx` | Adds `deployments: write` for the above |
| Deploy secret hygiene | `packages/server/src/utils/process/secrets.ts`, `execAsync.ts`, provider/build/registry helpers | Keeps deploy tokens and registry passwords out of process arguments and stages temp files on the actual local or SSH execution host |
| Hung-job recovery | `apps/dokploy/server/queues/deployments-queue.ts` | Adds a bounded watchdog and status reset on top of upstream's per-server in-memory concurrency model |
| Traefik TLS without a resolver | `packages/server/src/utils/traefik/domain.ts` | Emits `tls: {}` for custom certificate handling without enabling Let's Encrypt |
| Fork CI and release identity | `.github/workflows/ctd-image.yml`, `Dockerfile`, `bin/deploy-ctd.sh` | Keeps GHCR publication manual and aligns image, package, API, OCI, and runtime release metadata |
| Host Traefik config | `ctd-host/` | Versioned backup of hand-managed `/etc/dokploy/traefik/dynamic/` files on `contracko-01`, including the marketing-site `inFlightReq` overload cap; see `ctd-host/README.md` |

## Local encryption and rollback rehearsal

Before a candidate with encrypted database columns reaches a shared host, run the synthetic Docker-in-Docker harness in [`ctd-harness/encryption-rollback/`](ctd-harness/encryption-rollback/README.md). It keeps Dokploy on a nested Docker socket, exercises the current and candidate images against disposable Postgres and Redis, records only sanitized marker evidence, and requires explicit approval for synthetic rollback and teardown operations.

## When to remove this file

When upstream merges equivalents of all the rows above, delete this file, delete `bin/deploy-ctd.sh`, delete `.github/workflows/ctd-image.yml`, and go back to upstream's image + update flow.
