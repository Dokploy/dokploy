# Local Swarm worker UI fixture

Three privileged Docker-in-Docker containers provide one manager and two workers.
The host Docker daemon must remain outside Swarm. No SSH or Docker API ports are
published. The manager's port 3000 is forwarded to `127.0.0.1:17777` for the patched
Dokploy runtime, which is installed separately.

From this directory:

```sh
./setup.sh
./workload.sh
./verify.sh
docker compose exec manager docker node ls
docker compose exec manager docker service ps worker-ui-fixture
```

The workload runs two Alpine replicas, at most one per worker, emits logs, and
periodically hashes data to produce CPU activity. It uses no application ports.
The generated SSH private key is `.state/id_ed25519` (mode 600, Git ignored).
Use root, port 22, and the worker's private bridge IP from:

```sh
docker inspect "$(docker compose ps -q worker-a)" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
```

The manager daemon is accessed with `docker compose exec -T manager docker ...`.
To load a locally built patched image into it:

```sh
docker save your-patched-image | docker compose exec -T manager docker load
```

Bind the nested Dokploy runtime to manager port 3000. Mount its nested daemon's
`/var/run/docker.sock` as required by Dokploy. Do not initialize Swarm on the host.

Cleanup only this fixture's containers, network, and daemon volumes:

```sh
docker compose down -v --remove-orphans
rm -rf .state .packages
```

This fixture is for trusted local testing; its privileged containers have broad
access inside the Docker Desktop VM. Recreating containers may change private IPs.

## Patched Dokploy runtime

`./runtime-deps.sh` loads PostgreSQL 16 and Redis 7 from host Docker into the nested
manager and starts them on the attachable overlay `dokploy-network`. It generates
`.state/runtime.env` with disposable credentials, copies it to manager
`/root/runtime.env`, and creates the nested `dokploy-config` volume. Keep this file
private. All nested data is removed by the fixture cleanup above.

After loading the patched runtime image, start it on the manager:

```sh
docker compose exec -T manager docker run -d --name dokploy \
  --network dokploy-network --env-file /root/runtime.env \
  -p 3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v dokploy-config:/etc/dokploy your-patched-image
```

Then visit `http://127.0.0.1:17777`. SSH targets are the outer worker bridge IPs;
Docker's nested network can reach those addresses. The SSH server packages and
workload images are fetched on the host to accommodate restricted container
network egress. Package downloads remain under ignored `.packages/`; the Docker
build context excludes `.state/`, including its private key and credentials.

With Node 24 and the repository's pnpm dependencies installed, run from the
repository root:

```sh
test -e apps/dokploy/.env.production || touch apps/dokploy/.env.production
pnpm --filter @dokploy/server run build
NODE_ENV=production pnpm --filter ./apps/dokploy run build
tests/fixtures/swarm-worker-ui/build-runtime.sh
```

The ignored empty `.env.production` placeholder is required by the application
build; runtime credentials come from the fixture environment file. The server
build runs `switch:prod`, which changes `packages/server/package.json` entry points
and exports to compiled output. Inspect these generated changes and do not commit
them as part of the PoC.

`./build-runtime.sh` overlays the JavaScript build
outputs, migration files, and `next.config.mjs` on the official canary Linux runtime
and loads the result into the nested manager. `runtime.Dockerfile` pins digest
`sha256:4d6524600df2079f3ed851db06360999ff08dc37d34a44e9f59756e9746f5f44`.
For source baseline `78d235a3` (v0.30.11), that image's application and server
dependency declarations, all migration assets, and Next configuration matched
exactly. Its native arm64 runtime uses Node v24.22.1. This preserves the official
image's native Linux dependencies; reassess compatibility before changing the
source baseline or pinned image.
It follows the existing server package symlink instead of hardcoding a pnpm hash.

