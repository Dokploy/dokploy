import { db } from "@dokploy/server/db";
import {
	type ClusterMesh,
	type ClusterNode,
	clusterMesh,
	clusterNode,
	registry,
} from "@dokploy/server/db/schema";
import { eq, sql } from "drizzle-orm";
import { withScaleLock } from "../scaling/scale-lock";
import { POOL_LABEL } from "../scaling/scaling-settings";
import { getScalingDocker } from "../scaling/status";
import { findServerById } from "../server";
import {
	applyConfigScript,
	dockerBootOrderScript,
	firewallScript,
	handshakesScript,
	inspectHostScript,
	installDockerScript,
	installWireguardScript,
	joinSwarmScript,
	leaveSwarmScript,
	parseFacts,
	pathCheckScript,
	pullImageScript,
	registryLoginScript,
	teardownScript,
} from "./scripts";
import { execOverSsh, type SshTarget } from "./ssh";
import {
	allocateAddress,
	computeWgMtu,
	type MeshLayout,
	managerAddress,
	normalizeSubnet,
	renderMemberConfig,
	subnetsOverlap,
} from "./wireguard";

export class ClusterMeshError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ClusterMeshError";
	}
}

const SUPPORTED_OS = new Set(["ubuntu", "debian"]);
const NODE_LABEL = "dokploy.cluster-node";
const LOG_LIMIT = 65_536;

export const swarmKeyOf = (serverId: string | null | undefined) =>
	serverId ?? "local";

const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

type NodeWithKey = ClusterNode & { sshKey: { privateKey: string } | null };
type MeshWithNodes = ClusterMesh & { nodes: NodeWithKey[] };

export const findMesh = async (meshId: string): Promise<MeshWithNodes> => {
	const mesh = await db.query.clusterMesh.findFirst({
		where: eq(clusterMesh.meshId, meshId),
		with: { nodes: { with: { sshKey: { columns: { privateKey: true } } } } },
	});
	if (!mesh) throw new ClusterMeshError("Multi-VM networking is not set up.");
	return mesh;
};

export const findMeshBySwarm = (serverId: string | null | undefined) =>
	db.query.clusterMesh.findFirst({
		where: eq(clusterMesh.swarmKey, swarmKeyOf(serverId)),
		with: { nodes: true },
	});

const managerOf = (mesh: MeshWithNodes) => {
	const manager = mesh.nodes.find((node) => node.role === "manager");
	if (!manager) throw new ClusterMeshError("The mesh has no manager.");
	return manager;
};

const sshTargetOf = (node: NodeWithKey): SshTarget => {
	if (!node.sshKey?.privateKey) {
		throw new ClusterMeshError(
			`No SSH key is set for ${node.name}; it was deleted or never chosen.`,
		);
	}
	return {
		host: node.sshAddress,
		port: node.sshPort,
		username: node.sshUser,
		privateKey: node.sshKey.privateKey,
	};
};

const swarmDocker = async (mesh: Pick<ClusterMesh, "serverId">) => {
	const server = mesh.serverId ? await findServerById(mesh.serverId) : null;
	return getScalingDocker({ serverId: mesh.serverId, server });
};

const appendLog = async (clusterNodeId: string, line: string) => {
	const stamped = `[${new Date().toISOString()}] ${line.trimEnd()}\n`;
	await db
		.update(clusterNode)
		.set({
			log: sql`right(${clusterNode.log} || ${stamped}, ${LOG_LIMIT})`,
			updatedAt: new Date(),
		})
		.where(eq(clusterNode.clusterNodeId, clusterNodeId));
};

const updateNode = (
	clusterNodeId: string,
	values: Partial<typeof clusterNode.$inferInsert>,
) =>
	db
		.update(clusterNode)
		.set({ ...values, updatedAt: new Date() })
		.where(eq(clusterNode.clusterNodeId, clusterNodeId));

const updateMesh = (
	meshId: string,
	values: Partial<typeof clusterMesh.$inferInsert>,
) =>
	db
		.update(clusterMesh)
		.set({ ...values, updatedAt: new Date() })
		.where(eq(clusterMesh.meshId, meshId));

