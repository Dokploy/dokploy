# Replica scaling: multi-VM networking

Multi-VM networking joins VMs from any provider to one swarm over an encrypted WireGuard tunnel. Once a VM is active, Swarm can place replicas there and spread traffic over all of the swarm's VMs. Dokploy sets up and maintains the tunnel over SSH; you never edit WireGuard or Swarm on the VMs yourself.

Each Dokploy server is its own swarm: the Dokploy host's swarm, or a remote server's swarm. Multi-VM networking is set up per swarm, under **Docker → Swarm → Nodes → Multi-VM networking**, with that server selected.

## Requirements

**Every VM, including the manager:**
- Ubuntu or Debian with systemd. Other systems need WireGuard set up by hand.
- SSH access with a key stored in Dokploy (Settings → SSH Keys), as root or as a user with passwordless sudo.
- The VM must not already belong to another swarm.

**Network:**
- The tunnel's UDP port open to each VM from the others, in the cloud provider's firewall or security group. It is **51820** unless you choose another **Tunnel port** at setup; below, 51820 stands for whichever port you chose.
- **Behind NAT** (a Proxmox container with a private address, for example), enter the NAT's public address as the WireGuard address. The tunnel starts from whichever side can reach the other, and keepalives every 25 seconds keep the NAT's mapping open. So a manager behind NAT needs no forwarded port, as long as each VM accepts the tunnel's port from the manager's public address. If neither side can be reached, forward the port to one of them.
- **A host that blocks outgoing UDP to the tunnel's port** stops the tunnel before it leaves, and the check reports "No answer … within 20 seconds". Some providers reject whole ranges, such as 49152–65535, which includes 51820. Choose a **Tunnel port** the host lets out when you set up multi-VM networking, and open that port on the VMs instead. The port can't be changed after setup; to change it, remove the VMs, turn multi-VM networking off and set it up again.
- Nothing else needs to be public. Swarm's ports (2377, 7946, 4789) and the metrics agent's port (4500) only carry traffic inside the tunnel, so keep them closed to the internet.

**Tunnel subnet:**
- The default is `100.96.0.0/24`.
- Choose another subnet if a VM already routes that range, or runs Tailscale (which drops 100.64.0.0/10 traffic outside its own interface).
- It must not overlap the swarm's overlay address pool (`10.0.0.0/8` by default).

**Images:** replicas on another VM pull their image, so an image that is built on the manager must be pushed to a registry. The activation check lists the services this affects. The metrics agent runs on every VM; when its image is private, save its registry under **Settings → Registry**, and Dokploy logs each new VM in to it and pulls the agent while adding the VM.

## Using it

1. **Set up.** Enter how Dokploy reaches the manager over SSH, the manager's public address for WireGuard and, if a firewall blocks UDP 51820, another tunnel port.
   - For the Dokploy host, the SSH address defaults to the Docker gateway. A host's public IP often doesn't loop back to itself from inside a container.
   - For a remote server, the server's own SSH settings are filled in.
2. **Add VM.** Enter the VM's name, SSH access and public address.
   - Setup takes a few minutes and runs in the background; **View setup log** shows each step.
   - The VM joins the swarm **paused**: it is in the swarm but runs no replicas.
3. **Activate.** Dokploy first runs the activation check, which lists services that would fail if Swarm placed them on the new VM:
   - Applications built on the manager without a registry;
   - Applications with named volumes that aren't pinned to a node;
   - Stack services with `build:`, or with named volumes and no placement constraint.

   Fix them (set a registry, or pin them in Scaling → Placement or in the compose file), or activate anyway.
4. **Later actions:**

   | Action | Effect |
   |---|---|
   | **Pause** | Keeps the VM's replicas but gives it no new ones. |
   | **Drain** | Moves its replicas to other nodes. |
   | **Remove** | Drains the VM, makes it leave the swarm, removes it from every node's tunnel and uninstalls its WireGuard configuration. Docker stays installed. |
   | **Force remove (VM unreachable)** | For a VM that is gone. Removes it from the swarm and from the other nodes' tunnels without connecting to it. |
   | **Turn off** | Available once no VMs are left. Removes WireGuard from the manager. |

The table shows each VM's tunnel address, swarm state, availability and pool, and the time since its last WireGuard handshake as seen by the manager. WireGuard renews handshakes about every 2 minutes, so one older than about 3 minutes means the VM is not reachable through the tunnel.

