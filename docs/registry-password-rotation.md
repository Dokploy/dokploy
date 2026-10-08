# Registry password rotation (2026-10-08)

The password of the private Docker registry on prod (devino-first, `localhost:5000`)
was rotated on 2026-10-08 after the old one leaked into a session transcript. This
document records what changed, how every consumer was moved to the new credential,
how it was verified, and how to roll back.

Secrets: nothing here contains a password, hash or auth string. On devino-first the
new password is in `/root/rotate-20261008/registry/new.pw` and the backups are in
`/root/rotate-20261008/registry/backup/`. All of them are mode 600. The step log is
`/root/rotate-20261008/registry/LOG.md`.

---

## 1. What was rotated

| Item | Before | After |
| --- | --- | --- |
| htpasswd user | `docker` | `dokploy` |
| Password | 14 chars, leaked | 64 hex chars (32 random bytes), generated on devino-first |
| Hash | bcrypt | bcrypt, cost 10 |

The registry is the Dokploy raw compose `dokploy-registry-registry-lqwgvq` (composeId
`UpQegvQO7JohIWIFTuLFE`), running the image `registry:2`, which is distribution
2.8.3. It is bound to 127.0.0.1:5000 and stores its data in S3. The htpasswd file is
`/etc/dokploy/compose/dokploy-registry-registry-lqwgvq/files/auth/registry.password`.
It is bind-mounted to `/auth/registry.password`.

Image paths did not change. Dokploy builds tags from the registry row's
`imagePrefix` (`registry.devino.ca`), not from the username. Images stay at
`localhost:5000/registry.devino.ca/<appName>:latest`.

## 2. Method: two users, then retire the old one

Swapping the password on the single `docker` user would have broken every consumer
until it was updated. Instead, the rotation ran with two users for a while:

1. Add a second user, `dokploy`, with the new password. Keep `docker`.
2. Verify the new credential on both hosts.
3. Move every consumer to `dokploy`.
4. Remove `docker`.

During steps 1 to 3, both credentials were accepted, so nothing was down at any
point.

## 3. Gotcha: registry 2.8 reloads htpasswd without a restart

The plan assumed that registry:2 reads htpasswd only at startup and would need a
gated restart. That is wrong for distribution 2.7 and later. The htpasswd access
controller checks the file's mtime on every authenticated request and re-parses the
file when the mtime changes.

On 2026-10-08, the `dokploy` user returned 200 on `/v2/` right after the file was
written, while the container's `StartedAt` was still 2026-09-12. The registry was
never restarted during the rotation, neither to add the new user nor to remove the
old one.

Two things do matter:

- **Write the file in place.** Use `cat new > registry.password`. Do not use
  `mv`, `sed -i` or editors that replace the file. A single-file bind mount is pinned
  to the inode. If the file is replaced by a new inode, the container keeps reading
  the old one until it restarts. Dokploy's own mount writer (`fs.writeFileSync`)
  also writes in place. During the rotation, the inode stayed at the same number
  before and after both writes.
- **Update the Dokploy mount row too.** Dokploy stores the file as mount row
  `MSpErZyD2GQV57-C_Lzyy` (column `content`, plain text). On a redeploy of the
  registry compose, Dokploy writes that content back to the file. If only the file
  changes, a redeploy silently restores the old users.

A finding from this rotation: the mount row was already out of sync before it
started. It held a comment line and a `docker` hash that did **not** match the live
password. A redeploy of the registry compose at any time before today would have
broken every login. The mount row now holds the comment line plus the same user
lines as the live file, and each write was checked by md5.

## 4. Consumers and how each was updated

The search covered the DB and the filesystems of both hosts. To avoid printing the
secret, the old value was matched from a file, as a plain string and as base64
`docker:<pw>`. The DB check was a `pg_dump --data-only` piped through awk. The file
check was `grep -rlF -f` across `/etc/dokploy`, `/root`, `/home`, `/etc` and the
Dokploy volume. Docker `config.json` files were checked by key name only.