const runOn = async (
	node: NodeWithKey,
	body: string,
	options: { input?: string; quiet?: boolean } = {},
) => {
	const result = await execOverSsh(sshTargetOf(node), body, {
		input: options.input,
	});
	if (!options.quiet && result.stdout.trim()) {
		await appendLog(node.clusterNodeId, result.stdout);
	}
	return result.stdout;
};

/** Members that carry traffic: nodes being removed or that failed are left
 * out, so rendering the mesh without them also removes their peers. */
const layoutOf = (mesh: ClusterMesh, nodes: ClusterNode[]): MeshLayout => {
	if (!mesh.managerAdvertiseAddress) {
		throw new ClusterMeshError("The manager's swarm address is unknown.");
	}
	return {
		subnet: mesh.subnet,
		listenPort: mesh.listenPort,
		mtu: mesh.wgMtu,
		managerAdvertiseAddress: mesh.managerAdvertiseAddress,
		members: nodes
			.filter(
				(node) =>
					node.wgPublicKey &&
					node.status !== "error" &&
					node.status !== "removing",
			)
			.map((node) => ({
				role: node.role,
				wgAddress: node.wgAddress,
				wgPublicKey: node.wgPublicKey,
				endpointAddress: node.endpointAddress,
			})),
	};
};

/** Re-renders every member's config from the database and applies it. */
const applyMeshConfigs = async (meshId: string, logTo: string) => {
	const mesh = await findMesh(meshId);
	const layout = layoutOf(mesh, mesh.nodes);
	for (const node of mesh.nodes) {
		if (
			!node.wgPublicKey ||
			node.status === "error" ||
			node.status === "removing"
		) {
			continue;
		}
		await appendLog(logTo, `Updating WireGuard peers on ${node.name}`);
		await runOn(
			node,
			applyConfigScript(renderMemberConfig(node, layout), layout.mtu),
			{ quiet: true },
		);
	}
};

const inspectHost = async (node: NodeWithKey, subnet: string) => {
	await appendLog(node.clusterNodeId, `Connecting to ${node.sshAddress}`);
	const facts = parseFacts(
		await runOn(node, inspectHostScript(), { quiet: true }),
	);
	if (!SUPPORTED_OS.has(facts.os ?? "")) {
		throw new ClusterMeshError(
			`${node.name} runs ${facts.os || "an unknown OS"} ${facts.osVersion ?? ""}; automatic setup supports Ubuntu and Debian. Set up WireGuard manually or use one of those.`,
		);
	}
	if (facts.systemd !== "yes") {
		throw new ClusterMeshError(`${node.name} has no systemd.`);
	}
	if (facts.tailscale === "yes" && subnetsOverlap(subnet, "100.64.0.0/10")) {
		throw new ClusterMeshError(
			`${node.name} runs Tailscale, which drops traffic for ${subnet} outside its own interface. Choose a subnet outside 100.64.0.0/10.`,
		);
	}
	const clash = (facts.routes ?? "")
		.split(" ")
		.filter(Boolean)
		.find((route) => {
			try {
				return subnetsOverlap(subnet, route);
			} catch {
				return false;
			}
		});
	if (clash && !clash.startsWith(subnet)) {
		throw new ClusterMeshError(
			`${subnet} overlaps the network ${clash} already routed on ${node.name}. Choose another subnet.`,
		);
	}
	await appendLog(
		node.clusterNodeId,
		`${facts.os} ${facts.osVersion}, Docker ${facts.docker || "not installed"}, swarm ${facts.swarm || "n/a"}`,
	);
	return facts;
};

const installWireguard = async (node: NodeWithKey) => {
	await appendLog(node.clusterNodeId, "Installing WireGuard");
	const facts = parseFacts(
		await runOn(node, installWireguardScript(), { quiet: true }),
	);
	if (!facts.publicKey)
		throw new ClusterMeshError("No WireGuard key was created.");
	await updateNode(node.clusterNodeId, { wgPublicKey: facts.publicKey });
	return facts.publicKey;
};

