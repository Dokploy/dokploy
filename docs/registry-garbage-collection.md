# Registry garbage collection (runbook, planning only)

This runbook describes how to reclaim storage in the private Docker registry on prod
(devino-first, `localhost:5000`). It was written on 2026-10-08. **No GC has been run
and no host was changed while writing it.** Treat every command below as a plan to
review before use.

Secrets: this document contains no password, key or hash. Never print env values,
passwords, S3 keys or process arguments while following it.

---

## 1. Why this is needed

The registry is the Dokploy raw compose `dokploy-registry-registry-lqwgvq` (composeId
`UpQegvQO7JohIWIFTuLFE`), container `dokploy-registry-registry-lqwgvq-registry-1`,
image `registry:2` (distribution 2.8.3), bound to 127.0.0.1:5000, with S3 storage and
htpasswd auth (user `dokploy`, see `docs/registry-password-rotation.md`).

Builds run on devino-third and push through an SSH tunnel to `localhost:5000`.
Composes push `dpl-<deploymentId>` tags. Since v0.30.8-community.10 (#294), Dokploy
deletes old `dpl-*` manifests after a compose deploy and keeps 5 distinct digests
(`BUILD_REGISTRY_KEEP_DPL_TAGS`).

Deleting a manifest frees **no storage**. The manifest link is removed, but the
layer blobs stay in S3 until `registry garbage-collect` runs. Without GC the bucket
only grows.

## 2. Facts: confirmed and unconfirmed

Confirmed means read in the distribution docs through Context7
(`/distribution/distribution`, files `docs/content/about/garbage-collection.md`,
`configuration.md`, `architecture.md`) or inspected read-only on devino-first on
2026-10-08.

| Fact | Status | Source |
| --- | --- | --- |
| Command is `registry garbage-collect [--dry-run] [--delete-untagged] [--quiet] /path/to/config.yml` | Confirmed | garbage-collection.md |
| `--dry-run` prints mark and sweep progress without removing data; info log level shows what is eligible | Confirmed | garbage-collection.md |
| `--delete-untagged` deletes manifests not referenced by a tag | `--delete-untagged` confirmed; a `-m` short form is **unconfirmed** (the docs I queried do not mention it) | garbage-collection.md |
| Known bugs of `--delete-untagged` with multi-arch (index) manifests in 2.8.x: a child manifest that is only referenced by an index, not by a tag, can be treated as untagged and deleted, which breaks the index | **Unconfirmed** (from memory of upstream issues; not found in the docs I could query). Do not use the flag until verified. See section 6.2 | none |
| `storage.maintenance.readonly.enabled: true` blocks client writes, and the docs say it exists so GC can run | Confirmed | configuration.md |
| Read-only mode needs a restart: "the registry should be restarted with readonly's `enabled` set to true", then restarted again after GC | Confirmed (docs). No hot reload is documented. Note that htpasswd does hot reload, config does not | configuration.md |
| Any config option can be overridden by an env var named `REGISTRY_` plus the path with `_` for each level, so `REGISTRY_STORAGE_MAINTENANCE_READONLY_ENABLED=true` | Confirmed for the naming rule. The docs warn that overriding whole sections with env vars is not recommended, and this container already sets `REGISTRY_STORAGE` (the driver name). That this combination works is **unconfirmed** until tested on a throwaway registry | configuration.md |
| The registry is eventually consistent by design and relies on digest verification and write-once manifests | Confirmed | architecture.md |
| A push during GC can lose a blob uploaded during the mark phase | Given in the task brief; consistent with the upstream guidance to make the registry read-only or stop it | brief |
| Cost and time of the S3 mark walk (number of LIST and GET calls, minutes per 1000 manifests) | **Unconfirmed.** The mark phase enumerates every repository, tag and manifest and reads each manifest from S3, so cost grows with the number of manifests, not with bytes. Measure it with the dry-run (section 5) | none |
| S3 read-after-write consistency | **Unconfirmed for this endpoint.** AWS S3 is strongly consistent since December 2020. The bucket endpoint here (`REGISTRY_STORAGE_S3_REGIONENDPOINT` is set, with path-style) may be a different S3-compatible provider. Check which one it is | none |
| Container mounts: bind `registry.password` to `/auth/registry.password`, and an anonymous docker volume at `/var/lib/registry` | Confirmed (inspect) | devino-first |
| Restart policy `unless-stopped`; `StartedAt` 2026-09-12T05:19:21Z | Confirmed (inspect) | devino-first |
| Env var names present: `REGISTRY_STORAGE`, `REGISTRY_STORAGE_S3_*` (BUCKET, REGION, REGIONENDPOINT, FORCEPATHSTYLE, CHUNKSIZE, ACCESSKEY, SECRETKEY), `REGISTRY_STORAGE_DELETE_ENABLED`, `REGISTRY_AUTH*`, `REGISTRY_HTTP_SECRET`, `REGISTRY_HEALTH_STORAGEDRIVER_ENABLED`. No `MAINTENANCE` var yet | Confirmed (names only) | devino-first |
| S3 bucket versioning status | **To check** (section 8) | none |

## 3. Preconditions gate

All of these must be true at the same moment, and must stay true until the registry
is back in read-write mode. If the gate cannot hold, pause builds first (3.5).

1. **The deploy queue is empty.** The `deployment_queue_job` table has zero rows, and
   the MCP `deployment-queueList` agrees. The hard rule applies: never restart
   Dokploy while the queue is non-empty. This runbook does not restart Dokploy, but
   a recreate of the registry compose through Dokploy is a deploy and goes through
   the same queue.
2. **No deployment is running.** No row in `deployment` has `status = 'running'`.
3. **No build or push process on devino-first or devino-third.** Check with
   `ps -eo comm` only, on both hosts, and look for `docker`, `buildx`,
   `docker-buildx`, `dokploy` build wrappers and `ssh` tunnel traffic. Never use
   `ps aux`, `ps -ef`, `ps -eo args` or read `/proc/*/cmdline`. Build commands carry
   tokens, base64 `.env` content and the registry password.
4. **No push is in flight.** The registry log should show no `PUT`, `PATCH` or `POST`
   on `/v2/.../blobs/uploads/` in the last few minutes
   (`docker logs --since 5m <container>`, do not print env).
5. **Pause builds if the gate cannot hold.** Builds start when someone clicks deploy,
   a webhook fires, or a schedule runs. To keep the gate closed for the GC window
   (about 30 to 60 minutes, see section 9):
   - announce the window to everyone who deploys;
   - disable auto-deploy webhooks for the window, or run GC at a time when none fire;
   - on devino-third, set the server's builds concurrency to 0 or stop new builds if
     Dokploy offers that (MCP `server-updateBuildsConcurrency`). **Unconfirmed**
     that 0 is accepted; check before relying on it;
   - re-check items 1 to 4 immediately before the registry goes read-only.

Do not start if any item fails. Do not "just wait for the job to finish" without
re-checking the whole gate.

## 4. Blocking pushes during GC

Two options.

### 4.1 Read-only mode (recommended)

Set `REGISTRY_STORAGE_MAINTENANCE_READONLY_ENABLED=true` on the registry container
and recreate the container (the config is read at startup, see section 2).

- **Pulls keep working.** Swarm services with `localhost:5000/...` images pull from
  the registry when a task restarts, rolls or is rescheduled. Read-only mode serves
  them as normal.
- **Pushes get an error** (HTTP 4xx, "read-only" style message). A build that starts
  during the window fails at the push step. Nothing is corrupted.
- **Short outage on the recreate**, twice (into read-only, then back). Expect a few
  seconds with port 5000 refused. A swarm task that restarts in those seconds can
  fail its pull and retry.
- Healthcheck: `REGISTRY_HEALTH_STORAGEDRIVER_ENABLED` is already set, so the
  storage health check stays in place.

How to recreate: the compose is Dokploy-managed. Two ways.

- **Through Dokploy**: add the env var to the compose's environment and redeploy.
  This is a deploy, so it must pass the gate in section 3 and goes through the queue.
  A redeploy also rewrites the htpasswd file from the mount row (kept in sync since
  the rotation, check by md5 first, see the password-rotation doc, section 3).
- **By hand on devino-first**, from `/etc/dokploy/compose/dokploy-registry-registry-lqwgvq/`:
  `docker compose up -d --force-recreate` after adding the variable to that compose
  file's environment. This bypasses the queue, so the gate must hold manually. A later
  Dokploy redeploy will overwrite a hand edit, which is what we want for the revert.

Either way, record the compose file and env state before and after (names only).

### 4.2 Stop the registry

`docker stop` the container for the whole GC. Simpler, no config change, but
**pulls fail for the whole window**. Any swarm service restart or reschedule during
that time cannot pull its image, and a failed pull leaves the service down. With
about 98 apps and 51 composes on the swarm, one restart during 30 to 60 minutes is
plausible. The GC itself needs the registry config file and S3 access, not a running
server, so this works, but the pull impact makes it the fallback only.

Note that GC reads the same S3 bucket either way. With option 4.1, run it with
`docker exec` in the read-only container. With option 4.2, use a one-off
`docker run --rm` of the same image with the same S3 env (without printing values).

## 5. Dry-run first

With the registry read-only (4.1), run:

```
docker exec dokploy-registry-registry-lqwgvq-registry-1 \
  registry garbage-collect --dry-run /etc/docker/registry/config.yml
```

`/etc/docker/registry/config.yml` is the default config path in the `registry:2`
image. **Unconfirmed**; check the path in the container filesystem
(`docker exec ... ls /etc/docker/registry`). Env overrides (S3 settings) apply to
this process because `docker exec` inherits the container env. **Unconfirmed**
for `garbage-collect`; the dry-run shows it quickly: if it cannot reach S3, it
fails early.

Save the output to a file (`> /root/gc-dryrun-<date>.log 2>&1`). Do not run it with
`--quiet`. Info-level output is needed.

### 5.1 Reading the output

From the docs, the output has:

- one line per repository (`hello-world`);
- `repo: marking manifest sha256:...`, `marking blob`, `marking configuration`
  lines for everything reachable;
- a summary `N blobs marked, M blobs eligible for deletion`;
- one `blob eligible for deletion: sha256:...` line per candidate.

What to check:

- **Every repo you expect is listed.** All `registry.devino.ca/<appName>` repos
  appear. A missing repo means its blobs will be swept. If a repo is missing, stop.
- **The `marking manifest` lines include the 5 kept `dpl-*` digests per compose repo
  and `:latest` for apps.** If the kept set looks smaller than expected, stop and look
  before running for real.
- **`M` is plausible**: a large `M` is expected the first time (every old image's
  layers). If `M` is 0, deletes did not happen or `REGISTRY_STORAGE_DELETE_ENABLED`
  is off. If `M` is more than `N`, check why before going on.
- No `error` lines. Any S3 error in a dry-run is a stop.

### 5.2 Estimating reclaimable space

The dry-run prints digests, not sizes. To estimate bytes:

1. Take the `blob eligible for deletion` digests.
2. Get the size of each object under `docker/registry/v2/blobs/sha256/<2-char>/<digest>/data`
   in the bucket with the provider's tooling (for example `rclone size` with a filter
   file, or `aws s3api head-object`), reading the credentials the way Dokploy already
   does for its S3 destinations. Never print them.
