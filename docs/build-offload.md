# How prod Dokploy offloads builds to devino-third

Set up 2026-10-07. This document describes the live arrangement and how to operate
it. It covers where builds run and how images reach the serving host. The build
policy itself (build-once, exclusions, rollback to digest) is in
[build-once-rollout-runbook.md](build-once-rollout-runbook.md).

Secrets: nothing here contains a password, token or key. The registry password is
referred to only as the Dokploy registry credentials (stored on the registry row).

---

## 1. The rule

Builds must not run on devino-first (prod, which hosts all customer services).
Every build happens on a box that hosts no customer services.

## 2. Build server

devino-third (LAN 192.168.2.229; 32 threads, 125 GiB RAM, 3.6 TB disk) is
registered in Dokploy as a server of type `build`, id `saZ6E_4nv0Ue2nUdm2GOi`. It
has docker, buildx, nixpacks, railpack and pack installed.

A second build server row, "Main Build Server", is devino-second (192.168.2.217).
It is unused on purpose: devino-second is the k3s control plane and runs the
render daemon.

## 3. Registry path

- Dokploy registry id `24DULWxAFrk80EcWleSFb`, URL `localhost:5000`. It is a
  registry:2 container on devino-first, bound to 127.0.0.1:5000 with basic auth.
- The registry username is `registry.devino.ca`, so images are
  `localhost:5000/registry.devino.ca/<appName>:latest`.
- The public hostname registry.devino.ca goes through Cloudflare and does not reach
  the registry. Cloudflare's request-size limits would break layer uploads anyway.

### 3.1 The tunnel

On devino-third, the systemd unit
`/etc/systemd/system/dokploy-registry-tunnel.service` runs:

```
ssh -N -T -i /root/.ssh/dokploy-registry-tunnel -o IdentitiesOnly=yes -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=yes -L 127.0.0.1:5000:127.0.0.1:5000 root@192.168.2.16
```

with `Restart=always` and `RestartSec=5`.

On devino-first, the key is restricted in authorized_keys with
`restrict,port-forwarding,permitopen="127.0.0.1:5000",command="/bin/false"`. It can
forward that one port and nothing else.

The result is that `localhost:5000` means the same registry on both hosts. Docker
allows plain-HTTP localhost registries, so neither daemon needs an
insecure-registries change or a restart.

### 3.2 Health checks

On devino-third:

```
systemctl is-active dokploy-registry-tunnel
```

On both hosts (expect 401, the auth challenge):

```
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000/v2/
```

### 3.3 Rotating the key

Generate a new key, swap the line in authorized_keys on devino-first, then restart
the unit on devino-third.

## 4. Applications

Every locally served application with a git source (github, git, gitlab, gitea,
bitbucket) has `buildServerId` = devino-third and `buildRegistryId` = the
localhost:5000 registry. That is 98 apps, dev and prod.

Dokploy then clones and builds on devino-third, runs docker login, tag and push
there, and the swarm service on devino-first pulls the image with registry auth.

- Docker-image apps are not built, so they are unchanged.
- The 4 Syncara apps are served on their own AWS server ("Syncara PROD Server") and
  build there. They are left alone, because AWS cannot reach the tunnel.
- The rollout was done by a DB update. The prior values (all NULL) are logged in
  `/root/build-offload-20261007/applications.log` on devino-first.
- To revert one app, set both columns back to NULL. In the UI that is the app's
  Advanced, Build Server card.
- Swarm services use start-first updates with failure action rollback, so a failed
  pull never takes a running app down.

## 5. Composes

Fork PR #290 (released in v0.30.8-community.9, migration 0208) adds compose
`buildServerId` and `buildRegistryId`, set from the compose Advanced tab's Build
Server card. Both must be set together, and the server must be of type build.

Flow:

1. The build server clones, writes compose, .env and file mounts, and runs
   `docker compose build`.
2. It pushes each built service as `<registry>/<appName>-<service>:dpl-<deploymentId>`
   and `:latest`. Services that share an image are pushed once.
3. The serving host pulls those refs and runs `up -d --no-build` with a generated
   `docker-compose.dokploy-build.yml` override, or
   `docker stack deploy -c file -c override --with-registry-auth`.
4. A failed build, push or pull restores the previous release.

The serving host still clones the repo, for bind mounts and configs.

Limits:

- Rebuild re-clones on the build server.
- Cancelling does not stop a remote build.
- Multi-node swarm needs the tunnel on each node.
- Build contexts outside the repo fail.
- Old `dpl-` tags are not garbage-collected.

46 of the 94 composes have `build:` sections. They are enabled per compose; prior
values are logged in `/root/build-offload-20261007/compose.log`.

Rollout on 2026-10-07/08:

- First, postify-compose-dev-bshqct was enabled and deployed on its own (deployment
  23:53Z to 23:59Z). Its five services were built and pushed on devino-third, then
  pulled and run on devino-first as
  `localhost:5000/registry.devino.ca/postify-compose-dev-bshqct-<service>:dpl-<deploymentId>`.
- 00:00Z: 44 more composes were enabled, 45 in total. Their next deploy builds on
  devino-third. A second test deploy, of notifly-dev-wfg8rh, ran its five built
  services from `dpl-` images.
- uprank-efcpwb had a custom command (start postgres, run migrate from the `ops`
  profile, then `up --build`), which the build-server path rejects. uprank PR #88
  made `migrate` part of the `app` and `workers` profiles, and made web and the
  workers depend on it with `service_completed_successfully`. The custom command
  was then cleared (the old one is saved in
  `/root/build-offload-20261007/uprank-prior-command.txt`) and the build server
  was set. That makes 46 of 46.
- A compose with a custom command cannot use a build server. Express any extra
  steps as compose dependencies instead.
- Two composes (compose-bypass-optical-firewall-n4knx9 and
  compose-synthesize-1080p-hard-drive-ocxesi) have never been cloned, so whether they
  have `build:` sections is unknown. Check and enable them after their first clone.

To revert one compose, set `buildServerId` and `buildRegistryId` back to NULL.

## 6. Concurrency

Queue partitions follow the serving server. Locally served apps and composes share
the LOCAL partition, whose concurrency is `webServerSettings.buildsConcurrency`
(Settings, Server, builds concurrency). The queue reads it on every pick, so a
change applies without a restart. A build server's own buildsConcurrency is not
read.

History: 1 to 2 on 2026-10-07 23:42Z (while composes still built on devino-first),
then 2 to 3 on 2026-10-08 00:03Z, once compose offload was live.

At 3, devino-third (32 threads, 125 GiB) showed:

- CPU pressure: some avg10 about 4%
- IO pressure: full avg10 about 4%
- the slot controller: psi_full60 0.00, CPU 30 to 50%, about 80 GiB available

Raise it further only while CPU pressure, IO full pressure and available memory
stay in that range with CI busy. Log every change (time, prior value, new value) in
`/root/build-offload-20261007/concurrency.log`.

## 7. Sharing devino-third with CI

devino-third is also an ARC runner node. See the DevinoSolutions/runner-infra
runbook, section "devino-third shares the node with Dokploy builds (2026-10-07)",
PR #68.

runner-infra #68 lowered the CI footprint, all in `/etc/default/ci-slot-controller`:

- runner ceiling (overlay maxRunners = RUNNER_SLOTS_MAX): 14 to 10
- floor (RUNNER_SLOTS_MIN): 8 to 6
- large slots: 2 to 1

The floor and maxRunners must move together.

Watch the `io_full60` and `lowered-first` lines in `/var/log/ci-slot-controller.log`.
If CI sits pinned at the floor, the carve-out is too small.

## 8. Post-deploy stability check

PR #291: the swarm stability check now waits up to 10 minutes while the new task is
pulling its image, then observes for 30 s after it starts running. Before this,
large images pulled from the registry produced false "Container did not stay
running" errors.

## 9. Security notes

- Dokploy (upstream behaviour) passes the whole build script as one process argument
  on the build host. That script includes the git clone token, the env file (base64)
  and the registry login. Anything able to read host process arguments on
  devino-third can see them. CI runner pods have their own PID namespace, so a
  runner with hostPID or the host docker socket could read them.
- Operators must never print process arguments (`ps aux`, `ps -o args`,
  `/proc/*/cmdline`) on Dokploy hosts. Use the deployment log under
  `/etc/dokploy/logs/<app>/` on the build server instead.
- Build logs for offloaded deploys live on the build server; reading deployment logs
  via the API may come back empty.

## 10. Operator rule

Never deploy or restart Dokploy itself on devino-first while the deploy queue has
jobs. Check `deployment.queueList` (and the `deployment_queue_job` table) and wait
for it to drain.