const runInBackground = (
	label: string,
	clusterNodeId: string,
	work: () => Promise<void>,
) => {
	void work().catch(async (error) => {
		console.error(`${label} failed`, error);
		await appendLog(clusterNodeId, `Failed: ${errorMessage(error)}`).catch(
			() => undefined,
		);
	});
};

const meshLock = (meshId: string) => `mesh:${meshId}`;

export const enableClusterMesh = async ({
	organizationId,
	serverId,
	subnet: requestedSubnet,
	listenPort = 51820,
	manager,
}: {
	organizationId: string;
	serverId: string | null;
	subnet: string;
	listenPort?: number;
	manager: {
		sshAddress: string;
		sshPort: number;
		sshUser: string;
		sshKeyId: string;
		endpointAddress: string;
	};
}) => {
	const docker = await swarmDocker({ serverId });
	const info = await docker.info();
	if (
		info.Swarm?.LocalNodeState !== "active" ||
		!info.Swarm?.ControlAvailable
	) {
		throw new ClusterMeshError(
			"This server is not a swarm manager, so VMs cannot join it.",
		);
	}
	const subnet = normalizeSubnet(requestedSubnet);
	const advertise: string = info.Swarm.NodeAddr;
	if (subnetsOverlap(subnet, `${advertise}/32`)) {
		throw new ClusterMeshError(
			`The manager's address ${advertise} is inside ${subnet}. Choose another subnet.`,
		);
	}
	// Overlay networks take their subnets from this pool; a tunnel subnet
	// inside it could collide with an overlay network later.
	const pools: string[] = info.Swarm.Cluster?.DefaultAddrPool ?? ["10.0.0.0/8"];
	const pool = pools.find((candidate) => subnetsOverlap(subnet, candidate));
	if (pool) {
		throw new ClusterMeshError(
			`${subnet} overlaps the swarm's overlay address pool ${pool}. Choose another subnet, such as 100.96.0.0/24.`,
		);
	}

	const existing = await findMeshBySwarm(serverId);
	if (existing && existing.status !== "error") {
		throw new ClusterMeshError("Multi-VM networking is already set up here.");
	}
	if (existing) {
		await db.delete(clusterMesh).where(eq(clusterMesh.meshId, existing.meshId));
	}

	const [mesh] = await db
		.insert(clusterMesh)
		.values({
			swarmKey: swarmKeyOf(serverId),
			organizationId,
			serverId,
			subnet,
			listenPort,
			managerAdvertiseAddress: advertise,
		})
		.returning();
	if (!mesh) throw new ClusterMeshError("Could not save the mesh.");
	const [managerNode] = await db
		.insert(clusterNode)
		.values({
			meshId: mesh.meshId,
			name: info.Name ?? "manager",
			role: "manager",
			...manager,
			wgAddress: managerAddress(subnet),
			swarmNodeId: info.Swarm.NodeID,
		})
		.returning();
	if (!managerNode) throw new ClusterMeshError("Could not save the manager.");

	runInBackground(
		"Enabling multi-VM networking",
		managerNode.clusterNodeId,
		() =>
			withScaleLock(meshLock(mesh.meshId), async () => {
				try {
					await provisionManager(mesh.meshId);
				} catch (error) {
					await updateNode(managerNode.clusterNodeId, {
						status: "error",
						lastError: errorMessage(error),
					});
					await updateMesh(mesh.meshId, {
						status: "error",
						lastError: errorMessage(error),
					});
					throw error;
				}
			}),
	);
	return mesh;
};

const provisionManager = async (meshId: string) => {
	const mesh = await findMesh(meshId);
	const node = managerOf(mesh);
	const facts = await inspectHost(node, mesh.subnet);
	if (
		facts.swarm !== "active" ||
		facts.swarmNodeAddr !== mesh.managerAdvertiseAddress
	) {
		throw new ClusterMeshError(
			`${node.sshAddress} is not this swarm's manager (its swarm address is ${facts.swarmNodeAddr || "none"}, expected ${mesh.managerAdvertiseAddress}). Use the SSH address of the machine running the manager.`,
		);
	}
	await installWireguard(node);
	await updateMesh(meshId, {
		wgMtu: computeWgMtu([Number(facts.underlayMtu)]),
	});
	await appendLog(node.clusterNodeId, "Writing the WireGuard configuration");
	await applyMeshConfigs(meshId, node.clusterNodeId);
	await runOn(node, firewallScript(mesh.listenPort));
	await updateNode(node.clusterNodeId, { status: "active", lastError: null });
	await updateMesh(meshId, { status: "ready", lastError: null });
	await appendLog(node.clusterNodeId, "Multi-VM networking is ready.");
};