3. Sum the sizes. Compare with the bucket's total size to get the percentage.

If the provider shows a per-prefix size, a cheaper estimate is bucket size now versus
the expected size of the kept images.

Record the dry-run time. It is also the best estimate of the real run's mark phase,
because the real run does the same walk before it sweeps (cost and time per section 2:
unconfirmed until measured).

## 6. The run

### 6.1 Procedure

1. Pass the gate (section 3).
2. Back up or confirm the recovery path (section 8). **If there is no recovery path,
   stop.**
3. Put the registry in read-only mode (4.1). Check that a push now fails:
   `docker push` of a tiny throwaway tag from devino-first is not needed; an
   unauthenticated check is enough: `GET /v2/` still returns 401, and the container
   `Env` names include the maintenance variable.
4. Run the dry-run (section 5), review, and approve.
5. Re-check the gate (section 3, items 1 to 4).
6. Run for real:

   ```
   docker exec dokploy-registry-registry-lqwgvq-registry-1 \
     registry garbage-collect /etc/docker/registry/config.yml \
     > /root/gc-run-<date>.log 2>&1
   ```

   Do **not** add `--delete-untagged` the first time (6.2).
7. Check the summary line and that the log has no `error` lines.
8. Verify (section 7), then return to read-write.

### 6.2 About `--delete-untagged` (`-m`)

