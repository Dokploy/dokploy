# Replica scaling: architecture

Dokploy manages replicas of applications and compose services. The feature was built in stages, which later sections refer to by number:

| Stage | Scope | Status |
|---|---|---|
| 1 | Manual replicas, live scaling, replica health, scaling history, deploy-path fixes | **Implemented** |
| 2 | Capacity estimation, resources/rollout/placement settings | **Implemented** |
| 3 | Per-replica CPU/memory metrics (monitoring agent) | **Implemented** |
| 4 | Scaling for compose services: Stack (Swarm) and plain Docker Compose | **Implemented** |
| 5 | Multi-VM cluster over WireGuard, managed by Dokploy over SSH | **Implemented** |
| 6 | Placement and load balancing across VMs (node pools, Stack placement, registry checks, Compose → Stack switch, per-request balancing) | **Implemented** |
| 7 | Replica metrics for Stack and plain Docker Compose services | **Implemented** |
| 8 | Autoscaling for applications, Stack and Docker Compose services, run by a separate `dokploy-autoscaler` service | **Implemented** |
| 9 | Documentation completion: installation and migration, configuration, troubleshooting, design decisions | Planned |

Everything below describes the implemented stages. Planned stages are described in the implementation plan, not here. For what each deployment mode supports, see [supported-modes.md](supported-modes.md); for the Scaling tab, see [ui-guide.md](ui-guide.md).

## How it fits Dokploy