export const addClusterNode = async ({
	meshId,
	...input
}: {
	meshId: string;
	name: string;
	sshAddress: string;
	sshPort: number;
	sshUser: string;
	sshKeyId: string;
	endpointAddress: string;
}) =>
	withScaleLock(meshLock(meshId), async () => {
		const mesh = await findMesh(meshId);
		if (mesh.status !== "ready") {
			throw new ClusterMeshError(
				"Finish setting up multi-VM networking before adding VMs.",
			);
		}
		// Several VMs can share an SSH address behind NAT or a jump host, so a
		// machine is identified by address and port; the WireGuard endpoint
		// must be unique because every node listens on the same UDP port.
		const duplicate = mesh.nodes.find(
			(node) =>
				(node.sshAddress === input.sshAddress &&
					node.sshPort === input.sshPort) ||
				node.endpointAddress === input.endpointAddress,
		);
		if (duplicate) {
			throw new ClusterMeshError(
				`${duplicate.name} already uses that SSH address and port or WireGuard address.`,
			);
		}
		const [node] = await db
			.insert(clusterNode)
			.values({
				meshId,
				role: "worker",
				...input,
				wgAddress: allocateAddress(
					mesh.subnet,
					mesh.nodes.map((existing) => existing.wgAddress),
				),
			})
			.returning();
		if (!node) throw new ClusterMeshError("Could not save the VM.");
		startWorkerProvisioning(meshId, node.clusterNodeId);
		return node;
	});

export const retryClusterNode = async (clusterNodeId: string) => {
	const node = await db.query.clusterNode.findFirst({
		where: eq(clusterNode.clusterNodeId, clusterNodeId),
	});
	if (!node) throw new ClusterMeshError("VM not found.");
	if (node.role === "manager") {
		await updateNode(clusterNodeId, {
			status: "provisioning",
			lastError: null,
		});
		await updateMesh(node.meshId, { status: "provisioning", lastError: null });
		runInBackground("Enabling multi-VM networking", clusterNodeId, () =>
			withScaleLock(meshLock(node.meshId), async () => {
				try {
					await provisionManager(node.meshId);
				} catch (error) {
					await updateNode(clusterNodeId, {
						status: "error",
						lastError: errorMessage(error),
					});
					await updateMesh(node.meshId, {
						status: "error",
						lastError: errorMessage(error),
					});
					throw error;
				}
			}),
		);
		return;
	}
	if (node.status !== "error") {
		throw new ClusterMeshError("Only a VM whose setup failed can be retried.");
	}
	await updateNode(clusterNodeId, { status: "provisioning", lastError: null });
	startWorkerProvisioning(node.meshId, clusterNodeId);
};

const startWorkerProvisioning = (meshId: string, clusterNodeId: string) =>
	runInBackground("Adding a VM", clusterNodeId, () =>
		withScaleLock(meshLock(meshId), async () => {
			const attempt = { touchedHost: false };
			try {
				await provisionWorker(meshId, clusterNodeId, attempt);
			} catch (error) {
				await failWorker(meshId, clusterNodeId, error, attempt.touchedHost);
				throw error;
			}
		}),
	);

const nodeIn = (mesh: MeshWithNodes, clusterNodeId: string) => {
	const node = mesh.nodes.find((n) => n.clusterNodeId === clusterNodeId);
	if (!node) throw new ClusterMeshError("VM not found.");
	return node;
};