| Consumer | Where | Update |
| --- | --- | --- |
| Dokploy registry row `24DULWxAFrk80EcWleSFb` | table `registry` (plain text) | Set to `dokploy` and the new password through a SQL file on stdin. Dokploy reads the row fresh on every build, push and deploy (`findRegistryByIdWithCredentials` in `packages/server/src/services/registry.ts`, called from `utils/builders/index.ts` and `utils/cluster/upload.ts`), with no caching. |
| Rollback snapshots | table `rollback`, `fullContext->rollbackRegistry` (93 rows, all for this registry) | `username` and `password` were rewritten with `jsonb_set` in the same transaction as the registry row. Rollbacks log in and pull with the snapshot's credentials (`services/rollbacks.ts`), so after retirement they would have failed. Afterwards, the old value appears in no DB row. |
| Build server devino-third | root `~/.docker/config.json` (reached through the SSH tunnel) | Dokploy runs `docker login` with the row's credentials before each build and push. A manual `docker login -u dokploy` was also run. |
| Dokploy container's docker config | volume `dokploy` → `/root/.docker/config.json` | Ran `docker exec -i <dokploy> docker login localhost:5000 -u dokploy --password-stdin`. This is a CLI login only. Dokploy itself was not restarted. |
| devino-first root docker config | `/root/.docker/config.json` | Ran `docker login -u dokploy`. This is the auth that `docker service update --with-registry-auth` sends. A stale `localhost:32842` entry that held the old credentials was removed with `docker logout`. |
| 18 swarm services with `localhost:5000/...` images | swarm-stored registry auth | 17 were refreshed one at a time with `docker service update --with-registry-auth --no-resolve-image --detach=false`. The 18th (`contrabot-contra-lead-gen-prod-guokp6`) was redeployed by Dokploy after the switch, so it already had the new auth. See section 5. |
| 51 composes | none stored | They log in fresh on each deploy from the registry row, so nothing was needed. |
| Mount row + htpasswd file | see section 3 | Updated together, twice: first to both users, then to `dokploy` only. |

Not consumers:

- The other Dokploy servers (Syncara PROD, "Main Build Server"). No application on
  them references this registry.
- The CI runners on devino-third. They are containers under a separate daemon, and
  no docker config on the host references the registry.
- The public `registry.devino.ca`. It goes through Cloudflare and does not reach the
  registry; `/v2` returns 404, not 401.

The old password also appears in plain text in `/root/.bash_history` on devino-first.
That copy was left alone. The password no longer authenticates, so the leftover is
harmless.

## 5. Swarm services refreshed

The services were updated one at a time. Before each one, the script checked two
things: no deployment for that app was `running`, and the running task's image
digest equaled the registry's current `:latest` digest. This ensures that a roll
could not change the image. `--no-resolve-image` keeps Dokploy's tag-only image
reference unchanged in the spec.

```
app-calculate-digital-transmitter-18yg83
app-connect-cross-platform-microchip-xpp4d5
app-input-online-monitor-9uox7k
app-input-online-monitor-wt33du
app-parse-open-source-hard-drive-szi6so   (rolled; update completed, 1/1)
app-parse-virtual-transmitter-ksnprf
app-parse-wireless-matrix-8r9wko
app-reboot-solid-state-feed-urqjra
app-synthesize-neural-panel-76czep
bioflow-dev-landing-bkd2ps
devino-landing-page-nextjs-dev-2iroqg
marka-ai-ugzuyq
notifly-docs-jcx5rq
openrouter-api-kxdaqb
superbooks-landing-dctdto
upapi-web-e14uyh
voicelabs-docs-prod-yx1nai
```

All 17 updates returned OK and are at 1/1. Only one of them rolled its task. The
other 16 kept their running task, because swarm does not restart tasks when the
registry auth is the only change. Their new auth is stored, and the next task start
uses it.

## 6. Timeline (UTC, 2026-10-08)

