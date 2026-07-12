# Upstream Sync Playbook

How this community fork (`DevinoSolutions/dokploy-community`) stays in sync with
upstream [`Dokploy/dokploy`](https://github.com/Dokploy/dokploy). Read this before
every upstream sync.

## Guiding principle

**Diverge only for features upstream lacks. When upstream ships an equivalent,
drop ours and take theirs.** The fork's long-term maintenance cost is the set of
files where we differ from upstream — keep that set as small as possible. Every
sync is an opportunity to *delete* fork-specific code that upstream has since
absorbed.

We sync to **release tags only** (e.g. `v0.29.11`), never to `upstream/canary`
HEAD. Tags are the tested, published states; canary is a moving target.

## One-time setup

```bash
# Upstream remote (fetch tags too)
git remote add upstream https://github.com/Dokploy/dokploy.git
git fetch upstream --tags

# Enable the `merge=ours` driver referenced by .gitattributes. This is a local
# git config that is NOT stored in the repo, so every clone/CI runner that will
# perform a sync merge must run it once:
git config merge.ours.driver true
```

Without `merge.ours.driver true`, the `merge=ours` entries in `.gitattributes`
are silently ignored and fork-owned files will conflict on every sync (you then
resolve them by hand — annoying but not dangerous).

## Sync procedure (tag-based merge)

1. Confirm the target tag exists locally: `git fetch upstream --tags && git tag -l 'vX.Y.Z'`.
2. Branch off `canary`:
   ```bash
   git checkout canary
   git checkout -b sync/upstream-vX.Y.Z
   ```
3. **Merge the tag — never rebase.** A real merge commit preserves the merge
   base so the *next* sync only has to reconcile new upstream changes:
   ```bash
   git merge vX.Y.Z --no-commit --no-ff
   ```
4. Resolve conflicts per the policy below. Also force-resolve any *auto-merged*
   overlap files that fall under a "theirs" rule — a clean auto-merge can still
   splice a fork line we mean to drop into an upstream file. Determine the
   overlap set with:
   ```bash
   MB=$(git merge-base canary vX.Y.Z)
   comm -12 <(git diff --name-only $MB canary | sort) \
            <(git diff --name-only $MB vX.Y.Z | sort)
   ```
5. Set the version (see convention) and commit the merge.
6. Regenerate fork migrations (see Drizzle) as follow-up commits.
7. Verify (see Verification), then open the sync PR into `canary`.

## Conflict policy (strict, in priority order)

1. **Upstream wins by default.** Any overlap where both sides changed the same
   code → take theirs (`git checkout vX.Y.Z -- <file>`).
2. **Drop fork features upstream now provides.** When upstream ships an
   equivalent of something we forked, delete our implementation entirely — take
   upstream's version of shared files, `git rm` our net-new files, and revert
   our edits to shared helpers back to upstream. Before deleting a shared
   helper, grep that no *kept* fork feature imports it.
3. **Keep fork features upstream lacks.** Re-integrate them **on top of
   upstream's refactored files**, not by keeping our stale copies. Upstream
   frequently reorganizes imports / restructures components (e.g. the Tailwind
   v4 pass in v0.29.11); re-apply our small additions to *their* current file.
4. **Fork-owned files: ours always wins** (see ownership table). These carry
   `merge=ours` in `.gitattributes`.
5. **Version**: set `apps/dokploy/package.json` to `vX.Y.Z-community.N`.
6. **`pnpm-lock.yaml`**: take theirs, then run `pnpm install` and commit any delta.

## File ownership

| Path | Owner | Rule |
|---|---|---|
| `README.md` | Fork | ours (`merge=ours`) |
| `CNAME` | Fork | ours (`merge=ours`) |
| `install.sh` | Fork | ours (`merge=ours`) |
| `.github/workflows/dokploy.yml` | Fork | ours (`merge=ours`) — GHCR publish; ignore upstream release automation |
| `apps/dokploy/package.json` (`version`) | Fork | `vX.Y.Z-community.N` |
| `packages/server/src/services/settings.ts` | Shared | keep fork image/update sources (DevinoSolutions repo, `ghcr.io/devinosolutions`); adopt unrelated upstream logic around them |
| Network management feature (below) | Fork | keep; re-integrate onto upstream |
| Everything else | Upstream | theirs |

### Fork feature: Docker network management (KEEP — upstream has no equivalent)

Net-new fork files (kept as-is unless upstream restructures their neighbors):
`packages/server/src/db/schema/network.ts`, `packages/server/src/services/network.ts`,
`apps/dokploy/server/api/routers/network.ts`, `apps/dokploy/pages/dashboard/networks.tsx`,
`apps/dokploy/components/dashboard/networks/*`, `apps/dokploy/__test__/network/*`.

Small additions re-applied onto upstream's versions of shared files:
- `apps/dokploy/server/api/root.ts` — register `networkRouter`.
- `apps/dokploy/components/layouts/side.tsx` — Networks nav entry.
- `apps/dokploy/pages/dashboard/project/.../services/*/[*Id].tsx` (7 pages) — `<ResourceNetworksCard>`.
- `apps/dokploy/server/api/routers/{application,libsql,mariadb,mongo,mysql,postgres,redis}.ts` — `assertNetworkIdsAttachableToResource` on update.
- `packages/server/src/db/schema/{account,server,application,<db>}.ts` — `networks` relations + `networkIds` columns.
- `packages/server/src/db/schema/index.ts`, `packages/server/src/index.ts` — re-export network schema/service.
- `packages/server/src/db/schema/audit-log.ts` — `"network"` audit action.
- `packages/server/src/lib/access-control.ts` — network permissions.
- `packages/server/src/services/mount.ts` — projected column select (avoids Postgres 100-arg `json_build_array` limit once `networkIds` is added).
- `packages/server/src/services/rollbacks.ts`, `packages/server/src/utils/builders/index.ts`, `packages/server/src/utils/databases/*.ts` — pass `resolveNetworkNamesForResource(...)` into `generateConfigContainer`.
- `packages/server/src/utils/docker/utils.ts` — `mergeNetworks` + `extraNetworks` param on `generateConfigContainer` (defaults to `[]`, so upstream callers are unaffected).

### Dropped at v0.29.11: per-target concurrent deployments (fork PR#5)

Superseded by upstream's in-memory queue (#4645) + OSS concurrent builds
(#4778). We took upstream's `deployments-queue.ts`, `queueSetup.ts`, `server.ts`,
`server/api/routers/{server,settings,application,compose,preview-deployment}.ts`,
`web-server-settings.ts` / `server.ts` schema (upstream's `buildsConcurrency`),
`show-deployments.tsx`, `setup-server.tsx`; `git rm`'d our net-new concurrency
files (`queue-routing.ts`, `utils/process/job-context.ts`, concurrency
modals/sections, `__test__/queues/{global-state,routing}.test.ts`); and reverted
`execAsync.ts`, `esbuild.config.ts`, `pages/api/deploy/*.ts`,
`show-queue-table.tsx`, `show-dokploy-actions.tsx` to upstream.

## Drizzle migrations (read carefully)

Both fork and upstream branch from the same last shared migration and each add
new numbered migrations. Rules:

1. **Take upstream's `drizzle/` state verbatim** on merge (their new `.sql`,
   snapshots, and `_journal.json` entries). Delete the fork's *old*
   numbered migrations that collided with upstream's numbers.
2. **Fork migrations always regenerate AFTER upstream's.** Once the schema `.ts`
   files are in their final merged state, run:
   ```bash
   pnpm install
   pnpm --filter=dokploy run migration:generate   # offline; no DB needed
   ```
   This emits the fork's feature migration at the next free number (e.g. `0174`).
   **Inspect the SQL**: it must contain *only* fork-feature objects. If it
   contains anything else, the schema merge is wrong — fix the `.ts` and
   regenerate.
3. **Idempotency guards (required).** Instances already running the *previous*
   fork release ran the fork's *old* migration, so the objects already exist
   there — but drizzle sees the regenerated migration as new and will run it
   once. Make that run a no-op with guards:
   - `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE [UNIQUE] INDEX IF NOT EXISTS`.
   - Enum types and `ADD CONSTRAINT` have no `IF NOT EXISTS`; wrap each in
     `DO $$ BEGIN <stmt>; EXCEPTION WHEN duplicate_object THEN null; END $$;`
     (keep `--> statement-breakpoint` separators intact).
4. **Guard upstream migrations only on a real column-name collision.** If an
   upstream migration adds a column our *old* dropped migration already created
   under the **same name**, add `IF NOT EXISTS` to our copy of that upstream
   `.sql`. Upstream never retro-edits released migrations, so this never causes a
   future merge conflict. (At v0.29.11 there was **no** collision: upstream named
   its column `buildsConcurrency`, our dropped one was `deploymentConcurrency`.)

### Migrator ordering gotcha (drizzle `postgres-js` migrator)

`migrate()` finds the single highest `created_at` in `__drizzle_migrations`, then
runs every journal entry whose `when` (folderMillis) **exceeds** it. It does
**not** track a per-migration applied set. Consequence for forks: if the fork's
*old* migrations had a higher `when` than an upstream migration that a
previous-release instance never saw, that upstream migration is **silently
skipped** on upgrade (its `when` is below the fork's high-water mark).

At v0.29.11 this hit `0172_quick_the_professor` (`when=1781045439162`, adds
`buildsConcurrency`) vs the fork's old `0173_deployment_concurrency`
(`when=1781673664599`). Fix: bump the fork's copy of the shadowed upstream
migration's `when` in `_journal.json` to just above the fork high-water mark
(here `1781673664600`), keeping it below the next upstream migration. Fresh
installs are unaffected (empty migrations table ⇒ every entry runs in array
order regardless of `when`). The bump is self-healing: after this release every
instance has the column, and the next sync takes upstream's journal verbatim.

**Rule of thumb:** after a merge, scan for any upstream migration whose journal
`when` is below the previous fork release's highest `when`; bump those so
upgraders don't skip them.

## Version convention

`vX.Y.Z-community.N` where `X.Y.Z` is the synced upstream release and `N` starts at
`1`, incrementing for subsequent fork-only releases on the same upstream base.

## Verification (before merging the sync PR)

```bash
pnpm install
pnpm --filter=dokploy run typecheck        # app + packages/server MUST pass
pnpm --filter=dokploy run build-server      # fast esbuild bundle
pnpm --filter=dokploy test -- run           # unit suite
pnpm --filter=dokploy run build-next        # optional full Next build
```

Note: `pnpm -r run typecheck` currently fails in `apps/api` and `apps/schedules`
on **upstream itself** — their tsconfigs lack `esModuleInterop`, so they can't
typecheck the shared `packages/server` source (unrelated to the fork). Verify the
fork with the `apps/dokploy` + `packages/server` typechecks, which pass. Several
`*.real.test.ts` / docker / filesystem tests require live Docker, git, nixpacks
and Unix tools (`awk`, `mkdir -p`) — they fail in sandboxed/Windows envs and pass
on a Linux CI runner with Docker.