VMs on a private network that all nodes share (a VPC or a VPN you run) don't need the tunnel. Join them with the commands under **Add Node** instead, and enter the node's private address there, so Swarm traffic stays on that network.

## Placing replicas on VMs

By default Swarm may run a replica on any active node, and puts each new replica on the eligible node running the fewest replicas of that service. To choose the VMs:

1. **Group VMs into pools.** In the node table, **Set pool** on each VM, for example `web` for front-end VMs and `db` for the VM with the database disk. A pool is the Swarm node label `dokploy.pool`. For nodes joined without multi-VM networking, run `docker node update --label-add dokploy.pool=<name> <node>` on the manager.
2. **Place a service in a pool.** In the Scaling tab's **Placement** card, choose **Run on → A node pool**. This works for applications and for each service of a Stack. **Max replicas per node** set to 1 keeps one VM failure from taking down more than one replica.

   A VM is in at most one pool. To run services on overlapping sets of VMs, for example one service on VMs 1 and 2 and another on VMs 2 and 3, choose **Run on → Several nodes** and tick the VMs for each service instead.
3. **Redeploy.** Placement applies on the next deploy. Swarm does not move replicas that are already running.

The Scaling tab shows how many replicas run on each node. The Capacity card warns when replicas could land on a VM that cannot pull the image.

## Load balancing across VMs

Traefik on the manager receives every request and sends it to the service's Swarm virtual IP. The virtual IP picks a replica on any VM, and the request crosses the tunnel when that replica is on another VM.

Dokploy configures Traefik to open a new connection for each request, so requests spread evenly over all replicas. With reused connections, every request would go to the same replica. A replica that is being removed stops getting new requests before it stops. The cost is a connection setup per request: one extra round trip through the tunnel when the replica is on another VM.

A manager that cannot run Swarm VIPs, such as an unprivileged LXC container, needs `DOKPLOY_SWARM_ENDPOINT_MODE=dnsrr` on the `dokploy` service. Traefik then reaches the replicas' own addresses by DNS round robin, across the tunnel the same way; see [Hosts without Swarm VIPs](architecture.md#hosts-without-swarm-vips).

## What Dokploy changes on the VMs

| | Manager | Every other VM |
|---|---|---|
| Packages | `wireguard-tools`, `iputils-ping` | The same, plus Docker if it is missing: 28.5.0, or 29.4.2 on Ubuntu 26.04, whose Docker repository starts at 29.x |
| Files | `/etc/wireguard/wg-dokploy.key` (private key, created on the VM and never sent to Dokploy) and `wg-dokploy.conf` | The same, plus `/etc/systemd/system/docker.service.d/10-dokploy-wireguard.conf` |
| Service | `wg-quick@wg-dokploy`, enabled at boot | The same, and Docker starts after it |
| Swarm | **Unchanged**: same address, same services, nothing restarted | Joins as a worker with `--advertise-addr`, `--data-path-addr` and `--listen-addr` on its tunnel address, paused |
| Firewall | If ufw is active: allows `51820/udp` and traffic on `wg-dokploy`. Never enables ufw or adds deny rules. | The same |

## How it works

**The manager keeps its swarm address.** Swarm cannot move a running manager to another address: `docker swarm init --force-new-cluster --advertise-addr` restarts every container, and the raft record keeps the old address, which workers then try to reach. So the tunnel goes to the manager's existing address:
- Each worker routes the manager's swarm address through the tunnel. It uses policy routing on WireGuard's firewall mark, so WireGuard's own encrypted packets to that same IP still use the normal network.
- The manager sends tunnel traffic *from* its swarm address, so Swarm's gossip and overlay traffic arrive from the address the workers know it by. Without this, overlay traffic is silently dropped.
- With every direct path between the VMs blocked except UDP 51820, the swarm, the overlay network and load balancing all work.

**Workers listen on their tunnel address**, which only exists once the tunnel is up. Swarm does not retry when it starts too early, so the systemd drop-in makes Docker wait for WireGuard at boot.

**Peers are kept in step from Dokploy's database.** On every change (a VM added, failed or removed), Dokploy renders each member's whole configuration and applies it with `wg syncconf`. That updates peers without dropping existing connections. Each node's private key is written into its file on the node itself.

**Tunnel MTU** is the smallest underlay MTU among the VMs minus 80, and at most 1420. When a VM is added, Dokploy checks a full-size, unfragmented packet both ways between it and the manager, so a path with a smaller MTU is caught before the VM joins. The check starts on the manager, which can start the handshake even from behind NAT, and waits up to 20 seconds for the tunnel to answer, since WireGuard resends a lost handshake only every 5 seconds. Overlay networks keep Docker's default MTU; their packets are fragmented inside the tunnel, which works but costs some throughput. Creating overlay networks with `com.docker.network.driver.mtu` set to the tunnel MTU − 50 avoids that.