Every Dokploy **application** already runs as one Docker Swarm service named after its `appName`, created or updated by `mechanizeDockerContainer` (`packages/server/src/utils/builders/index.ts`). Swarm provides replicas, scheduling and health-gated load balancing. Stages 1 and 2 add no new infrastructure: they read and change that service, and read node and task inventory, through the Docker API, locally or over SSH via `getRemoteDocker`. Compose services (Stage 4) are covered in [Compose and Stack services](#compose-and-stack-services).

```
Scaling tab ──► scaling router (tRPC) ──► services/scaling/* ──► dockerode (socket / SSH) ──► Swarm service
                        │                         │
                 permission checks         scaling_event table (Postgres)
```

| Piece | Location | Role |
|---|---|---|
| Router | `apps/dokploy/server/api/routers/scaling.ts` | `status`, `setReplicas`, `events`, `capacity`, `settings`, `updateRollout`, `updatePlacement`, and for compose `composeStatus`, `setComposeReplicas`, `composeCapacity`, `composeEvents`, `updateComposePlacement`, `composeStackCheck`, `switchComposeToStack`, `composeMetrics`, `setupComposeMetricsAgent`, and for both `autoscaling`, `updateAutoscaling`; permission checks, rate limit, error mapping |
| `scaleService` | `packages/server/src/services/scaling/scale-service.ts` | Changes only the replica count of a live service |
| `setApplicationReplicas` | `services/scaling/manual-scale.ts` | Validates, saves, applies, records an event |
| Status | `services/scaling/status.ts`, `task-status.ts`, `failure-diagnosis.ts` | Reads tasks and nodes, classifies replicas, explains failures, short cache |
| Replica settings | `services/scaling/replicas.ts` | Single answer to "how many replicas is this app configured for" |
| Capacity | `services/scaling/capacity.ts` (pure), `capacity-service.ts` (Docker reads) | Constraint matching, reserved resources, per-node room, warnings |
| Rollout and placement | `services/scaling/scaling-settings.ts` (pure), `settings-service.ts`, `node-selection.ts` | Structured settings to and from Swarm `UpdateConfig` / `Placement`; the node labels behind "Several nodes" |
| Swarm helpers | `packages/server/src/utils/docker/swarm-service.ts` | Not-found / out-of-sequence detection, create-or-update with retry |
| Multi-VM networking | `services/cluster-mesh/*` (`wireguard.ts` and `scripts.ts` pure, `ssh.ts`, `provision.ts`, `preflight.ts`); router `cluster-mesh.ts`; tables `cluster_mesh`, `cluster_node` (migration `0201`) | WireGuard tunnel between a swarm's VMs, adding, activating and removing VMs over SSH, node pools; see [multi-vm.md](multi-vm.md) |
| Load balancing | `packages/server/src/utils/traefik/vip-transport.ts`, `utils/docker/endpoint-mode.ts`; called from `utils/traefik/domain.ts`, `mechanizeDockerContainer`, `manual-scale.ts`, `utils/docker/domain.ts`, `utils/builders/compose.ts` and `services/rollbacks.ts` | Per-request balancing for application and Stack domains, through the Swarm VIP or, on hosts without VIPs, DNS round robin; see [Load balancing](#load-balancing) |
| Metrics agent | `apps/monitoring/tasks/`, `apps/monitoring/database/tasks.go` | Per-replica collection on each node, cluster fan-out on managers |
| Metrics in Dokploy | `services/scaling/metrics-client.ts` (`getApplicationMetrics`, `getComposeServiceMetrics`), `metrics-summary.ts`, `metrics-agent.ts`; `setup/monitoring-setup.ts` | Reads the agent, summarises per replica, installs or updates the agent as a global service |
| Compose scaling | `services/scaling/compose-overrides.ts` (pure rules and saved counts), `compose-snapshot.ts`, `compose-status.ts`, `compose-scale.ts`, `scale-lock.ts` | Saved counts and Stack placement per compose service, the deployed snapshot, status and live scaling for Stack and plain Compose |
| Compose → Stack | `services/scaling/stack-switch.ts` | Compatibility check of a compose file against Swarm, and the switch |
| Autoscaling | `services/scaling/autoscaler-decision.ts` (pure), `autoscaler-controller.ts`, `autoscaling-policy.ts`, `advisory-lock.ts`; `setup/autoscaler-setup.ts`; entry point `apps/dokploy/server/autoscaler.ts`; tables `autoscaling_policy`, `autoscaler_controller` (migration `0203`) | Policies, the controller run by the `dokploy-autoscaler` service, locks shared between processes; see [Autoscaling](#autoscaling) |
| History | `packages/server/src/db/schema/scaling-event.ts` (migrations `0199`, `0200`), `compose-service-scaling.ts` (`0200`, `0202`) | `scaling_event` table (an application or a compose service per row), `compose_service_scaling` table (saved count and placement per service) |

## Scaling without restarting replicas

A normal deploy replaces the whole service spec and bumps `ForceUpdate`, so every task is replaced. `scaleService` instead:

1. Inspects the service and resubmits the **inspected spec unchanged except `Mode.Replicated.Replicas`**, so Swarm only adds or removes tasks; running tasks keep running.
2. Sends the spec as `{ _query: { version }, _body: spec }`, which keeps the spec (including environment variables) out of the request URL, and uses the spec version for optimistic concurrency.
3. Sends **no registry auth header**. The daemon then reuses the pull credentials stored with the service, exactly like `docker service scale`, so new tasks can pull private images.
4. Retries when Swarm answers HTTP 500 "update out of sequence" (a concurrent update won), re-inspecting each time, up to 3 attempts.
5. Refuses while `UpdateStatus` is `updating`, `paused`, `rollback_started` or `rollback_paused`: any service update overwrites Swarm's rollback target and resumes a paused rollout.
6. Does nothing when the service already runs the requested count, and refuses (`replicas_changed`) when another writer changed the count to something else since it was read.

A deploy, by contrast, goes through `createOrUpdateSwarmService` (same "update out of sequence" retry) and then waits up to 3 seconds for the tasks of the new `ForceUpdate` to leave `new`/`allocated`/`pending`. If Swarm reports one as pending with an error (for example "no suitable node (insufficient resources)"), `mechanizeDockerContainer` fails the deploy with that reason. `ForceUpdate` is captured in the update callback, so a retry checks the value that was actually submitted; a freshly created service is checked at 0.

## Source of truth for the replica count

`application.replicas` is the configured count. An explicit `modeSwarm` of `{ Replicated: { Replicas: n } }` used to override it silently; `getConfiguredReplicas` resolves both, and saving from the Scaling tab folds such a mode into `replicas` and clears `modeSwarm`. Global and job modes have no replica count; the Scaling tab reports them as unsupported.

`setApplicationReplicas` saves the count first and then applies it:

| Live service state | Result |
|---|---|
| Not deployed | Saved; used on first deploy |
| Spec replicas = 0 (stopped by the user, or a volume backup in progress) | Saved; used on the next start or deploy. The service is not started behind the user's back. |
| Running in a different mode than configured | Saved; applies on redeploy |
| Running, replicated | Saved and applied live via `scaleService` |
| Rollout in progress | Rejected before anything is saved |

Saving before applying means a Docker failure leaves the intended count persisted; the failure is recorded as an `error` event and the status shows the drift ("Swarm is running N but Dokploy is configured for M").

## Compose and Stack services

A compose deployment runs in one of two ways. Stage 4 scales both from the compose's Scaling tab, one service at a time:

| Compose type | How Dokploy deploys it | How a service is scaled live |
|---|---|---|
| Stack | `docker stack deploy`; each service is the Swarm service `<appName>_<service>` | `scaleService`, exactly as for applications |
| Docker Compose | `docker compose -p <appName> up`; plain containers on the server | `docker compose … up -d --no-deps --no-recreate --no-build --pull never --scale <service>=N <service>` |

### Saved counts, injected at deploy

A count set from Dokploy is stored per service in `compose_service_scaling`, keyed by the service name in the final file (after `randomize`, as for domains and volume backups). Deploys load these overrides, and `addDomainToCompose` writes them into the converted file through the pure function `applyReplicaOverrides`:

- it sets `deploy.replicas` and removes `scale`, because Compose rejects a file where the two differ;
- it skips a service, with a reason shown in the tab, when the service no longer exists, runs in global or job mode, or (plain Compose only) cannot run more than one container: `container_name`, a fixed host port, host networking or a static IP;
- without an override, the file decides, as before.

This matters most for Stack: `docker stack deploy` resets a service without `deploy.replicas` to 1 on every deploy, so before Stage 4 any manual scale was lost on the next deploy. The preview (`compose.getConvertedCompose`) shows the same injected file.

### Deployed snapshot

`code/` is not a reliable copy of what is running. The preview, "load services" and the isolated-deployment toggle re-clone it from scratch, which deletes the converted file and `.env`, and a failed deploy rewrites it before `up` runs.

After `up` or `stack deploy` succeeds, the deploy script therefore copies into `COMPOSE_PATH/<appName>/.dokploy/`:
- the converted file;
- the env file Compose interpolated it with;
- `meta.json`, with the project directory and compose type.

Each file is written beside its final name and then moved into place. A compose deployed with a custom command gets no snapshot, and an old one is deleted, because Dokploy cannot tell which files and project that command uses.

What uses the snapshot:
- **Plain Compose scaling.** `--project-directory` is the deploy's project directory, so relative paths resolve as at deploy, and `--env-file` is the snapshot's copy. Compose leaves `scale` and `deploy.replicas` out of its config hash, so changing the count never recreates a container. With `--no-recreate`, existing containers are left alone, and scaling down removes the highest container numbers first. Checked with Compose v2.40 and v5.6.
- **Each live scale** writes the new count back into the snapshot.
- **Start** (`startCompose`) runs `up -d` from the snapshot when one exists, so Stop → Start keeps the scaled count, even after a preview re-cloned `code/`. Without a snapshot, it behaves as before.
- **Start for a Stack.** Stop scales the stack's replicated services to 0 (it no longer runs `docker stack rm`, so the services and their stopped tasks stay visible), after saving each service's live replica count into the snapshot, because Scaling and autoscaling change the live count without touching it. Stop overrides the rollout guard of `scaleService` (`allowDuringRollout`), so a service stuck in a paused or rolling-back update still goes to 0. It then re-reads the services and checks that none has a replica count above 0; if the API path fails or the check does not hold, it runs `docker service scale -d <service>=0` for every replicated service of the stack. If that fails too, the compose status becomes `error` and the request fails, so a stack is never marked stopped while its replicas keep running. Start runs `docker stack deploy -c - <appName> --prune --with-registry-auth` with the snapshot's file on stdin (`getStartStackCommand`): the same file, replica counts and placement as the last successful deploy, without a rebuild. It runs from the folder of the deployed compose file, so relative paths resolve as at deploy, and passes the compose's current environment the way a deploy does. A stack without a stack snapshot (deployed before Stage 4, or with a custom command) is refused with a message to deploy it instead. The compose page offers Start for a stopped Stack as well as for plain Compose.
- **Status** reads the service list, modes and limits from the snapshot. Without one (never deployed, or deployed before Stage 4), it reads the compose file as saved (raw) or as last cloned into `code/`, with the same randomize suffix, so services and what keeps one from scaling show before the first deploy. Live containers or services are always added to the list.

### What a scale request does

`setComposeServiceReplicas` saves the override first, then applies it when it can:

| Situation | Result |
|---|---|
| Custom compose command | Rejected (`custom_command`) |
| A deployment is running (`composeStatus` is `running`, or the deploy worker holds the lock) | Rejected (`deployment_in_progress`) |
| Last deployment failed (`error`) | Saved; applies on the next deploy |
| Stopped or never deployed (`idle`) | Saved; applies on the next start or deploy |
| Stack, `idle`, but the service still has live replicas (the status drifted from Swarm, for example after a deploy interrupted by a restart) | Applied live like a running stack, and the status is set back to `done` so the compose page offers Stop again. Plain Compose is not reconciled this way. |
| Stack service missing (the stack was stopped with `stack rm`) or at 0 replicas (a volume backup is running) | Saved; applies on the next start or deploy |
| Stack, running, rollout in progress | Rejected (`rollout_in_progress`) |
| Stack, running | Capacity checked as for applications, then `scaleService` on `<appName>_<service>` |
| Plain Compose, more than one container asked for a single-instance service | Rejected (`single_instance`) |
| Plain Compose, a container of the service is stopped (for example by a volume backup) | Rejected (`replicas_stopped`), because `up` would start it again |
| Plain Compose, running, no snapshot yet (deployed before Stage 4) | Saved; applies on the next deploy |
| Plain Compose, running | Compose CLI against the snapshot |

### Status

- **Stack:** one `listServices` call filtered by `com.docker.stack.namespace=<appName>`, one `listTasks` call across those services, and `listNodes`. The same `summarizeReplicas` as for applications then runs per service.
- **Plain Compose:** `listContainers` filtered by `com.docker.compose.project=<appName>` and grouped by `com.docker.compose.service`, leaving out one-off containers. The slot comes from `com.docker.compose.container-number`.
  - A container counts as ready when it runs and its health check passes, or it has none. That is the rule Traefik's docker provider uses to route to it.
  - Compose keeps no desired count, so the desired count shown is the snapshot's.
- Status is cached for 3 seconds per compose.

**Failure causes**, for applications as for Stack services. Swarm records a failed health check as `task: non-zero exit (137): dockerexec: unhealthy container`, which reads like a crash or an out-of-memory kill. Each failed replica of the last 15 minutes therefore gets a `cause` in words (`explainFailure`): a failed health check, an out-of-memory kill, a kill at the end of a stop's grace period (exit 137), or a plain non-zero exit. `diagnoseFailures` adds what the task does not record: it inspects the exited container (`ContainerStatus.ContainerID`) for `State.OOMKilled` and the outputs of the failed checks Docker kept (`State.Health.Log`, at most 5). An exited container never changes, so each one is inspected once and the result is cached (500 at most). A container Docker has removed, or one on a node the connection does not reach (only the manager is reached), is cached as unknown, and the cause then rests on the task's error and exit code. Plain Compose replicas get a cause from their exit code.

### Capacity

Stack services use the Stage 2 estimate, with requirements read from the live service spec (`getStackServiceCapacity`). The warning about missing reservations points to `deploy.resources.reservations` in the compose file. Docker reserves nothing for plain Compose containers, so no estimate is made for them.

### Locking

The compose deploy worker (`apps/dokploy/server/queues/deployments-queue.ts`) runs each deploy inside `withDeployLock("compose:<id>")`:
- a scale request is refused while a deploy holds or waits for that lock;
- a deploy waits for a scale that is already running.

So `docker compose` / `stack deploy` and live scaling never run at the same time. Since Stage 8 these locks are Postgres advisory locks as well as in-process ones, so they also hold between the web app and the autoscaler (see [Autoscaling](#autoscaling)).

### Limits

- **Plain Compose cannot place containers on other machines.** All replicas run on the server that runs `docker compose`. Spreading a compose across several VMs means deploying it as a Stack; the Scaling tab checks the file and switches it (see [Switching a compose to Stack](#switching-a-compose-to-stack)).
- **Relative `env_file` and bind-mount sources are still read from `code/`** when Compose starts a new replica. If a preview re-cloned newer files between deploys, new replicas get those files.

## Changes to existing behaviour

These fixes ship with Stage 1 because scaling depends on them:

- **Start restores the configured count.** `startService` / `startServiceRemote` used to run `docker service scale <app>=1`, so stop → start silently dropped an application or database to one replica. They now take the configured count from every caller (applications and all six database types), quote the service name, and reject non-integer counts.
- **Deploys apply the count stored at apply time.** Deploy jobs load the application when they start; `mechanizeDockerContainer` now re-reads `replicas`/`modeSwarm` right before applying the spec, and again on each retry.
- **Deploys only create a service when it does not exist.** Previously any update error (a version conflict, an SSH hiccup, an invalid spec) fell through to `createService`, which then failed with a misleading "name conflicts" error. Now `createService` runs only on a 404 from inspect, version conflicts are retried, and other errors surface as they are. The same applies to rollbacks.
- **Rollbacks restore code, not scale.** A rollback re-applies a stored snapshot; it now keeps the replica settings in effect today instead of the snapshot's.
- **Rollbacks keep pull credentials and Dokploy labels.** Without a rollback registry, the rollback used to send an empty auth object, which replaced the credentials Swarm stored for the service (later scale-ups could no longer pull a private image). It also dropped the `dokploy.*` container labels. Both are fixed.
- **`replicas` is validated server-side**: an integer from 0 to 100 on `application.update`, 1 to 100 on `scaling.setReplicas`.

Preview deployments keep their existing behaviour: they inherit the parent's configured count.

Stage 4 changes compose deployments: saved replica counts are written into the converted file on every deploy and preview, a successful deploy writes the snapshot described in [Compose and Stack services](#compose-and-stack-services), Start uses that snapshot, and compose deploys take the per-compose lock.

Stage 6 changes routing, as described in [Load balancing](#load-balancing):

- Application domains open a new connection to the VIP per request. Existing apps switch on their next deploy, domain change, or scale to more than one replica.
- Stack domains route through the VIP with the shared transport, and a Stack deploy with domains writes `dokploy-vip.yml` into Traefik's dynamic directory. Existing stacks switch on their next deploy.
- New installs poll the Swarm provider every 5 seconds.
- The Cluster join dialogs take an optional private address for the new node (`--advertise-addr` and `--data-path-addr`).

Support for hosts without Swarm VIPs (see [Hosts without Swarm VIPs](#hosts-without-swarm-vips)) changes:

- A Stack service with `endpoint_mode: dnsrr` is no longer routed to task IPs: its domains send Traefik to `http://<appName>_<service>:<port>` with the shared transport. Existing stacks switch on their next deploy.
- With `DOKPLOY_SWARM_ENDPOINT_MODE=dnsrr`, deploys and rollbacks give applications and Stack services DNS round robin instead of a VIP.

Later fixes to compose actions: Start deploys a stopped Stack again from its snapshot (see [Deployed snapshot](#deployed-snapshot)), and the compose page offers Start whenever a compose of either type is stopped. Before, a Stack only ever showed Stop, and Start did nothing for it.

Stage 8 adds a second process and changes how scaling is coordinated, as described in [Autoscaling](#autoscaling):

- On every start in production, Dokploy creates or updates the `dokploy-autoscaler` Swarm service from its own service spec.
- The scale and deploy locks also take Postgres advisory locks, on a separate pool of up to 20 connections, so they hold across processes. `isDeploying` became asynchronous.
- A manual scale is refused (`autoscaling_enabled`) while autoscaling is on for that application or compose service.

Stage 2 adds:

- **Resource values are validated.** `cpuLimit`, `cpuReservation`, `memoryLimit` and `memoryReservation` must be empty or whole numbers (NanoCPUs or bytes) up to 2^53 − 1, so `parseInt` stays exact; previously any text was accepted and reached Docker as `NaN`. Non-zero values must meet Swarm's minimums of 0.001 CPU and 4 MiB, which Swarm otherwise rejects at deploy time. A reservation above its limit is rejected (a limit of 0 means no limit), and `application.update` checks this against the stored values too, so a reservation sent on its own cannot exceed the saved limit. Applies to applications only.
- **Scale-ups are checked against capacity** (see below) and need explicit acknowledgement when they will not fit.

## Capacity estimation

Swarm schedules by **reservations**: a node accepts a task only while the sum of its tasks' reservations stays within the node's CPUs and memory. Limits cap what a task may use and reserve nothing; actual usage plays no part. The estimate follows the same rules:

- **Inputs:** `listNodes` (total CPUs and memory, role, labels, state, availability) and all tasks (`listTasks`), from the swarm the application is deployed to. As in swarmkit, a task holds its reservation until its *observed* state moves past `running`, whatever its desired state, so replicas that are shutting down and start-first replacements that are still starting are counted. The application's own current replicas are excluded, since they are part of what is being sized. Requirements come from the **running service spec** when the application is deployed, since that is what Swarm schedules, and otherwise from the saved settings via `generateConfigContainer` (which includes the default manager pin for apps with mounts).
- **Eligible nodes:** ready, availability `active`, and matching every placement constraint. Constraints are evaluated as swarmkit does: `==` / `!=`, attribute names, label prefixes and values compared case-insensitively, label names (`node.labels.<name>`, `engine.labels.<name>`) case-sensitively, and a missing label reads as empty. Supported attributes are `node.id`, `node.hostname`, `node.role`, `node.platform.os`, `node.platform.arch`, `node.labels.*` and `engine.labels.*`; anything else makes the node "unknown" rather than guessing.
- **Room per node** is the smallest of: (CPUs − other services' reservations) ÷ CPU reservation, the same for memory, the per-node maximum, and 1 when the service publishes host-mode ports. Without reservations or caps there is no limit.
- **Fit:** replicas are identical, so a request fits exactly when the per-node room adds up to at least the requested count, whatever order Swarm places them in. The result is `fits`, `insufficient`, or `unknown` (when only nodes with unevaluable constraints could make up the difference).

The report also carries `eligibleCpu`, the CPUs of the eligible nodes together, without the per-node list. The Autoscaling card compares it with the maximum replicas times the CPU limit: replicas past what the nodes can run at their limits only share the same CPUs, and Swarm places them anyway, since limits reserve nothing.

Warnings explain what the numbers cannot: no reservations set, image only on the build node (no registry) while several nodes are eligible, volumes being per node, host-mode ports, the manager pin, and nodes that are down or drained. Containers outside Swarm (compose projects, builds) use resources Swarm does not account for, so the estimate can be optimistic on busy hosts.

`setApplicationReplicas` re-reads the inventory (bypassing the 5-second cache) whenever the requested count is above what is running now, including for a stopped or undeployed service, which later starts with the saved count without any check. It rejects with `insufficient_capacity` unless `acknowledgeWarnings` is set; the Scaling tab sets it only after showing the warning in the confirmation. A rejection is recorded as a `blocked` event and clears the cached inventory; an acknowledged override records the shortfall message it overrode. Scale-downs and a failed estimate never block.

The guard covers changes made through the Scaling tab and `scaling.setReplicas`. A count saved through `application.update` (Advanced → Cluster Settings) and applied by deploy or start is not checked, which is unchanged Dokploy behaviour; Swarm then keeps replicas that do not fit pending, and the Scaling tab shows them. Two applications scaling at the same moment can also both pass the check. All gaps fail open to Swarm's own scheduling, which never overcommits reservations.

Per-node details (node names, sizes, other services' reservations) describe the whole cluster, so the `capacity` procedure returns them only to callers with `docker:read`, the permission `cluster.getNodes` already requires. Other callers get the summary, fit and warnings without the node list.

## Rollout and placement settings

Both are stored in the existing `updateConfigSwarm` and `placementSwarm` columns and apply on the next deploy, like the rest of Advanced → Cluster Settings. The Scaling tab edits them through structured, validated procedures rather than raw Swarm JSON:

- **Rollout** maps order, batch size, delay, monitor window, failure action and tolerated failure ratio onto Swarm's `UpdateConfig`. Swarm has no separate max-surge and max-unavailable: with `start-first` the batch size is the surge, with `stop-first` it is the number unavailable. Swarm rolls back with `RollbackConfig`, so the same order and batch size are written there too (other rollback fields are kept); otherwise choosing stop-first because of host-mode ports would still leave a start-first rollback that stalls on the same port. Delay and monitor are whole seconds and the failure ratio a whole percentage, so finer values set in Swarm Settings are rounded when the card is saved.
- **Placement** owns exactly one node-target constraint, the first it finds of `node.hostname==<node>`, then a node selection (`node.labels.dokploy.placement.<service>==true`), then `node.labels.dokploy.pool==<pool>`, then `node.role==manager|worker`. It also owns `MaxReplicas`. Every other constraint, including a second role or hostname pin, plus spread preferences and platforms, is shown and preserved. Saves from this card are merged against the stored value inside a row-locked transaction, so two of them cannot lose each other's changes; the raw Swarm Settings form still writes the whole placement and can overwrite this card's change if submitted from a stale page. An explicit "any node" is stored as `{ Constraints: [] }`, because a null placement makes apps with mounts fall back to the manager pin. Several specific hosts cannot be expressed with Swarm constraints (they are ANDed), so they get a label of the service's own instead (see [Placement across VMs](#placement-across-vms)).

Both changes are recorded in `scaling_event` as `policy_change`, with the before and after values.

Swarm returns a service's health check as `Healthcheck`, while Dokploy and the Docker API docs write `HealthCheck`. Docker accepts either on input (its JSON decoding is case-insensitive), but code that reads a live spec must use `Healthcheck`, and code that edits an inspected spec must overwrite that key rather than add the other spelling next to it.

## Blue/green deployments

An application can opt in with **Blue/green deployments** on the Scaling tab (`applications.blueGreenEnabled`, migration `0204`). It changes only how `mechanizeDockerContainer` applies a deploy; the Swarm service keeps the name `appName`, so logs, stats, scaling, the autoscaler, stop, start and delete need no change.

1. **Twin.** The new version is created as a temporary service `<appName>-green` with the same spec (its `dokploy.*` labels are left off, so it does not count as part of the application) and waited on until every replica runs. With a health check, a replica only counts once it is healthy. A second check follows a few seconds later, because a container that crashes right after starting is briefly "running".
2. **Switch.** The domains' file config (`<appName>.yml`) is rewritten so each server URL host is `<appName>-green` (`utils/traefik/blue-green.ts`, under the same lock as domain edits). Traefik applies the file by itself. Routers, middlewares and the transport are untouched.
3. **Update.** The real service is updated as usual (rolling, `start-first`) while it takes no traffic, and the deploy waits for the update to complete (`UpdateStatus` with a new `StartedAt`).
4. **Switch back** to `<appName>`, wait a few seconds for requests already sent to the twin, remove the twin.

If the twin never becomes healthy, it is removed and nothing else changes: the deploy fails and traffic stays on the old version. If the update of the real service rolls back, traffic returns to it and the twin is removed. A deploy that died midway is cleaned up first: the next one moves the domains back to `<appName>` and removes a stale twin.

The old version is not kept: after the switch it is replaced, so rollback is a redeploy from the Rollbacks tab.

It falls back to the normal rolling update when the application publishes ports (two services cannot bind the same one; the Scaling tab and `application.update` refuse to enable it then), on the first deploy, when the service is stopped (0 replicas), and in global mode. During the overlap the application needs resources for two copies, and both read the same volumes and database, so schema changes must work with the old version too. Plain Compose is not covered.

### Stacks

A Stack opts in with the same card on its Scaling tab (`compose.blueGreenEnabled`, migration `0205`; refused for plain Compose and for a custom command). Stack domains are Traefik labels on the services, not the file config, so the switch works on labels, and the whole sequence runs as shell inside the deploy script (`getStackBlueGreenScript`, `utils/docker/blue-green-stack.ts`), which also makes it work on remote servers and puts every step in the deployment log. It applies only when the stack already runs; the first deploy is a plain `docker stack deploy`.

1. **Twin.** The converted compose file is deployed as a second stack `<appName>-green`, with every `traefik.*` and `dokploy.*` label removed, so it gets no routes and is not attributed to the compose. The script waits until every service reports all replicas running (healthy, when it has a health check), then checks again after 5 seconds.
2. **Switch.** For each running service, `docker service update --label-rm/--label-add` replaces its `loadbalancer.server.port` label (and `traefik.swarm.lbswarm`) by `loadbalancer.server.url=http://<appName>-green_<service>:<port>`. A service label update does not restart tasks, and Traefik's Swarm provider (polling every 5 seconds) re-reads it. The original labels were saved first. A key that is both removed and re-added (the `url` label of a `dnsrr` service) is not removed: Docker applies `--label-add` before `--label-rm`.
3. **Update.** After 12 seconds, the real stack is deployed from the same file with the redirected labels, so the new image rolls out while traffic is on the twin. The script waits for each changed service's update to complete (a new `UpdateStatus.StartedAt` reaching `completed`); a service whose spec did not change, or only its labels, is not waited on.
4. **Switch back.** The real stack is deployed again with its normal labels (a label-only change, so no restart), the script waits 12 seconds, and removes the twin.

Any failure after the twin exists (not healthy, update rolled back or paused) puts the saved labels back, removes the twin and fails the deploy; the running version keeps serving. Restoring only happens if the labels were saved, so a failure before the switch changes nothing.

It applies only to stacks that `stackBlueGreenIneligibility` accepts: no service mounts a volume or publishes a port, every service is replicated with at least one replica, and at least one service has a domain. Two copies of a service sharing a volume or a database file would corrupt it, which is why stacks with state are refused. Otherwise the deployment log says `Blue/green skipped: <reason>` and the deploy is a plain rolling update. In the Swarm test on the lab VM, a 2-replica nginx stack upgraded from 1.25 to 1.27 under about 10 requests a second served 680 of 680 requests with status 200.

## Multi-VM networking

Each Dokploy server is one swarm. Stage 5 lets that swarm grow to VMs anywhere by joining them over WireGuard, managed from Dokploy over SSH (`services/cluster-mesh/*`). Operating it is covered in [multi-vm.md](multi-vm.md).

- **The manager is never re-addressed.** A lab test showed that moving a manager to a new advertise address (`docker swarm init --force-new-cluster`) restarts every container and leaves the raft record, and so the workers' list of managers, on the old address. Instead:
  - workers route the manager's existing swarm address through the tunnel (policy routing on WireGuard's fwmark, wg-quick `Table = off`);
  - the manager's tunnel route uses its swarm address as source, so gossip and VXLAN arrive from the address peers know.
- **Workers use their tunnel address for everything** (`--advertise-addr`, `--data-path-addr`, `--listen-addr`). A systemd drop-in starts Docker after `wg-quick@wg-dokploy`, because Swarm cannot bind that address before the tunnel exists and does not retry.
- **The database holds the topology** (`cluster_mesh`: one per swarm, keyed by server or `local`, with the tunnel subnet and UDP port chosen at setup; `cluster_node`: one per VM, including the manager). Each change re-renders every member's config and applies it with `wg syncconf`. Private keys are generated on each VM and substituted there; Dokploy stores only public keys.
- **Operations are serialised per mesh** with the in-process lock from `scale-lock.ts`, run in the background, and write a per-VM log (the last 64 KB) shown in the UI. A failed add rolls back: leave, node removal, peer removal, WireGuard teardown.
- **Secrets on the VMs:** the swarm join token and registry passwords reach them over SSH stdin, never in a command line, and errors carry remote output but not scripts.
- **New VMs join paused.** Activation runs `findClusterPreflightIssues`, which lists services that would break on another node; the router refuses activation until those findings are acknowledged.
- **Permissions:** viewing needs `docker:read`; every change needs `server:create`; SSH keys and servers must belong to the caller's organization. Not available on Dokploy Cloud.
- **Overlay MTU:** overlays keep Docker's default MTU, and their VXLAN packets are fragmented inside the tunnel (verified with 2 MB transfers). The tunnel MTU itself is the smallest underlay MTU − 80, checked with an unfragmented full-size ping both ways before a VM joins.

## Placement across VMs

Stage 6 decides where replicas run once a swarm has several VMs, and makes traffic reach all of them.

**Node pools.** A pool is the node label `dokploy.pool=<name>`, set from the Multi-VM networking node table (`clusterMesh.setNodePool`, `server:create`) or with `docker node update --label-add` on nodes joined another way. `clusterMesh.pools` lists the pools in use. Choosing a pool in the Placement card writes `node.labels.dokploy.pool==<name>`. Label names are case-sensitive in Swarm, so the key is written exactly.

**Spreading.** Swarm's scheduler already puts each new task on the eligible node running the fewest tasks of that service, then the fewest tasks overall, so a `spread: node.id` preference would change nothing. Stage 6 therefore adds no spread setting; `MaxReplicas` is the hard limit per node. Swarm never moves running tasks: a VM that joins later gets replicas only as tasks are replaced (a deploy, or a scale down and up).

**Several nodes.** A pool holds each node once, so pools cannot express overlapping choices such as one service on nodes 1 and 2 and another on nodes 2 and 3. "Several nodes" covers that with a label per service, `dokploy.placement.<swarm service>=true` (`<appName>` for an application, `<appName>_<service>` for a Stack service):
- On save, `syncNodeSelection` (`services/scaling/node-selection.ts`) puts the label on exactly the chosen nodes and takes it off the others, re-reading a node and retrying when Swarm reports a stale version. The placement then stores `node.labels.dokploy.placement.<service>==true`. A node ID no longer in the swarm is refused (`unknown_node`) before anything changes.
- The chosen nodes are read back from the labels, not stored elsewhere, so the card always shows what Swarm will use. A node that joins later is not included until it is chosen.
- Choosing another target removes the service's label from every node, after the placement is saved; a failure there is logged, since a label nothing points at selects nothing.
- Labels are written under `service:create`, like the rest of the card, because each service only touches its own label. Listing nodes (`scaling.placementNodes`, `scaling.composePlacementNodes`) needs `docker:read`, like the capacity details; it reports each node's pool, its selection labels, and its Multi-VM networking name.
- Swarm does not move running tasks when labels change, so like every placement change it applies on the next deploy.

**Stack services.** Each service of a Stack has the same Placement card, saved in `compose_service_scaling.placement` (migration `0202`; `replicas` became nullable so a row can hold placement only). `applyReplicaOverrides` merges it into `deploy.placement` of the converted file on every deploy, keeping the file's other constraints and preferences; `max_replicas_per_node` is written when set. Placement is ignored for plain Docker Compose. Saving records a `policy_change` event and applies on the next deploy.

**Registry check.** The Capacity card warns when replicas can land on nodes that cannot pull the image. For applications this is the Stage 2 check (built on the server, no registry). For Stack services Dokploy reads the running spec: `docker stack deploy` pins every image it resolved from a registry to its digest (`image@sha256:…`), so an image without one was built or loaded on that node only.

**Distribution.** The Scaling tab shows how many replicas run on each node, for applications and Stack services.

**Logs and containers on other nodes.** Dokploy runs Docker commands on the manager, which cannot reach a container on a worker. `getContainersByAppNameMatch` for a Stack lists the tasks of every node (`docker stack ps`) and marks each `local` when its node is the manager's own (`docker node inspect self`), with its `taskId`. The compose Logs tab, in Native mode, streams a replica that is not local through its task (`docker service logs --raw <taskId>`, which the manager serves for every node) instead of `docker container logs <id>`, and the Containers tab offers only its logs.

### Switching a compose to Stack

A plain Docker Compose project cannot use other machines, so the compose Scaling tab offers to switch it to Stack. `checkStackCompatibility` runs over the deployed snapshot, or the compose file before the first deploy:

| Finding | Severity | Why |
|---|---|---|
| `build:` without `image:` | Must fix | `docker stack deploy` does not build |
| `network_mode` | Must fix | Not supported by Swarm services |
| `build:` with `image:` | Change | The image must already be in a registry |
| `privileged`, `container_name`, `depends_on`, `links`, `restart` | Change | Ignored by `docker stack deploy` |
| Fixed host ports | Change | Published through Swarm's ingress on every node instead of one host port |
| Relative bind mounts | Change | Resolved on whichever node runs the task |
| Named volumes | Change | Per node; pin stateful services |

`switchComposeToStack` refuses blocking findings and needs confirmation for the others. It then runs `docker compose -p <appName> down --remove-orphans` (volumes kept: Compose and Stack both name them `<appName>_<volume>`, so the stack reuses them), removes the isolated-deployment bridge network after disconnecting Traefik from it, sets the type to Stack and queues a deploy. The services are down from `down` until the stack deploy finishes. The router requires `service:create` and `deployment:create`, and the switch is not offered on Dokploy Cloud.

## Replica metrics

Docker reports container stats only for its own host, so per-replica CPU and memory need an agent on every node. Dokploy's existing monitoring agent (`apps/monitoring`) is extended for this rather than adding cAdvisor or Prometheus. Installing, publishing and operating it is covered in [metrics-agent.md](metrics-agent.md).

**Collection (agent, `tasks` package).** When `metricsConfig.tasks.enabled` is set, every agent reads its own node's replicas through the Docker Engine API (not `docker stats` text) every `tasks.refreshRate` seconds (default 15). A replica is a swarm task container, or a container that Docker Compose started for a service (not a one-off `docker compose run` container):

- Stats are read with `one-shot=true`, which returns immediately, and CPU is computed from the difference between two ticks: cores = Δcontainer CPU ÷ Δhost CPU × online CPUs. A container's first reading, and one whose counters went backwards (restarted), produce no sample.
- Memory is the working set (usage minus inactive page cache), the same figure `docker stats` shows, on cgroup v1 and v2.
- Swarm samples are keyed by the swarm service name, with task ID, slot and node. Docker Compose samples are keyed `compose:<project>/<service>`, which no swarm service name can be; the container ID stands in for the task ID and the container number for the slot, and the node is left empty. Dokploy's own `dokploy-*` services and projects are skipped.
- The agent lists all running containers and picks these out itself, because the Engine API ANDs label filters, so one query cannot ask for swarm tasks or Compose containers.
- Its task endpoints answer with the header `X-Dokploy-Agent-Features: compose`. An agent from before Compose sampling sends none, which is how Dokploy tells "update the agent" from "no readings yet".
- They are stored in their own SQLite table with Unix-millisecond timestamps (the older tables' RFC 3339 strings do not sort reliably) and kept for `tasks.retentionHours` (default 24).

**Cluster view.** `GET /metrics/tasks/cluster?service=` on a manager lists the swarm's nodes, reads its own samples locally and asks every other ready node's agent at `<node address>:<port>/metrics/tasks` with the same token, in parallel with a 3-second timeout each. It returns the merged samples, per-node reachability and `partial: true` if a ready node's agent did not answer. Nodes that are down are listed but do not make the result partial, since Swarm moves their tasks elsewhere.

**Reading it from Dokploy.** `getApplicationMetrics` and `getComposeServiceMetrics` find the agent from stored config (`server.metricsConfig` for remote servers, `webServerSettings.metricsConfig` for the Dokploy host) and call it server-side:

- An application or a Stack service (`<appName>_<service>`) can have replicas on any node, so Dokploy calls the manager's cluster endpoint.
- A plain Docker Compose service runs where Compose ran, which is the node whose agent Dokploy reaches for that server, so Dokploy calls that agent's `/metrics/tasks` directly for `compose:<appName>/<service>`. Without the features header it reports the agent as `outdated`, and the card offers to update it; updating redeploys `dokploy-monitoring` with the configured agent image (`getMonitoringImage`).

- Remote servers are reached at the server's IP address. The Dokploy host's agent is reached at the swarm node address (`docker info` → `Swarm.NodeAddr`), because Dokploy runs in a container where localhost is the container itself; `DOKPLOY_MONITORING_URL` overrides this.
- A reading is fresh when it is no older than three collection intervals. For each **ready** replica the latest reading is reported; averages use only fresh readings. Missing or stale readings are reported (`coverage`, `partial`), never filled in, so the autoscaler can refuse to act on incomplete data.
- Utilization is measured against the replica's reservation, or its limit when there is no reservation, and is omitted when neither is set. For an application these come from its settings, for a Stack service from the spec Swarm runs (`TaskTemplate.Resources`), and for a plain Compose service from what Docker enforces on one of its containers (`HostConfig.NanoCpus` or `CpuQuota`/`CpuPeriod`, `Memory`, `MemoryReservation`). Compose turns `cpus`, `mem_limit` and `deploy.resources` into those; Docker has no CPU reservation for plain containers.
- Chart series follow the replica **slot**, so a replaced task continues the same line; long ranges are averaged down to at most 240 points per replica.
- An agent that cannot be reached, returns an error or returns an unexpected shape is reported as `unreachable` with the reason, not as a failed request.

**Deployment.** `dokploy-monitoring` now runs in **global** mode (one agent per node, no manager constraint) with its database in the named volume `dokploy-monitoring-data`; a bind-mounted file would exist only on the node Dokploy prepared. Remote servers keep host networking; the Dokploy host publishes the port in host mode on each node. Swarm cannot change a service's mode, so an agent from an earlier version is removed and recreated, and its stored history is not carried over. The image is `ghcr.io/brandlocusai/dokploy-monitoring` (`latest`, or `canary` where Dokploy runs a non-latest tag), overridable with `DOKPLOY_MONITORING_IMAGE`; if pulling fails but the image is already on the node, it is used.

**Security.** The agent's endpoints all require its bearer token, now compared in constant time, and the agent no longer prints its configuration (which contains the token) at startup. Threshold alerts are sent only by the swarm leader's agent, so running one agent per node does not multiply them. Reading metrics requires `service:read` and `monitoring:read`; enabling the agent requires `server:create` and is not offered on Dokploy Cloud. The monitoring settings forms keep the `tasks` block when they save, so editing other monitoring settings does not turn collection off.

## Load balancing

Traefik is the single entry point; it reaches replicas on any VM over the swarm's overlay network.

**Measured problem.** Dokploy sent application domains to `http://<appName>:<port>`, the Swarm VIP. IPVS balances the VIP per **connection**, and Traefik keeps keep-alive connections to its backends, so sequential requests all went to one replica (40 of 40 in the Stage 6 lab, on a three-node swarm). Stack domains used Traefik's swarm provider, which routes to task IPs. That balanced evenly, but Traefik only polls Swarm, while Swarm takes a stopping task out of the VIP and waits two seconds before stopping it. So scaling down under load returned 502s in two of four runs (nginx, 4 → 1).

**What Dokploy writes now:**

- **Application domains** keep the VIP URL, and the app's Traefik file gets a transport `<appName>-vip` with `maxIdleConnsPerHost: -1` (no connection reuse) that every `<appName>-service-*` service references. `setApplicationTransport` adds it on every domain change and drops it with the last service. `ensureApplicationTransport` brings existing files onto it after each deploy (`mechanizeDockerContainer`) and after a manual scale to more than one replica. A transport a user set on a service is left alone.
- **Stack domains** get `traefik.swarm.lbswarm=true`, so Traefik uses the service's VIP, and `loadbalancer.serverstransport=dokploy-vip@file` on each Traefik service of the domain. Labels cannot define a transport, so the deploy script writes `dokploy-vip.yml` to Traefik's dynamic directory (only when its content differs) before `docker stack deploy`. A service with `endpoint_mode: dnsrr` has no VIP: its domains get `loadbalancer.server.url=http://<appName>_<service>:<port>` in place of the port, with the same transport, so Traefik resolves the service's name on each connection instead of polling task IPs. A `traefik.swarm.lbswarm` label the user set wins.
- **Plain Compose** is unchanged: Traefik's docker provider gets one server per container, from Docker events.

**Result in the lab:** requests spread evenly over every replica on every node (10/10/10/10), and 0 failed requests in 7 scale-down runs. The cost is one TCP handshake per request between Traefik and a replica: about 1.5 ms per request in the lab (dind on Docker Desktop), and one round trip over WireGuard when the replica is on another VM.

**Health gating.** Swarm adds a task to the VIP once it runs (after its first passing health check, when it has one, whether set in Dokploy or in the image), removes it before stopping it, and replaces tasks that turn unhealthy. Scaling therefore needs no Traefik change.

**Swarm provider polling.** The default Traefik configs for new installs set `providers.swarm.refreshSeconds: 5` (Traefik's default is 15). That matters for routes still on task IPs (stacks with `traefik.swarm.lbswarm=false`). Existing installs keep their `traefik.yml`.

Known limits:

- Traefik sees one backend per domain, so per-replica request counts and sticky sessions are not available.
- A replica that Swarm removes is cut after its stop grace period, and connections still open on it are closed then.
- Long-lived connections (WebSocket, streaming) stay on the replica they opened on; a new replica takes only new connections.

### Hosts without Swarm VIPs

Swarm builds VIPs, and the ingress mesh for published ports, on IPVS. An unprivileged LXC container cannot set IPVS up: the kernel answers `Permission denied` even when the `ip_vs` module is loaded. Services there start, but nothing reaches them through their VIP, so domains time out and services cannot call each other by name.

`DOKPLOY_SWARM_ENDPOINT_MODE=dnsrr` on the `dokploy` service (`utils/docker/endpoint-mode.ts`) makes Dokploy deploy services with DNS round robin instead:

- **Applications** get `EndpointSpec.Mode: dnsrr` on deploy and rollback (`withDefaultEndpointMode`). Their domain route is unchanged: `http://<appName>:<port>` now resolves to the replicas' own addresses, and since the transport opens a connection per request, Traefik resolves the name again for each request.
- **Stack services** get `deploy.endpoint_mode: dnsrr` in the converted file (`applyDefaultStackEndpointMode`, called from `addDomainToCompose`), so their domains route by name as described above.
- **Exceptions.** A mode set in the app's Swarm Settings or in the compose file is kept. So is the VIP of a service that publishes a port through the ingress mesh, because Swarm rejects that combination; such ports don't work on these hosts anyway, so publish them in host mode.
- Swarm switches an existing service from `vip` to `dnsrr` in place, so services change on their next deploy.
- The setting covers every server this Dokploy deploys to. DNS round robin also works where IPVS does; replicas are then picked at random instead of in turn.
- Plain Docker Compose and databases are unaffected: Compose uses no VIPs, and Dokploy already deploys databases with `dnsrr`.

**Measured** on an unprivileged Proxmox LXC container (Docker 28.5, Traefik 3.6, `traefik/whoami`, routes written the way Dokploy writes them): 30 requests through Traefik spread 13/7/10 over 3 replicas, for an application route and for a Stack route. Scaling 3 → 1 and 4 → 2 under load failed 0 of 500 application requests and 0 of 750 Stack requests: Docker removes a stopping task from DNS before stopping it, as it does from the VIP.

## Autoscaling

Stage 8 adds and removes replicas automatically for applications, Stack services and plain Docker Compose services. Docker Compose services stay on their one server.

### Where it runs

The controller is its own process, the Swarm service `dokploy-autoscaler`, so it keeps working while the web app restarts or is upgraded. `ensureAutoscalerService` (`setup/autoscaler-setup.ts`) creates it on every production start of Dokploy, not on Cloud:

- It copies the `dokploy` service's image, environment, secrets, mounts, network and placement. The autoscaler therefore reaches the same database, Docker socket, compose files and SSH keys, and runs the same version.
- It overrides the command (`wait-for-postgres`, then `dist/autoscaler.mjs`), the health check (the image's probes the web app's port), one replica, and `stop-first` updates.
- A label holds a fingerprint of that spec. The service is updated only when the fingerprint changes, for example after Dokploy's image changes.
- `DOKPLOY_AUTOSCALER=off` on the `dokploy` service removes it instead.
- When Dokploy does not run as a Swarm service (development), nothing is created; `pnpm dokploy:autoscaler:dev` runs the controller.

The process (`apps/dokploy/server/autoscaler.ts`) serves `GET /health` on `127.0.0.1:3100` inside its container, which answers 503 when the control loop has not come round for 2 minutes, so Swarm replaces a stuck controller as well as a crashed one.

### Leader and heartbeat

`runAutoscaler` loops on a Postgres session advisory lock (`dokploy:autoscaler`). The process that holds it evaluates policies every 5 seconds and writes a heartbeat to `autoscaler_controller`; any other one checks again every 15 seconds. Postgres releases the lock when the holder's session ends, so a crashed leader is replaced within one standby interval (3 seconds in the lab). The Scaling tab reads the heartbeat and warns when it is more than 90 seconds old.

### Locks shared with the web app

`scale-lock.ts` keeps its in-process queue and adds Postgres advisory locks on a separate pool (`advisory-lock.ts`), one dedicated connection per held lock:

- `withScaleLock(key)` also holds `dokploy:scale:<key>`, so a manual scale and an autoscaler scale of the same target never overlap.
- `withDeployLock(key)` also holds `dokploy:deploy:<key>` for the length of a compose deploy, and `isDeploying(key)` checks it from any process. So the autoscaler, like a manual scale, refuses to scale a compose that is deploying.
- A lock is tied to its connection: a process that dies loses its locks immediately.

### One evaluation

Each enabled policy is evaluated once per `evaluationIntervalSeconds`, at most four at a time. `evaluatePolicy` reads everything again each time, so a restart or a new leader never acts on stale state:

1. **Gates.** It holds without reading metrics when the target is not deployed, stopped, in global or job mode, in a rollout or a deploy (`applicationStatus`, `composeStatus` or the deploy lock), deployed with a custom compose command, or a plain Compose service that can run only one container.
2. **Bounds.** A count below the minimum or above the maximum is corrected at once, without metrics or windows.
3. **Settling.** While replicas start or stop it holds, because their readings are not steady.
4. **Metrics.** `getApplicationMetrics` or `getComposeServiceMetrics` over the last 5 minutes. The averages cover replicas with a fresh reading, against each replica's reservation or, failing that, its limit.
5. **Decision** (`decideReplicas`, below).
6. **Capacity.** Before a scale-up of an application or Stack service it reads `placeable` from the capacity estimate. It scales only as far as fits, and holds if nothing more fits, instead of leaving replicas pending.
7. **Apply.** Through `setApplicationReplicas` or `setComposeServiceReplicas` with the trigger `{ source: "autoscaler", reason }`. The change takes the same locks, checks and history as a manual one, and updates the saved count, so later deploys keep it.
8. **State.** The decision, the recent recommendations and the timestamps are written to the policy row (`saveEvaluation`), never the user's settings.

### The decision

`decideReplicas` follows Kubernetes' HPA:

- Each targeted metric asks for `ceil(current × usage ÷ target)`. An ask within `tolerancePercent` of the target means no change. The highest ask wins, clamped to the bounds.
- **Memory leaves removals to CPU** when CPU has a reading too. Memory above its target still adds replicas, and memory within the tolerance still holds them, but memory below the band has no say. The HPA rule reads memory as load that spreads over the replicas, yet most of what a replica holds when idle is its own baseline, which stays with it whatever the load. In a load test, two idle Next.js replicas at 34% of a 256 MiB reservation asked for `ceil(2 × 34 ÷ 60) = 2` against a 60% target and never went back to 1, with CPU at 0%. With memory as the only metric, or without a CPU reading, the HPA rule applies unchanged.
- When the metrics disagree and one of them holds the count, the reason names it: "CPU 0% (target 70%), Memory 58% (target 60%): memory keeps 2 replicas; CPU alone would run 1 replica".
- A change happens only once every recommendation over its window agrees: scale-up takes the lowest recommendation of the last `scaleUpWindowSeconds`, scale-down the highest of the last `scaleDownWindowSeconds`. The history keeps the last entry from before the window, which proves the readings were steady for all of it. While it waits, the reason counts from the last recommendation against the change ("wants 1 replica for 32s of the 5 min scale-down window"), since that one has to leave the window first.
- Any hold (a gate, settling, missing metrics) clears the history, so a window only covers uninterrupted readings.
- No change within `cooldownSeconds` of the last one, and at most `maxScaleUpStep` or `maxScaleDownStep` replicas per change.
- **Missing data never scales down.** With some ready replicas lacking a fresh reading, those count as idle when deciding to scale up, and scale-down waits. With no fresh reading at all, or no reservation or limit to compare a targeted metric with, it holds.
- It does not add replicas while others wait for a node; it may still remove some.

| Setting | Default | Range |
|---|---|---|
| Minimum / maximum replicas | 1 / 3 (the form starts from the current count) | 1–100 |
| CPU target | 70% | 5–100%, or off |
| Memory target | off | 5–100%, or off |
| Tolerance | 10% | 0–50% |
| Evaluation interval | 30 s | 15–600 s |
| Scale-up window | 60 s | 0–3600 s |
| Scale-down window | 300 s | 0–7200 s |
| Cooldown after a change | 60 s | 0–3600 s |
| Most added / removed per change | 4 / 1 | 1–100 |

### History and the manual control

- An applied change is a `scale_up` or `scale_down` event with source `autoscaler` and the decision as its reason (for example "CPU 400% (target 50%) over 10s: adding 2 replicas").
- Holds that need attention (metrics unavailable, no reservation or limit, no room, a failed scale, an evaluation error) are recorded once per problem, as `hold` or `error`. A stable key in the state (`lastEventKey`) tells a lasting problem from a new one, since the reason carries the current readings. Ordinary holds (within target, waiting out a window, cooling down) are only shown on the card.
- Turning autoscaling on or off, and changing it, is a `policy_change` event.
- While autoscaling is on, `setApplicationReplicas` and `setComposeServiceReplicas` refuse manual changes (`autoscaling_enabled`), and the Scaling tab disables the manual control.

### Logs

The `dokploy-autoscaler` service logs, under the Swarm service name (or `<appName>/<service>` for plain Compose):

- every change it applies, as `Autoscaler: <name>: scale_up 1 -> 2: <reason>`;
- every hold or error recorded in the history, once per problem, as a warning;
- with `DOKPLOY_AUTOSCALER_LOG=debug` on the `dokploy` service, whose environment the autoscaler copies, every evaluation, ordinary holds included.

`(node:1) TimeoutNegativeWarning: -17840331.65 is a negative number` can appear at any time and is harmless. postgres.js (3.4.4 here, unchanged in 3.4.7) reopens a pooled connection with `setTimeout(connect, closedDate + delay - performance.now())`, which is negative once the connection has been closed for longer than its backoff, here about 5 hours. Node 23 and later warn about a negative delay and use 1 ms, which is what the driver means.

### API and permissions

`scaling.autoscaling` (`service:read`) returns the settings, or defaults when none are saved, the last decision and the controller's heartbeat. `scaling.updateAutoscaling` needs `service:create` and `deployment:create`, since it hands replica changes to the controller. It refuses to turn autoscaling on for a target that cannot be scaled (global or job mode, a custom compose command, a single-container service) and is not available on Dokploy Cloud. Both take a target: `{ kind: "application", applicationId }` or `{ kind: "compose", composeId, serviceName }`.

### Limits

- **CPU and memory only.** Request rate is not a signal yet.
- **Memory that grows with load but CPU that does not**, such as an in-memory cache, should be targeted alone: alongside CPU, memory below its target cannot keep replicas, so removing them on CPU would push the rest over the memory target and scale back up.
- **Metrics need the agent** with per-replica collection on the target's server (and, for plain Compose, this release's agent).
- **A replica's usage is compared with its reservation or limit.** Without either for a targeted metric, the autoscaler holds and says so.
- **Plain Docker Compose replicas stay on one server**, and capacity is not estimated for them.
- **One controller for all servers.** It reaches remote servers over SSH like the web app does, so a server it cannot reach is held with the error shown.

## Concurrency, failure handling and security

- **One change per target at a time.** The scale lock is an in-process queue plus a Postgres advisory lock, so it holds across the web app and the autoscaler. Concurrent requests run in order, and each one re-reads the live count. Each compose shares one lock between its deploys and its scale requests (see [Compose and Stack services](#compose-and-stack-services)).
- **Rate limit:** 10 manual scale requests per application, or per compose service, per minute (`TOO_MANY_REQUESTS`), kept in the web app's process. The autoscaler is bounded by its own interval, windows and cooldown instead.
- **Caches:** one in-flight status read per application for 3 seconds, and one node/task inventory read for 5 seconds, so several viewers polling the tab do not each open an SSH session. Both are invalidated on every scale, and the inventory also on placement changes.
- **SSH key guard:** `getRemoteDocker` falls back to the local daemon when a server has no SSH key; scaling refuses instead of reporting on, or scaling, the wrong host.
- **Authorization** reuses existing permissions, so no new role resource is needed: reading status, capacity, settings and history requires `service:read` plus access to the application or compose (per-node capacity details additionally need `docker:read`); scaling requires `deployment:create` (the same as start/stop/redeploy); changing rollout and placement requires `service:create` (the same as `application.update`). All checks go through `checkServicePermissionAndAccess`, which also enforces the organization boundary.
- **Command injection:** compose service names reach `docker compose` as separate arguments (locally through `execFile`, remotely quoted with `shell-quote`), and the API accepts only names Compose itself allows.
- **History:** every save, scale and failure is a row in `scaling_event` (who, from, to, applied or not, reason). A row belongs to an application or to one service of a compose; a `CHECK` constraint enforces exactly one. This is independent of the licensed audit log; `audit()` is still called so licensed installs get an entry too.

## Testing

- Unit tests: `apps/dokploy/__test__/scaling/*` and `__test__/server/mechanizeDockerContainer.test.ts` (spec shape, retries, refusals, start/rollback fixes, router permissions and validation, rate limit).
- Failure causes: `task-status.test.ts` (health check, out of memory, exit codes, and a container inspected with the load test's health log).
- Real-Swarm tests run in CI, or locally when Docker is in Swarm mode with a `dokploy-network` overlay (`__test__/scaling/real-swarm.ts` decides):
  - `scaling.real.test.ts`: scaling 2 → 3 keeps the original tasks running and leaves `ForceUpdate` untouched, connections through the VIP reach all three replicas, scaling down converges, and scaling is refused while Swarm reports a rollout as `updating`.
  - `capacity.real.test.ts`: the estimated number of replicas all run, and one more leaves exactly one task pending with Swarm's "insufficient resources".
  - `rollout.real.test.ts`: an update config produced by the rollout settings makes Swarm roll back on its own when the new version fails its health check.
  - `metrics.real.test.ts`: on a two-node swarm, the setup code replaces a single-replica agent with one agent per node, and every replica's CPU and memory are read from both nodes. It needs an agent image built from this branch and runs only when `DOKPLOY_MONITORING_TEST_IMAGE` names it (see [metrics-agent.md](metrics-agent.md)).
  - `compose-metrics.real.test.ts`: the agent, run as a container beside a Docker Compose project scaled to 2 plus a one-off container, stores samples for exactly the two replicas, under `compose:<project>/web`, with slots 1 and 2 and the 128 MiB limit, and Dokploy's client reads them with the features header. Same `DOKPLOY_MONITORING_TEST_IMAGE` gate; needs only the local Docker.
- Compose scaling unit tests: `compose-overrides`, `compose-snapshot`, `compose-status`, `compose-scale`, `compose-scaling-router` and `scale-lock` in `__test__/scaling/`, plus `__test__/compose/domain/replica-overrides.test.ts` and `__test__/compose/compose-scaling-deploy.test.ts` (overrides reach the deploy, the snapshot is written after success, Start uses it).
- `compose-scaling.real.test.ts`: plain Compose 1 → 3 keeps container 1 (same ID and start time) and interpolates new replicas from the snapshot's env file; after `code/` is deleted, scaling to 2 removes container 3; Stop → Start keeps 2; a stopped replica blocks scaling. Stack 1 → 3 keeps the existing tasks; redeploying the file with the override keeps 3, and the raw file resets it to 1.
- `compose-snapshot-script.real.test.ts` runs the generated snapshot shell lines in a Linux container.
- Placement and load balancing: `scaling-settings.test.ts` (pools, several nodes), `node-selection.test.ts`, `settings-service.test.ts`, `compose-placement.test.ts`, `stack-switch.test.ts`, `stack-capacity.test.ts`, `__test__/traefik/vip-transport.test.ts`, `__test__/compose/domain/stack-vip.test.ts` (also `dnsrr` routing by name and `DOKPLOY_SWARM_ENDPOINT_MODE`). The setting's effect on application deploys and rollbacks is in `__test__/server/mechanizeDockerContainer.test.ts` and `rollback-application.test.ts`. `multinode-lb.real.test.ts` runs on a swarm of at least two nodes when `DOKPLOY_MULTINODE_TRAEFIK_URL` points at the manager's port 80. It needs some nodes labelled `dokploy.pool=web`, a `dokploy-network` overlay, and `DOCKER_HOST` plus `DOKPLOY_DOCKER_HOST`/`DOKPLOY_DOCKER_PORT` aimed at the manager. It checks that an application spreads over every node and Traefik reaches all its replicas, that a pooled Stack service stays on its pool and Traefik reaches all its replicas, and that scaling both down under load fails no request. It was run on three dind nodes.
- Multi-VM networking: `__test__/cluster-mesh/*` (address allocation, MTU, rendered configs for manager and worker, script contents and secret handling, the Docker version per Ubuntu release, failure output that keeps the last lines of either stream, the activation check, router permissions and organization checks). End to end in a lab of three systemd Ubuntu 24.04 containers, through the Dokploy UI: setup, adding a VM without Docker, activation with and without findings, traffic spread evenly over 6 replicas on 3 VMs with direct traffic between them blocked except UDP 51820, reboot ordering, remove, force remove and turning it off.
- Autoscaling: `autoscaler-decision.test.ts` (the HPA rule, tolerance, windows at realistic evaluation spacing, cooldown, steps, bounds, partial data, pending replicas, holds, memory alongside CPU with the load test's readings, the countdown while waiting), `autoscaler-controller.test.ts` (gates, capacity capping, one event per lasting problem, failed scales and evaluations, Compose services, due policies, leader and standby, log lines), `autoscaling-router.test.ts`, `autoscaler-setup.test.ts`, the `autoscaling_enabled` guard in `manual-scale.test.ts`.
  - `advisory-lock.real.test.ts` (with `DOKPLOY_TEST_DATABASE_URL`, any Postgres it may lock on): a held lock keeps other sessions out until released; a session that dies frees its lock and its holder sees it; a deploy or a scale in another session is seen by `isDeploying` and waited for, or refused, by `withScaleLock`.
  - `autoscaler.real.test.ts` (with `DOKPLOY_MONITORING_TEST_IMAGE` and a local swarm): the controller, with real metrics from the agent, real capacity and real scaling, takes a service whose replicas burn a core for 75 seconds against a 0.25-core reservation from 1 to 3 replicas, then back to 2 and 1 once they idle.
  - Lab: two controller processes on one database; the second stands by and takes over 3 seconds after the leader is killed.
  - Load test on a 2-vCPU single-node swarm, Stack service of a Next.js app (CPU limit 1, 256 MiB memory reservation), CPU target 70% and memory target 60%: under 120 connections it went from 1 to 2 replicas 98 seconds in ("CPU 99% … over 60s: adding 1 replica"), held at 2 with each replica near 70% CPU, and served 32,643 requests, all 200. Five minutes after the load stopped it went back to 1 with idle memory at 32%, which the plain HPA rule would have kept at 2.
- Metrics unit tests: `metrics-client.test.ts` (application, Stack and plain Compose reads, the outdated-agent case, utilization bases), `compose-scaling-router.test.ts` (permissions for `composeMetrics` and `setupComposeMetricsAgent`).
- Agent tests: `cd apps/monitoring && go test ./...`. The SQLite store test needs cgo, so on a machine without a C compiler it is skipped; run it in a Linux container or CI.