const provisionWorker = async (
	meshId: string,
	clusterNodeId: string,
	attempt: { touchedHost: boolean },
) => {
	let mesh = await findMesh(meshId);
	let node = nodeIn(mesh, clusterNodeId);
	const manager = managerOf(mesh);

	const facts = await inspectHost(node, mesh.subnet);
	if (facts.swarm === "active" && facts.swarmNodeId !== node.swarmNodeId) {
		throw new ClusterMeshError(
			`${node.name} already belongs to another swarm. Run "docker swarm leave" on it first.`,
		);
	}
	attempt.touchedHost = true;
	if (!facts.docker) {
		await appendLog(
			clusterNodeId,
			"Installing Docker (this can take a few minutes)",
		);
		await runOn(node, installDockerScript());
	}
	await installWireguard(node);
	await appendLog(
		clusterNodeId,
		"Making Docker start after the tunnel at boot",
	);
	await runOn(node, dockerBootOrderScript(), { quiet: true });

	const mtu = Math.min(mesh.wgMtu, computeWgMtu([Number(facts.underlayMtu)]));
	if (mtu !== mesh.wgMtu) {
		await appendLog(clusterNodeId, `Lowering the tunnel MTU to ${mtu}`);
		await updateMesh(meshId, { wgMtu: mtu });
	}
	await applyMeshConfigs(meshId, clusterNodeId);
	await runOn(node, firewallScript(mesh.listenPort));

	mesh = await findMesh(meshId);
	node = nodeIn(mesh, clusterNodeId);
	await appendLog(clusterNodeId, "Checking the tunnel in both directions");
	// The manager first: behind NAT with no forwarded port it can still start
	// the handshake, and the VM then answers through the NAT's mapping.
	await runOn(
		manager,
		pathCheckScript(node.wgAddress, mesh.wgMtu, mesh.listenPort),
	);
	await runOn(
		node,
		pathCheckScript(manager.wgAddress, mesh.wgMtu, mesh.listenPort),
	);

	const docker = await swarmDocker(mesh);
	const swarm = await docker.swarmInspect();
	await appendLog(clusterNodeId, "Joining the swarm (paused until activated)");
	const joined = parseFacts(
		await runOn(
			node,
			joinSwarmScript({
				wgAddress: node.wgAddress,
				managerAddress: mesh.managerAdvertiseAddress as string,
			}),
			{ input: `${swarm.JoinTokens.Worker}\n` },
		),
	);
	const swarmNodeId = joined.swarmNodeId;
	if (!swarmNodeId)
		throw new ClusterMeshError("The VM did not report a swarm node ID.");
	await updateNode(clusterNodeId, { swarmNodeId });

	const swarmNode = docker.getNode(swarmNodeId);
	const inspected = await swarmNode.inspect();
	await swarmNode.update({
		version: inspected.Version.Index,
		...inspected.Spec,
		Labels: { ...inspected.Spec.Labels, [NODE_LABEL]: clusterNodeId },
	});

	await prePullAgentImage(mesh, node, docker);
	await updateNode(clusterNodeId, { status: "paused", lastError: null });
	await appendLog(
		clusterNodeId,
		"The VM joined the swarm, paused. Activate it to let it run replicas.",
	);
};

/** Best effort: a node that cannot pull the private agent image now would
 * fail the global agent task until someone logs it in by hand. */
const prePullAgentImage = async (
	mesh: MeshWithNodes,
	node: NodeWithKey,
	docker: Awaited<ReturnType<typeof swarmDocker>>,
) => {
	try {
		const agent = await docker.getService("dokploy-monitoring").inspect();
		const image: string =
			agent.Spec.TaskTemplate.ContainerSpec.Image.split("@")[0];
		const first = image.split("/")[0] ?? "";
		// Docker treats the first path part as a registry only when it looks
		// like a host; otherwise the image is on Docker Hub.
		const host =
			image.includes("/") &&
			(first.includes(".") || first.includes(":") || first === "localhost")
				? first
				: "";
		const credentials = host
			? await db.query.registry.findFirst({
					where: sql`${registry.organizationId} = ${mesh.organizationId} and ${registry.registryUrl} like ${`%${host}%`}`,
				})
			: undefined;
		if (credentials) {
			await runOn(node, registryLoginScript(host, credentials.username), {
				input: `${credentials.password}\n`,
			});
		}
		await appendLog(
			node.clusterNodeId,
			`Pulling the metrics agent image ${image}`,
		);
		await runOn(node, pullImageScript(image), { quiet: true });
	} catch (error) {
		if ((error as { statusCode?: number }).statusCode === 404) return;
		await appendLog(
			node.clusterNodeId,
			`Could not pre-pull the metrics agent image: ${errorMessage(error)}`,
		);
	}
};