**If adding a VM fails,** Dokploy undoes what it did: it leaves the swarm, removes the node, removes its peer from the other VMs and uninstalls WireGuard from it. The VM stays listed as failed, with the log; **Retry setup** runs the steps again.

## Limits

- **Workers only.** The swarm keeps its single manager, so if the manager's VM is down no new tasks are scheduled. Dokploy's own services, and apps that are placed by `node.role==manager`, would need moving to fixed nodes before extra managers were safe.
- **One entry point.** Traefik runs on the manager, so sites are down while the manager's VM is down, even though replicas run elsewhere.
- **Named volumes exist on one node.** Pin stateful services.
- **Docker commands reach the manager only.** A Stack's Logs tab still shows a replica on another VM: in Native mode it reads it through its task (`docker service logs`), as the Swarm mode does, since `docker logs` on the manager answers "No such container". On the compose's Containers tab such a replica offers only its logs; its config, terminal and restart need that VM's Docker. An application's Logs tab lists the manager's containers in Native mode; switch it to Swarm to see replicas on other VMs.
- **Plain Docker Compose cannot use other VMs.** Use **Switch to Stack** on the compose's Scaling tab. It lists what Swarm handles differently first.

## Troubleshooting

| Log or status | Cause |
|---|---|
| "SSH … was refused: the key is not authorized" | The key's public half is not in that user's `~/.ssh/authorized_keys`. |
| "The SSH user needs root or passwordless sudo" | Add `<user> ALL=(ALL) NOPASSWD:ALL` to `/etc/sudoers.d/<user>`, or use root. |
| "… is not this swarm's manager" | The SSH address reaches a different machine than the one running the swarm's manager. |
| "already belongs to another swarm" | Run `docker swarm leave --force` on the VM first. |
| "… not found amongst apt-cache madison results" | Docker does not publish the version Dokploy installs for that release. Install Docker on the VM yourself, then **Retry setup**: Dokploy keeps a Docker that is already installed. |
| "No answer from … through the tunnel within 20 seconds" | UDP 51820 does not get through between the VMs: check the provider's firewall or security group of each VM, and the forward to a VM behind NAT. |
| "… answers through the tunnel, but not to unfragmented …-byte packets" | The path between the VMs drops large packets. |
| A VM shows `down` after a reboot | Docker started before the tunnel. Check `systemctl status wg-quick@wg-dokploy`, then `systemctl restart docker`. |
| Last handshake "Never" or old | The VM is off, or UDP 51820 to it is blocked. |
| "overlaps the swarm's overlay address pool" or "… Tailscale" | Choose another tunnel subnet. |

## Checklist for real VMs

1. Open UDP 51820 to every VM from the others, and keep 2377, 7946, 4789 and 4500 closed to the internet.
2. Put the Dokploy SSH key on every VM.
3. Set up multi-VM networking, then add each VM and wait for **Paused**.
4. Activate them, after fixing what the activation check lists.
5. Deploy an Application with a domain and 3+ replicas, with Scaling → Placement set to at most 1 replica per node. Check the replicas table shows several nodes, and that repeated requests to the domain are answered by every replica.
6. Put two VMs in a pool, place a service there, redeploy, and check its replicas run only on those VMs.
7. Reboot one VM and check it returns to **ready**, with its handshake under 3 minutes old.
8. Remove a VM and check its replicas moved.

Lab verification (3 Ubuntu 24.04 VMs with systemd, through the Dokploy UI):
- all of the above except pools and the remote-server case;
- traffic spread 10/10/10/10/10/10 over 6 replicas on 3 VMs, with direct traffic between the VMs blocked except UDP 51820.

Also run for real: a manager in an unprivileged Proxmox LXC container behind NAT, with no forwarded port and a host that blocks outgoing UDP above 49151, joined an Ubuntu 26.04 EC2 worker. With the tunnel on port 41820 and the worker's security group allowing it from the manager's public address, the tunnel came up from the manager's side and the worker joined.

Placement and load balancing were verified on a three-node swarm (`multinode-lb.real.test.ts`):
- requests through Traefik reached every replica on every node, for an application and for a Stack service;
- a Stack service placed in a pool ran only on that pool's nodes;
- no request failed while either was scaled down under load.