After starting that image, run `python3 seed.py`. It creates a disposable owner,
registers the existing workers and SSH key through APIs without running server
setup, and creates a project and Compose stack record for the running fixture.
It labels the existing service with that record's generated stack namespace and
adds the node-to-server mapping to `.state/runtime.env`.

Copy the updated environment and recreate only the nested Dokploy container using
the same startup command above with image `dokploy-worker-ui-poc:local`:

```sh
docker compose cp .state/runtime.env manager:/root/runtime.env
docker compose exec -T manager docker rm -f dokploy
```

The generated owner credentials are in `.state/owner.json`, HTTP session cookies
in `.state/cookies.txt`, and record IDs in `.state/seed.json`. These are private
local files; do not paste their contents into logs. Seed reruns reuse recorded IDs.

## Supported scope and routing

This PoC extends the native Compose **stack** monitoring view with live charts and
a picker for individual running replicas. The manager lists tasks; each selected
task's node is resolved to a registered SSH server before reading that worker's
Docker API. `DOKPLOY_SWARM_NODE_SERVERS` is a JSON object mapping Swarm node IDs to
Dokploy server IDs, for example `{"<node-id>":"<server-id>"}`. The server must
belong to the same organization and have a usable SSH key. This explicit mapping
keeps SSH credentials in Dokploy and avoids guessing a worker endpoint from a
task's hostname. The resolver also checks node identity and Swarm membership.

Register existing workers without clicking **Setup Server**: they already belong
to the shared Swarm, and standalone server setup is not appropriate here.

The selected-task Restart action stops that exact task container
and lets Swarm create its replacement. It does not force-update the entire service.
The replacement has a new task identity, so refresh the replica list and select
the replacement to reconnect. The live charts do not persist history; refresh or
reconnect starts a new live series.

Application-resource monitoring, the global Docker page, terminal behavior, and
native log handling are unchanged. For service logs, use the existing Swarm log
mode; this PoC does not add separate per-worker log or terminal routing.

## Verified behavior

On canary baseline `78d235a3`, 85 focused tests, the app typecheck, production
build, and formatting/lint checks passed. The rebuilt local runtime applied its
migrations and became healthy. Authenticated task listing and metrics worked on
both workers, and the monitoring page rendered HTTP 200. Restart stopped only
the selected replica, its replacement ran, and stale restart returned HTTP 409.
Cross-organization HTTP/metrics checks denied access. Pausing a worker closed
monitoring with code 4000 after about 11.3 seconds; the worker was then resumed.

The native browser interaction and drain/migration checks below were performed
before the rebase; those two scenarios were not repeated on this baseline.

- Native CPU and memory charts and authenticated WebSocket samples for both workers.
- Restart from the native UI stopped the selected worker-b container and produced
  a new running replacement, while the worker-a container stayed unchanged. Each
  worker had exactly one running replica. Reusing the old task for Restart returned
  HTTP 409.
- Pausing worker-b closed its monitoring connection with code 4000 after about
  11.7 seconds, without emitting fabricated zero samples. The UI cleared a task
  selection once that task disappeared from the running-task list.
- Temporarily allowing two replicas per node and draining worker-b moved its slot
  to worker-a. The replacement returned authenticated monitoring samples and
  rendered native CPU 4.06% and memory 720896 B / 67108864 B in the UI.
- A session scoped to another organization received HTTP 403 for task listing and Restart;
  its monitoring WebSocket closed with code 4000 without data.

After verification, both workers were restored to Active, with one running replica
per worker; `verify.sh` and fresh authenticated samples from both workers passed.
The host Docker daemon remained outside Swarm.

The migration check deliberately changes placement. Restore both workers to Active
and the service's maximum replicas per node to one before using `./verify.sh` to
confirm the normal fixture layout. The seeded Compose record attaches monitoring
to the existing service; use `workload.sh` to create the fixture, not the record's
Deploy button. To rebuild the entire lab, run cleanup first so stored Swarm node
addresses and seeded database IDs cannot refer to a previous cluster.