const failWorker = async (
	meshId: string,
	clusterNodeId: string,
	error: unknown,
	touchedHost: boolean,
) => {
	await updateNode(clusterNodeId, {
		status: "error",
		lastError: errorMessage(error),
	});
	// Before the checks pass the host may belong to someone else's swarm, and
	// the rollback's `swarm leave --force` would detach it.
	if (!touchedHost) {
		await appendLog(
			clusterNodeId,
			`Setup failed: ${errorMessage(error)}. Nothing was changed on the VM.`,
		);
		return;
	}
	const mesh = await findMesh(meshId);
	const node = nodeIn(mesh, clusterNodeId);
	await appendLog(
		clusterNodeId,
		`Setup failed: ${errorMessage(error)}. Rolling back.`,
	);
	const steps: [string, () => Promise<unknown>][] = [
		[
			"Leaving the swarm",
			() => runOn(node, leaveSwarmScript(), { quiet: true }),
		],
		[
			"Removing the node from the swarm",
			async () => {
				if (!node.swarmNodeId) return;
				const docker = await swarmDocker(mesh);
				await docker.getNode(node.swarmNodeId).remove({ force: true });
			},
		],
		[
			"Removing its peer from the mesh",
			() => applyMeshConfigs(meshId, clusterNodeId),
		],
		[
			"Removing WireGuard from the VM",
			() => runOn(node, teardownScript(), { quiet: true }),
		],
	];
	for (const [label, step] of steps) {
		try {
			await step();
		} catch (stepError) {
			await appendLog(clusterNodeId, `${label}: ${errorMessage(stepError)}`);
		}
	}
	await updateNode(clusterNodeId, { swarmNodeId: null });
};

export type NodeAvailability = "active" | "pause" | "drain";

const STATUS_BY_AVAILABILITY = {
	active: "active",
	pause: "paused",
	drain: "drained",
} as const;

export const setClusterNodeAvailability = async (
	clusterNodeId: string,
	availability: NodeAvailability,
) => {
	const node = await db.query.clusterNode.findFirst({
		where: eq(clusterNode.clusterNodeId, clusterNodeId),
		with: { mesh: true },
	});
	if (!node?.swarmNodeId) {
		throw new ClusterMeshError("This VM has not joined the swarm.");
	}
	if (node.role === "manager") {
		throw new ClusterMeshError(
			"The manager's availability is not changed here.",
		);
	}
	const docker = await swarmDocker(node.mesh);
	const swarmNode = docker.getNode(node.swarmNodeId);
	const inspected = await swarmNode.inspect();
	await swarmNode.update({
		version: inspected.Version.Index,
		...inspected.Spec,
		Availability: availability,
	});
	await updateNode(clusterNodeId, {
		status: STATUS_BY_AVAILABILITY[availability],
	});
	await appendLog(clusterNodeId, `Availability set to ${availability}`);
};

const waitForNodeEmpty = async (
	docker: Awaited<ReturnType<typeof swarmDocker>>,
	swarmNodeId: string,
	timeoutMs = 180_000,
) => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const tasks = (await docker.listTasks({
			filters: JSON.stringify({
				node: [swarmNodeId],
				"desired-state": ["running"],
			}),
		})) as { Status?: { State?: string } }[];
		if (tasks.every((task) => task.Status?.State !== "running")) return;
		await new Promise((resolve) => setTimeout(resolve, 3_000));
	}
	throw new ClusterMeshError(
		"Replicas are still running on the VM after draining for 3 minutes.",
	);
};

