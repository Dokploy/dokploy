# Replica scaling: supported modes

| Service | How it runs | Replica count | Live scaling (Scaling tab) |
|---|---|---|---|
| Application, replicated mode (default) | Swarm service | Scaling tab, or Advanced → Cluster Settings | Yes |
| Application, global mode | Swarm service, one task per eligible node | Not applicable | No: the tab explains why |
| Application, replicated or global job | Swarm job | Not applicable | No |
| Preview deployment | Swarm service | Inherits the parent application's configured count | No |
| Databases (Postgres, MySQL, MariaDB, MongoDB, Redis, libSQL) | Swarm service | Advanced → Cluster Settings (applied on redeploy) | No. Most of these are stateful and a second replica is not a replica set. |
| Compose, Docker Compose type | Plain containers via `docker compose up`, all on one server | Per service, on the compose's Scaling tab (written into the file as `deploy.replicas` on each deploy); otherwise `scale` / `deploy.replicas` in the file | Yes, per service, on that server only. Not for services with `container_name`, a fixed host port, host networking or a static IP (they can run one container), nor for composes deployed with a custom command. |
| Compose, Stack type | Swarm services via `docker stack deploy` | Per service, on the compose's Scaling tab (written into the file on each deploy); otherwise `deploy.replicas` in the file, which Swarm resets to 1 on each deploy when it is missing | Yes, per replicated service. Not for global or job services, nor for composes deployed with a custom command. |

A plain Docker Compose deployment can only run containers on the server that runs `docker compose`. To spread a compose's replicas across several machines, deploy it as a Stack; **Switch to Stack** on the compose's Scaling tab checks the file and converts it.

| Service | Placement from the Scaling tab | Domains balanced per request | Autoscaling |
|---|---|---|---|
| Application | Any node, managers, workers, a node pool, one node or several chosen nodes, and max replicas per node | Yes, through the Swarm VIP, or DNS round robin on hosts without VIPs | Yes, replicated mode |
| Compose, Stack type | The same, per service, written into `deploy.placement` | Yes, through the Swarm VIP, or by service name for `endpoint_mode: dnsrr` | Yes, per replicated service |
| Compose, Docker Compose type | No: one server | Yes, one Traefik server per container | Yes, per service, on its one server; not for services that can run one container |
| Preview deployments, databases | — | — | No |

Autoscaling needs replica metrics on the server and, for each metric it targets, a reservation or limit; it is not available for composes deployed with a custom command, or on Dokploy Cloud.

Some hosts, such as an unprivileged LXC container, cannot run Swarm VIPs. There, set `DOKPLOY_SWARM_ENDPOINT_MODE=dnsrr` on the `dokploy` service; see [Hosts without Swarm VIPs](architecture.md#hosts-without-swarm-vips).

## Things that limit where replicas can run

- **Multiple nodes need a registry.** An image built on the Dokploy host exists only there; replicas scheduled on other nodes of the same swarm cannot pull it unless the application pushes to a registry (Advanced → Cluster Settings). A Stack's images must likewise come from a registry, since `docker stack deploy` ignores `build:`; the Capacity card warns about a Stack image that was not pulled from one.
- **Applications with volume mounts are pinned to manager nodes** by default, and named volumes are per node: replicas on different nodes do not share data.
- **Host-mode published ports** can be bound by only one replica per node; extra replicas on the same node stay pending.
- **Each Dokploy server is a separate swarm.** Replicas spread only across the nodes of the swarm the application is deployed to (VMs added through multi-VM networking or Cluster join tokens), never across separate Dokploy servers.

The Capacity card on the Scaling tab flags each of these for the application's current settings. Swarm reports a replica it cannot place as **Pending**, with its reason (for example "no suitable node (insufficient resources on 2 nodes)"), and the Scaling tab shows that reason.
