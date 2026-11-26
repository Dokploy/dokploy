# Replica scaling: the metrics agent

Per-replica CPU and memory come from Dokploy's monitoring agent (`apps/monitoring`), running on every node of a server's swarm. It reads the replicas of applications and Stack services (swarm tasks) and of plain Docker Compose services (the containers Compose starts for a service). This page covers publishing the agent image, enabling it, and keeping it working. For how the data is collected and used, see [architecture.md](architecture.md#replica-metrics).

## Image

The agent is published to `dokploy/monitoring`:

- `.github/workflows/monitoring.yml` builds `Dockerfile.monitoring` for amd64 and arm64 on every push to `main` (tag `latest`) and `canary` (tag `canary`).
- Dokploy deploys `latest`, or `canary` when it runs a non-latest image tag. Set `DOKPLOY_MONITORING_IMAGE` on the Dokploy service to pin another image, for example a specific tag or a mirror in your own registry.
- To build locally: `docker build -f Dockerfile.monitoring -t dokploy-monitoring:dev .` from the repository root.

## Enabling replica metrics

On the **Scaling** tab of an application, or of a compose with a service selected, the *Replica metrics* card offers **Enable replica metrics** to users with permission to manage servers. This:

1. Turns on per-replica collection in the server's monitoring settings, filling in a token, callback URL and cleanup schedule if they are empty and keeping every value already set.
2. Deploys `dokploy-monitoring` as a global service: one agent on every node of that server's swarm, with its data in the `dokploy-monitoring-data` volume.

Readings appear after two collection rounds (about 30 seconds with the default 15-second interval). Autoscaling reads the same metrics, so it needs the agent on every server that runs autoscaled services.

The **Dokploy host** and each **remote server** are separate swarms with separate agents; enable it once per server that runs scaled applications or compose services. Dokploy Cloud manages its own agents, so the action is not offered there.

## Network requirements

- Each agent listens on the configured port (4500 by default) on its node: through host networking on remote servers, and a host-mode published port on the Dokploy host.
- Dokploy must reach the **manager's** agent: on remote servers at the server's IP address, on the Dokploy host at its swarm node address. Set `DOKPLOY_MONITORING_URL` on the Dokploy service if neither is reachable from Dokploy's container (for example `http://10.0.0.5:4500`).
- The manager's agent must reach **every other node's** agent at that node's swarm address. Over a private network such as WireGuard, that is the address the node joined the swarm with.
- Allow the port only between swarm nodes and from Dokploy. Requests carry the agent's token, but over plain HTTP.
- No application may publish the agent's port through Swarm's ingress, because the ingress binds it on every node.

## Upgrading from an earlier agent

**Plain Docker Compose metrics need this release's agent.** Earlier agents read swarm tasks only. When the agent on a server is older, the card on a Docker Compose service says so and offers **Update the metrics agent**, which redeploys `dokploy-monitoring` with the agent image Dokploy is configured for (see [Image](#image)), the same as **Enable replica metrics**. You can also update it by hand by pulling the new image and updating the `dokploy-monitoring` service. Applications and Stack services work with either agent.

Earlier versions ran the agent as a single replica on a manager, storing its data in `/etc/dokploy/monitoring/monitoring.db`. Swarm cannot change a service from replicated to global, so the first deployment of the new agent (by enabling replica metrics, or by saving a server's monitoring settings where that form is available) removes that service and creates the global one. Server and container history from the old agent is not carried over; the old file stays on disk and can be deleted.

## Troubleshooting

| What the card shows | Likely cause |
|---|---|
| "not set up on this server" | The server has no agent token yet. Use **Enable replica metrics**. |
| "per-replica collection is turned off" | The agent runs but `tasks.enabled` is off. Use **Enable replica metrics** to turn it on. |
| "Cannot reach the metrics agent at …" | The agent is not running on the manager, its port is blocked, or Dokploy uses the wrong address. Check `docker service ps dokploy-monitoring` on the server and the address in the message; set `DOKPLOY_MONITORING_URL` if needed. |
| "returned 401" | The token stored in Dokploy differs from the agent's. Use **Enable replica metrics** again: it redeploys the agent with the stored token. |
| "returned 409" | Dokploy reached an agent on a worker. Point it at a manager. |
| "returned an unexpected response" | The agent image predates replica metrics. Check that nodes run the current agent image. |
| "older than this version of Dokploy" (Docker Compose service) | The agent predates Compose sampling. Use **Update the metrics agent**. |
| No readings for a Docker Compose service | The service was started outside Dokploy's project name, or it runs on another server than the compose's. Dokploy reads `compose:<appName>/<service>` from the agent on the compose's server. |
| "No answer from the agent on …" (partial data) | That node's agent is down or its port is blocked from the manager. |
| Replicas marked "Stale" | Those replicas' node has not reported recently, or the replica started less than two collection rounds ago. |

To inspect the agent directly: `curl -H "Authorization: Bearer <token>" "http://<manager>:4500/metrics/tasks/cluster?service=<appName>"`. For a plain Compose service, ask the agent on the compose's server: `curl -i -H "Authorization: Bearer <token>" "http://<server>:4500/metrics/tasks?service=compose:<appName>/<service>"`; `-i` shows the `X-Dokploy-Agent-Features` header.

## Testing against a real swarm

`apps/dokploy/__test__/scaling/metrics.real.test.ts` needs an agent image built from this branch on every node and the manager's agent port reachable from the test runner:

```bash
docker build -f Dockerfile.monitoring -t dokploy-monitoring:dev .
# load the image on every swarm node, then:
DOKPLOY_MONITORING_TEST_IMAGE=dokploy-monitoring:dev \
DOKPLOY_MONITORING_URL=http://<manager>:4500 \
pnpm --filter=dokploy exec vitest run --config __test__/vitest.config.ts __test__/scaling/metrics.real.test.ts
```

Point Dokploy's Docker client at the manager with `DOKPLOY_DOCKER_HOST` / `DOKPLOY_DOCKER_PORT` when it is not the local daemon.

`compose-metrics.real.test.ts` needs only the image on the local Docker; it runs the agent as a container next to a Docker Compose project:

```bash
DOKPLOY_MONITORING_TEST_IMAGE=dokploy-monitoring:dev \
pnpm --filter=dokploy exec vitest run --config __test__/vitest.config.ts __test__/scaling/compose-metrics.real.test.ts
```