export const removeClusterNode = async (
	clusterNodeId: string,
	force: boolean,
) => {
	const node = await db.query.clusterNode.findFirst({
		where: eq(clusterNode.clusterNodeId, clusterNodeId),
	});
	if (!node) throw new ClusterMeshError("VM not found.");
	if (node.role === "manager") {
		throw new ClusterMeshError(
			"The manager cannot be removed; turn multi-VM networking off instead.",
		);
	}
	await updateNode(clusterNodeId, { status: "removing" });
	runInBackground("Removing a VM", clusterNodeId, () =>
		withScaleLock(meshLock(node.meshId), async () => {
			const mesh = await findMesh(node.meshId);
			const current = nodeIn(mesh, clusterNodeId);
			const docker = await swarmDocker(mesh);
			try {
				if (current.swarmNodeId && !force) {
					await appendLog(clusterNodeId, "Draining replicas to other nodes");
					const swarmNode = docker.getNode(current.swarmNodeId);
					const inspected = await swarmNode.inspect();
					await swarmNode.update({
						version: inspected.Version.Index,
						...inspected.Spec,
						Availability: "drain",
					});
					await waitForNodeEmpty(docker, current.swarmNodeId);
					await runOn(current, leaveSwarmScript(), { quiet: true });
				}
				if (current.swarmNodeId) {
					await docker
						.getNode(current.swarmNodeId)
						.remove({ force: true })
						.catch((error: { statusCode?: number }) => {
							if (error.statusCode !== 404) throw error;
						});
				}
				await applyMeshConfigs(node.meshId, clusterNodeId);
				if (!force) {
					await runOn(current, teardownScript(), { quiet: true }).catch(
						(error) =>
							appendLog(
								clusterNodeId,
								`Could not remove WireGuard from the VM: ${errorMessage(error)}`,
							),
					);
				}
				await db
					.delete(clusterNode)
					.where(eq(clusterNode.clusterNodeId, clusterNodeId));
			} catch (error) {
				await updateNode(clusterNodeId, {
					status: "error",
					lastError: errorMessage(error),
				});
				throw error;
			}
		}),
	);
};

export const disableClusterMesh = async (meshId: string) =>
	withScaleLock(meshLock(meshId), async () => {
		const mesh = await findMesh(meshId);
		if (mesh.nodes.some((node) => node.role === "worker")) {
			throw new ClusterMeshError("Remove every VM before turning this off.");
		}
		const manager = mesh.nodes.find((node) => node.role === "manager");
		if (manager?.wgPublicKey) {
			await runOn(manager, teardownScript(), { quiet: true });
		}
		await db.delete(clusterMesh).where(eq(clusterMesh.meshId, meshId));
	});

/** Seconds since each peer's last WireGuard handshake, seen from the manager. */
export const getMeshHandshakes = async (meshId: string) => {
	const mesh = await findMesh(meshId);
	const manager = managerOf(mesh);
	const output = await runOn(manager, handshakesScript(), { quiet: true });
	const now = Math.floor(Date.now() / 1000);
	const ages = new Map<string, number | null>();
	for (const line of output.trim().split("\n")) {
		const [publicKey, epoch] = line.trim().split(/\s+/);
		if (!publicKey) continue;
		const seconds = Number(epoch);
		ages.set(publicKey, seconds > 0 ? now - seconds : null);
	}
	return ages;
};

/** Sets or clears a swarm node's pool label, which placement can target. */
export const setSwarmNodePool = async ({
	serverId,
	swarmNodeId,
	pool,
}: {
	serverId: string | null;
	swarmNodeId: string;
	pool: string | null;
}) => {
	const docker = await swarmDocker({ serverId });
	const node = docker.getNode(swarmNodeId);
	const inspected = await node.inspect();
	const labels: Record<string, string> = { ...inspected.Spec.Labels };
	if (pool) labels[POOL_LABEL] = pool;
	else delete labels[POOL_LABEL];
	await node.update({
		version: inspected.Version.Index,
		...inspected.Spec,
		Labels: labels,
	});
};

export const listSwarmPools = async (serverId: string | null) => {
	const docker = await swarmDocker({ serverId });
	const nodes = (await docker.listNodes()) as {
		Spec?: { Labels?: Record<string, string> };
	}[];
	return [
		...new Set(
			nodes
				.map((node) => node.Spec?.Labels?.[POOL_LABEL])
				.filter((pool): pool is string => !!pool),
		),
	].sort();
};
