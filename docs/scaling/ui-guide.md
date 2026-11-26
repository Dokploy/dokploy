# Replica scaling: the Scaling tab

Open an application and select **Scaling** (keyboard: `g` then `r`). The tab is shown to anyone who can read the service; scaling controls appear only for users allowed to deploy it. Compose deployments have their own Scaling tab, described in [Compose services](#compose-services).

## Replicas card

The four tiles summarise what Swarm reports right now:

| Tile | Meaning |
|---|---|
| Desired | Replicas Swarm is asked to run. If it differs from Dokploy's configured count, the configured count is shown underneath. |
| Ready | Running replicas. These are the ones receiving traffic from the application's domains. |
| Starting / pending | Replicas being started (including those waiting for their first passing health check) or waiting for a node. |
| Failed | Replicas that failed in the last 15 minutes. |

Notices below the tiles explain the states that need attention: not deployed yet, stopped, Swarm running a different count than configured, a rollout in progress, replicas Swarm cannot place (with Swarm's reason), and a missing health check.

**Add a health check.** Without one, a replica counts as ready as soon as its container runs, even if the application inside is still booting, unless the image defines its own HEALTHCHECK. Configure it in Advanced → Cluster Settings → Swarm Settings → Health Check.

## Changing the replica count

1. Use **−** / **+** or type a number (1–100).
2. Select **Apply** and confirm. Scaling down warns that requests still in flight on removed replicas are cut after the stop grace period. Any count above what is running now, including a new count for a stopped or not yet deployed application, shows capacity warnings first: if the replicas will not fit, the dialog says how many will, and confirming scales anyway (Swarm keeps the extra replicas pending until room frees up). Both outcomes appear in the history.

Scaling changes only the number of replicas: running replicas are not restarted, and no redeploy is needed. The new count is saved, so later deploys, stop/start and rollbacks keep it.

The control is disabled, with the reason shown, when:

- the application runs in global or job mode;
- a rollout is in progress (scaling would interfere with Swarm's automatic rollback); try again once it finishes.

When the application is stopped or not deployed yet, the count is saved and used on the next start or deploy; the application is not started.

Up to 10 changes per application per minute are accepted. While [autoscaling](#autoscaling) is on, the control is turned off and says why.

## Replicas table

Above the table, **Replicas per node** counts the current replicas on each node, so an uneven spread is visible at a glance.

One row per current replica: slot, state, whether it receives traffic, node, how long it has been in that state, and Swarm's message or error. Failures from the last 15 minutes are listed separately, which is usually the fastest way to see why replicas keep restarting. Each one says why it failed in words, above Swarm's own message. A failed health check, for example, reads "Its health check failed, so Swarm replaced it", followed by what the last checks returned (such as `Health check exceeded timeout (5s)`). It also says that the exit code 137 Swarm shows means the replica was killed at the end of its stop, not that it ran out of memory. An out-of-memory kill is named as one. The check outputs and the memory verdict come from the exited container, so they are missing when Docker has already removed it or it ran on another node.

## Replica metrics

CPU and memory used by each replica, read by the metrics agent on every node. Shown to users who can read monitoring data.

- **Enable replica metrics** appears when the server has no agent yet, or has one with per-replica collection off; only users who can manage servers can use it. See [metrics-agent.md](metrics-agent.md) for what it deploys and the network it needs.
- The tiles give the average CPU and memory per replica, as a share of the replica's reservation (or its limit when nothing is reserved), and how many ready replicas have a recent reading.
- The CPU and memory charts show one line per replica slot, coloured the same way every time; a replica that Swarm replaced continues its slot's line. A dashed line marks the reservation or limit once usage comes near enough to share the scale; while replicas use far less, it is left off so their lines stay readable. With more than five replicas, the charts show the average and the range between the lowest and highest replica instead. Pick the time range at the top right.
- The table lists each ready replica's latest reading. "Stale" means no reading in the last three collection rounds, usually a replica that just started or a node whose agent is unreachable; a warning above the tiles names unreachable nodes.

## Capacity

Shows how many replicas of this application fit. Users with Docker access also see the breakdown node by node:

- **Placement:** whether the node can run the application (ready, not paused or drained, and matching the placement constraints), with the reason when it cannot.
- **CPU / memory unreserved:** the node's total minus what other services have **reserved**. This is not current usage: a node can be idle and still fully reserved.
- **Room for:** how many replicas of this application fit there with its reservations. "No limit" means nothing restricts it, usually because no reservation is set.

Warnings under the summary explain anything that limits or invalidates the numbers, for example no reservations, an image that only exists on the build node, or volumes that are not shared between nodes.

## Resources

The same card as in Advanced: CPU and memory **reservations** (what Swarm sets aside for each replica, and what the capacity estimate uses) and **limits** (the most a replica may use). Set reservations if you want capacity checks to mean anything. A reservation cannot exceed its limit. Changes apply on the next deploy.

## Rollout strategy

How a deploy replaces running replicas:

- **Order:** *start new replicas first* keeps full capacity during the update but runs extra replicas; *stop old replicas first* needs no extra resources but runs with fewer replicas during the update. Swarm offers one or the other, not both at once.
- **Batch size:** replicas replaced at a time (the extra or missing replicas mentioned above). 0 replaces all at once.
- **Delay**, **monitor window**, **tolerated failures** and **when the update fails** (roll back, pause or continue). With *roll back*, a version whose replicas fail their health check during the monitor window is reverted automatically, using the same order and batch size.

If the application publishes a port in host mode, *start new replicas first* cannot work on a single node, since the old and new replica would need the same port; the card warns about this. Changes apply on the next deploy.

## Placement

Which nodes may run the replicas:

- **Any node**, **Manager nodes** or **Worker nodes**.
- **A node pool**: the nodes given that pool name with **Set pool** in the Multi-VM networking node table (see [multi-vm.md](multi-vm.md#placing-replicas-on-vms)). A pool exists as soon as one node has its name; give several nodes the same name to put them in one pool. Each node is in at most one pool.
- **One specific node.**
- **Several nodes**: tick the nodes in the list, or use a pool's button to tick all of its nodes. Dokploy labels exactly those nodes for this service, so services can share nodes in any combination. Nodes are shown by their Multi-VM networking name when they have one, with their hostname, role and pool. A node that joins later is not included until you tick it.

For a pool, one node or several nodes, the card shows **Replicas will run on** with the nodes that choice covers today. Choosing a pool lists only pools that exist, each with its nodes.

**Max replicas per node** is optional. Swarm already puts each new replica on the eligible node running the fewest of them; 1 makes sure one node failure takes down at most one replica.

Constraints and preferences set in Advanced → Cluster Settings → Swarm Settings are kept and listed; saving that form afterwards replaces the whole placement, including what was set here. Applications with mounts run on manager nodes by default; choosing another target here overrides that, but volumes stay local to each node. Changes apply on the next deploy, and Swarm does not move replicas that are already running.

## Autoscaling

Adds and removes replicas to keep CPU or memory per replica near a target. It needs replica metrics (the card above) and, for each metric you target, a reservation or limit to compare usage with.

1. Turn on **Autoscale this service**.
2. Set the **minimum** and **maximum** replicas. The form starts from the count running today.
3. Choose **Scale on CPU**, **Scale on memory** or both, each with a **target per replica**. For example, with a 50% CPU target and each replica reserving 0.5 CPU, replicas are added while they average more than 0.25 CPU each. With both, memory adds replicas above its target and keeps them near it, but below it CPU alone decides when to remove them: most of the memory a replica holds when idle stays with it whatever the load, so it would otherwise keep idle replicas running. For a service whose memory grows with load but whose CPU does not, scale on memory alone.
4. Optionally open **Timing and steps**:
   - **Evaluate every:** how often it decides (default 30 seconds).
   - **Tolerance:** usage this close to the target changes nothing (default 10%).
   - **Scale up after** and **Scale down after:** how long usage must stay above or below the target (defaults 60 seconds and 5 minutes).
   - **Wait after a change:** the cooldown (default 60 seconds).
   - **Add at most** and **Remove at most:** replicas per change (defaults 4 and 1).
5. Select **Save autoscaling**. A count outside the new minimum and maximum is corrected right away, and the card says so before you save. The card also warns when the maximum, at each replica's CPU limit, needs more CPUs than the nodes the service can run on have: Swarm places those replicas anyway, but they share the same CPUs rather than add capacity.

While it is on, the card shows its last decision: scaled up, scaled down or holding, why, when, the replica count and the CPU and memory it read. Holding is normal. It shows, for example, that usage is on target, a window is not over yet, or replicas are still starting. When one metric keeps replicas that the other would remove, the reason names it, for example "memory keeps 2 replicas; CPU alone would run 1 replica".

It never removes replicas while some lack a recent reading, does not add replicas while others wait for a node, and only scales as far as the nodes have room. Changes it makes appear in the history as **Autoscaler**, with the reason. A problem it cannot get past, such as an agent it cannot reach, is recorded there once.

If the card says **the autoscaler is not running**, check the `dokploy-autoscaler` service on the Dokploy host (`docker service ps dokploy-autoscaler`). Changing autoscaling needs permission to edit and to deploy the service.

## Scaling history

Every change is recorded: when, the result (scaled up, scaled down, saved without applying, failed, or settings changed for rollout and placement), the replica counts before and after, who made it, and any note. History is kept with the application and deleted with it.

## Compose services

Open a compose and select **Scaling** (keyboard: `g` then `r`). It shows every service of the last deployment, or of the compose file before the first deploy:

- **Services table:** each service's mode, ready / desired replicas and state. Select a service to see its details below the table.
- **Service details:** the same tiles, notices, replica count control and replicas table as for an application, for the selected service.
- **Replica metrics:** CPU and memory of each replica of the selected service, as for an application. Stack replicas are read on every node; Docker Compose replicas on the compose's server. If that server's agent is older than this Dokploy release, the card offers **Update the metrics agent**.
- **Capacity:** for Stack services only. Docker reserves nothing for plain Compose containers, so there is nothing to estimate. It warns when an image was not pulled from a registry, since other nodes could not get it.
- **Autoscaling:** the same card as for an application, per service. Docker Compose services scale on their one server.
- **Placement:** for Stack services, the same card as for an application, saved per service. It is written into the service's `deploy.placement` on every deploy; constraints and preferences in the compose file are kept, and those are edited in the file.
- **Scaling history:** changes to every service of the compose, with a Service column.

How a new count is applied depends on the compose type:

- **Stack:** Swarm adds or removes replicas of that service, as for an application, across the nodes of the swarm.
- **Docker Compose:** Docker Compose starts more containers of that service, or stops and removes the highest-numbered ones, **on this server only**. The tab says so; to spread replicas across machines, deploy the compose as a Stack.

Either way, running replicas are not restarted, and the count is saved: every later deploy writes it into the compose file, and for Docker Compose, Stop and Start keep it.

The control is disabled, with the reason shown, when:

- the compose deploys with a custom command (set replicas in the compose file instead);
- a deployment is in progress;
- the service runs in global or job mode, or a rollout is in progress (Stack);
- the service can run only one container (Docker Compose): it sets `container_name`, publishes a fixed host port, uses host networking or a static IP. The tab names the reason, and the count stays at 1.

When the compose is stopped or its last deployment failed, a new count is saved and used on the next start or deploy. If a container of the service is stopped, for example during a volume backup, scaling is refused until it runs again, because Docker Compose would otherwise start it.

Up to 10 changes per service per minute are accepted.

### Switch to Stack

A Docker Compose deployment that does not use a custom command shows **Run on several machines**. It checks the compose file against what Swarm supports:

- **Must fix:** a service that builds its image (`build:` without `image:`) or uses `network_mode`. Fix the file, deploy, and switch then.
- **Changes:** what runs differently as a Stack, for example `container_name`, `restart` and `depends_on` being ignored, host ports published on every node, relative bind mounts and named volumes being per node.

**Switch to Stack** asks for confirmation with these changes listed. Dokploy then stops and removes the running containers, keeping the volumes (the stack reuses them), changes the type to Stack and deploys it. The services are down until that deploy finishes. Domains, environment and saved replica counts carry over.