Do not use it in the first run. The task here is to free blobs of manifests that
Dokploy already deleted by API, and plain GC does that. `--delete-untagged` is for
manifests nobody referenced by a tag and, with multi-arch index manifests in 2.8.x,
is reported to delete child manifests that are only referenced by the index
(**unconfirmed**, see section 2). Our images are mostly single-arch from the
build server, but `contrabot` and other images that come from a buildx multi-platform
build may be indexes.

If the dry-run with the flag is wanted later, run it only as a dry-run, and compare
its `eligible` list with the plain dry-run. Any manifest that appears only in the
`--delete-untagged` list must be understood before it is used for real.

### 6.3 Aborting mid-run

- GC has two phases: mark (read only), then sweep (delete). Killing it **during mark**
  (Ctrl-C, `docker exec` closed, container stopped) changes nothing. Re-run later.
- Killing it **during sweep** leaves a partly swept bucket. Blobs that were already
  deleted are gone. The registry is not corrupted, because only unreferenced blobs
  are deleted, but a re-run is needed to finish, and it is safe to re-run. The one
  risk is a push during that window, which read-only mode prevents. Keep the registry
  read-only until a full run completes or the state is verified.
- If the `docker exec` shell dies (SSH drop), the process in the container keeps
  running. Run it under `nohup` or `docker exec -d` with output to a file, and check
  with `ps -eo comm` inside the host, never `ps aux`.