| Time | Step |
| --- | --- |
| 08:11 | Backups taken: htpasswd file, mount content, registry row (username and password), root docker config on both hosts, Dokploy container docker config. Rollback snapshot credentials were backed up at 09:25. |
| 08:53 | New password generated on devino-first. The `dokploy` bcrypt line was staged and checked with `htpasswd -v`. |
| 08:56 | Two-user htpasswd written in place, and the mount row updated to match. |
| ~09:15 | `dokploy` returned 200 with no restart (hot reload, section 3). The planned gated restart was cancelled. |
| 09:22 | Step 2: on both hosts, `dokploy` got 200 on `/v2/` and on a manifest HEAD, and `docker login` succeeded. A pull by digest on devino-first succeeded. |
| 09:25 | Step 3: registry row and 93 rollback snapshots switched to `dokploy`. The Dokploy container logged in as `dokploy`. |
| 09:29–09:32 | Step 4: 17 swarm services refreshed. |
| 09:31–09:33 | A real build on devino-third (`contrabot-contra-lead-gen-prod-guokp6`) logged "Registry Login Success", "Image Tagged" and "Image Pushed", and the deployment finished `done`. |
| 09:36:56 | Step 5: the `docker` user was removed from the file and the mount row (hot-reloaded, no restart). |
| 09:37 | `docker` with the old password got 401 on `/v2/` on both hosts, and `docker login` as `docker` failed. `dokploy` got 200 and `docker login` succeeded on both hosts. |
| 09:39 | Pull by digest with the new auth succeeded. A forced roll of `bioflow-dev-landing-bkd2ps` without `--with-registry-auth`, which used the stored auth from step 4, completed with the task running and no auth errors in the dockerd log. |
| 09:56–09:59 | A build-server deploy after retirement (`postify-compose-prod-udff6e`) logged "Registry Login Success". Five images were built on devino-third and pushed, then pulled on devino-first, and the deployment finished `done`. |
| 09:58–10:02 | A deploy queued on purpose (`postify-compose-dev-bshqct`) had the same result: "Registry Login Success", 5 images pushed as `dpl-<deploymentId>` tags, pulled on devino-first, and the deployment finished `done`. Compose deploy logs that run on the build server are relayed to `/etc/dokploy/logs/<appName>/` on devino-first, not devino-third. |

The registry container was not restarted at any point (`StartedAt`
2026-09-12T05:19:21Z). Anonymous `/v2/` stayed 401 on both hosts throughout.

## 7. Rollback

Backups are in `/root/rotate-20261008/registry/backup/` on devino-first:

| File | Contents |
| --- | --- |
| `registry.password.orig` | The live htpasswd file before the rotation |
| `mount-content.orig` | The mount row content before the rotation (the stale hash, see section 3) |
| `registry-row.username`, `old.pw` | The registry row's old username and password |
| `rollback-registry-creds.csv` | Rollback snapshot credentials (password hex-encoded) |
| `*.docker-config.json` | Root docker config on each host, and the Dokploy container's config |

devino-third keeps its own copy of its `docker-config.json`.

Feed every value through stdin or a mode-600 SQL file. Never put one in a command
line.

### 7.1 Before retirement (both users in the htpasswd)

This rollback is no longer available, because retirement was done at 09:36:56Z. It
is kept for the next rotation.

Point registry row `24DULWxAFrk80EcWleSFb` back to `docker` with the old password
from `old.pw`. Restart nothing: the old user is still in the file, so every
consumer keeps working.

### 7.2 After retirement (current state)

The leaked password must never be re-enabled long-term. If the new credential has
to be abandoned, issue a fresh one instead:

1. Generate a new password, write its bcrypt line into the htpasswd file in place,
   and put the same line in the mount row content.
2. Update the registry row (and the rollback snapshots, as in section 4).
3. Refresh the swarm services as in section 5.

The registry picks up the file change without a restart (section 3).

If logins break and you need pulls back immediately:

1. Restore the htpasswd file in place from `registry.password.orig`
   (`cat backup > file`).
2. Restore the mount row content from the same file, not from
   `mount-content.orig`, which holds the stale hash.
3. Point the registry row back to `docker`.

Restart the registry with `docker restart dokploy-registry-registry-lqwgvq-registry-1`
only if the hot reload does not take effect. Gate that restart on an empty
`deployment_queue_job`, no `running` deployments, and no build or push processes on
either host (check with `ps -eo comm` only). Then run a fresh rotation right away:
the restored state re-enables the leaked password.

## 8. Next time

- Use a new username for each rotation (`dokploy`, then another), so both users can
  coexist in the file during the switch.
- Search `rollback.fullContext` as well as `registry`. Rollback snapshots copy the
  credentials.
- Use `docker service update --with-registry-auth --no-resolve-image`. Without
  `--no-resolve-image`, the CLI pins a digest into the spec and forces a roll.
- After writing the file, compare the mount row and the file by md5. They must
  match.