- To stop on purpose: `docker exec` a `kill` on the GC process by PID found with
  `ps -eo pid,comm` (no args). Then verify (section 7) before reopening.

## 7. Verification

Before going back to read-write:

1. **Registry health.** `GET /v2/` with the `dokploy` credentials returns 200;
   anonymous returns 401. The container is up.
2. **Pull a kept digest for a few repos.** Choose at least three: one swarm app
   (`:latest`), one compose with `dpl-*` tags (a kept digest and the newest), and one
   that is multi-arch if any. For each, pull **by digest** from devino-first
   (`docker pull localhost:5000/registry.devino.ca/<name>@sha256:...`). A manifest
   `HEAD` is not enough; a pull fetches every layer, which is what GC could have
   broken. Remove the pulled test images afterward only if they were not already
   present (check first).
3. **Spot-check a deleted `dpl-*` tag** now returns 404, as expected.
4. Look at the registry log for errors (`docker logs --since 30m`), names and status
   lines only.

Then return to read-write:

1. Remove the maintenance env var (or set `..._READONLY_ENABLED=false`) and recreate
   the container the same way as in 4.1. A Dokploy redeploy of the compose without
   the variable is the cleanest, so the compose state in Dokploy matches the host.
2. Check the container's `Env` names: no `MAINTENANCE` variable remains.
3. **Deploy after GC.** Run a real build-server compose deploy (for example a dev
   compose such as `postify-compose-dev-bshqct`, which previously pushed 5 images).
   Confirm "Registry Login Success", the push, the pull on devino-first, and that the
   deployment finishes `done`. This is the proof that writes work again.
4. Reopen builds (concurrency and webhooks back to their previous values).
5. Note the date, the dry-run `N` and `M`, the run summary and the bucket size before
   and after in the PR or in `LOG.md` under `/root/`.

## 8. Rollback and recovery

**GC deletes blobs from S3. There is no undo inside the registry.** If a needed
layer was swept, the image cannot be pulled, and the only way back is to restore the
objects from S3 or rebuild the image.

- **Bucket versioning: to check.** Look at the bucket's versioning status with the
  provider's tooling before the first real run. If versioning is on, deleted objects
  become delete markers and can be restored by removing the marker (or restoring the
  prior version). If it is off, nothing is recoverable from the bucket.
- **Backups: to check.** Is there a copy of the bucket (provider snapshot, a second
  bucket, `rclone sync`)? Not known at the time of writing.
- **Do not run GC without a recovery path.** That means either versioning on, or a
  verified bucket copy taken immediately before the run, or an explicit decision that
  the images can all be rebuilt from source (they can for apps and composes built by
  Dokploy, at the cost of a rebuild each; about 98 apps and 51 composes).
- If a pull fails after GC: identify the missing digest from the registry or Docker
  error, restore that blob path (`docker/registry/v2/blobs/sha256/<2-char>/<digest>/data`)
  from versioning or backup, and pull again. If it cannot be restored, redeploy the
  app from Dokploy to rebuild and push a fresh image. The `:latest` tag and Dokploy
  rollback entries that point at a lost digest will keep failing until rebuilt.
- The registry's read-write state is separate: revert it by removing the maintenance
  env var and recreating (section 7).

## 9. Schedule recommendation

- **First run: manually, in a quiet window**, with someone watching, after the
  versioning check. Do the dry-run one day, review it, run the real GC another day.
  Because the first run clears the whole backlog, it is the long and risky one.
- **Then roughly monthly**, or when the bucket passes an agreed size, at a time with
  no webhook-driven builds (early morning UTC on a weekend is the likely choice).
  After #294 the backlog per month is small, so later runs are short.
- **Do not automate yet.** An unattended job needs the gate in section 3 as code, and
  that gate can race with a deploy that starts a second after it passes. If it is
  automated later, take the Dokploy-side lock first (builds concurrency 0), then
  check the gate, then go read-only.
- Window estimate: unconfirmed. Plan for 30 to 60 minutes for the first run, and
  replace this with the measured dry-run time.

## 10. Open items

- Check bucket versioning and the existing backup state (sections 2 and 8).
- Confirm which S3 provider the endpoint is, and its consistency model.
- Test the env override `REGISTRY_STORAGE_MAINTENANCE_READONLY_ENABLED` on a
  throwaway registry container (not prod) to confirm it works next to
  `REGISTRY_STORAGE=s3`.
- Confirm the exact config path and that `garbage-collect` honours the env overrides.
- Confirm the `--delete-untagged` / `-m` multi-arch behaviour on distribution 2.8.3
  with a throwaway registry before ever using it.
- Measure the mark phase duration with the dry-run.
