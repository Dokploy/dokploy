import {
	addClusterNode,
	ClusterMeshError,
	disableClusterMesh,
	enableClusterMesh,
	findClusterPreflightIssues,
	findMesh,
	findMeshBySwarm,
	findServerById,
	findSSHKeyById,
	getMeshHandshakes,
	getRemoteDocker,
	getWebServerSettings,
	IS_CLOUD,
	listSwarmPools,
	POOL_LABEL,
	removeClusterNode,
	retryClusterNode,
	setClusterNodeAvailability,
	setSwarmNodePool,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { clusterNode } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import {
	apiActivateClusterNode,
	apiAddClusterNode,
	apiClusterNode,
	apiEnableClusterMesh,
	apiFindClusterMesh,
	apiFindClusterPreflight,
	apiRemoveClusterNode,
	apiSetClusterNodeAvailability,
	poolName,
} from "@/server/db/schema";
import { getDockerHost } from "@/server/utils/docker";
import { createTRPCRouter, withPermission } from "../trpc";

type Ctx = { session: { activeOrganizationId: string } };

const toTRPCError = (error: unknown) => {
	if (error instanceof TRPCError) return error;
	if (error instanceof ClusterMeshError) {
		return new TRPCError({
			code: "PRECONDITION_FAILED",
			message: error.message,
		});
	}
	return new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: error instanceof Error ? error.message : String(error),
		cause: error,
	});
};

const rejectOnCloud = () => {
	if (IS_CLOUD) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Dokploy Cloud manages its own nodes.",
		});
	}
};

const assertServer = async (ctx: Ctx, serverId: string | undefined) => {
	if (!serverId) return;
	const server = await findServerById(serverId);
	if (server.organizationId !== ctx.session.activeOrganizationId) {
		throw new TRPCError({ code: "FORBIDDEN", message: "Server not found." });
	}
};

const assertSshKey = async (ctx: Ctx, sshKeyId: string) => {
	const key = await findSSHKeyById(sshKeyId);
	if (key.organizationId !== ctx.session.activeOrganizationId) {
		throw new TRPCError({ code: "FORBIDDEN", message: "SSH key not found." });
	}
};

const meshForCaller = async (ctx: Ctx, meshId: string) => {
	const mesh = await findMesh(meshId);
	if (mesh.organizationId !== ctx.session.activeOrganizationId) {
		throw new TRPCError({ code: "FORBIDDEN", message: "Mesh not found." });
	}
	return mesh;
};

const nodeForCaller = async (ctx: Ctx, clusterNodeId: string) => {
	const node = await db.query.clusterNode.findFirst({
		where: eq(clusterNode.clusterNodeId, clusterNodeId),
		with: { mesh: true },
	});
	if (!node || node.mesh.organizationId !== ctx.session.activeOrganizationId) {
		throw new TRPCError({ code: "NOT_FOUND", message: "VM not found." });
	}
	return node;
};

const preflightBlock = async (
	mesh: { serverId: string | null; organizationId: string },
	acknowledged: boolean,
) => {
	const findings = await findClusterPreflightIssues({
		serverId: mesh.serverId,
		organizationId: mesh.organizationId,
	});
	if (findings.length > 0 && !acknowledged) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: `${findings.length} service(s) could break once this VM runs replicas. Review them before activating.`,
		});
	}
	return findings.length;
};

export const clusterMeshRouter = createTRPCRouter({
	get: withPermission("docker", "read")
		.input(apiFindClusterMesh)
		.query(async ({ input, ctx }) => {
			if (IS_CLOUD) return null;
			await assertServer(ctx, input.serverId);
			const mesh = await findMeshBySwarm(input.serverId);
			if (!mesh || mesh.organizationId !== ctx.session.activeOrganizationId) {
				return null;
			}
			type SwarmNodeSummary = {
				ID: string;
				Status?: { State?: string };
				Spec?: { Availability?: string; Labels?: Record<string, string> };
			};
			const swarmNodes = await getRemoteDocker(input.serverId ?? null)
				.then((docker) => docker.listNodes() as Promise<SwarmNodeSummary[]>)
				.catch(() => [] as SwarmNodeSummary[]);
			return {
				...mesh,
				nodes: mesh.nodes
					.sort((a, b) =>
						a.role === b.role
							? a.createdAt.getTime() - b.createdAt.getTime()
							: a.role === "manager"
								? -1
								: 1,
					)
					.map(({ log: _log, ...node }) => {
						const swarm = swarmNodes.find((n) => n.ID === node.swarmNodeId);
						return {
							...node,
							swarmState: swarm?.Status?.State ?? null,
							swarmAvailability: swarm?.Spec?.Availability ?? null,
							pool: swarm?.Spec?.Labels?.[POOL_LABEL] ?? null,
						};
					}),
			};
		}),

	defaults: withPermission("server", "create")
		.input(apiFindClusterMesh)
		.query(async ({ input, ctx }) => {
			await assertServer(ctx, input.serverId);
			if (input.serverId) {
				const server = await findServerById(input.serverId);
				return {
					sshAddress: server.ipAddress,
					sshPort: server.port,
					sshUser: server.username,
					sshKeyId: server.sshKeyId,
					endpointAddress: server.ipAddress,
				};
			}
			const settings = await getWebServerSettings();
			return {
				// From inside Dokploy's container the host is reachable on the
				// Docker gateway; its public IP may not loop back to itself.
				sshAddress: await getDockerHost(),
				sshPort: 22,
				sshUser: "root",
				sshKeyId: null,
				endpointAddress: settings?.serverIp ?? "",
			};
		}),

	enable: withPermission("server", "create")
		.input(apiEnableClusterMesh)
		.mutation(async ({ input, ctx }) => {
			rejectOnCloud();
			await assertServer(ctx, input.serverId);
			await assertSshKey(ctx, input.manager.sshKeyId);
			try {
				const mesh = await enableClusterMesh({
					organizationId: ctx.session.activeOrganizationId,
					serverId: input.serverId ?? null,
					subnet: input.subnet,
					listenPort: input.listenPort,
					manager: input.manager,
				});
				await audit(ctx, {
					action: "create",
					resourceType: "server",
					resourceId: input.serverId,
					resourceName: "multi-VM networking",
					metadata: { subnet: mesh.subnet, listenPort: mesh.listenPort },
				});
				return mesh;
			} catch (error) {
				throw toTRPCError(error);
			}
		}),

	disable: withPermission("server", "create")
		.input(z.object({ meshId: z.string().min(1) }))
		.mutation(async ({ input, ctx }) => {
			const mesh = await meshForCaller(ctx, input.meshId);
			try {
				await disableClusterMesh(input.meshId);
			} catch (error) {
				throw toTRPCError(error);
			}
			await audit(ctx, {
				action: "delete",
				resourceType: "server",
				resourceId: mesh.serverId ?? undefined,
				resourceName: "multi-VM networking",
			});
			return true;
		}),

	addNode: withPermission("server", "create")
		.input(apiAddClusterNode)
		.mutation(async ({ input, ctx }) => {
			rejectOnCloud();
			const mesh = await meshForCaller(ctx, input.meshId);
			await assertSshKey(ctx, input.sshKeyId);
			try {
				const node = await addClusterNode(input);
				await audit(ctx, {
					action: "create",
					resourceType: "server",
					resourceId: mesh.serverId ?? undefined,
					resourceName: `VM ${input.name}`,
					metadata: { sshAddress: input.sshAddress },
				});
				return node;
			} catch (error) {
				throw toTRPCError(error);
			}
		}),

	retryNode: withPermission("server", "create")
		.input(apiClusterNode)
		.mutation(async ({ input, ctx }) => {
			await nodeForCaller(ctx, input.clusterNodeId);
			try {
				await retryClusterNode(input.clusterNodeId);
			} catch (error) {
				throw toTRPCError(error);
			}
			return true;
		}),

	preflight: withPermission("docker", "read")
		.input(apiFindClusterPreflight)
		.query(async ({ input, ctx }) => {
			const mesh = await meshForCaller(ctx, input.meshId);
			return findClusterPreflightIssues({
				serverId: mesh.serverId,
				organizationId: mesh.organizationId,
			});
		}),

	activateNode: withPermission("server", "create")
		.input(apiActivateClusterNode)
		.mutation(async ({ input, ctx }) => {
			const node = await nodeForCaller(ctx, input.clusterNodeId);
			const findings = await preflightBlock(
				node.mesh,
				input.acknowledgeFindings,
			);
			try {
				await setClusterNodeAvailability(input.clusterNodeId, "active");
			} catch (error) {
				throw toTRPCError(error);
			}
			await audit(ctx, {
				action: "update",
				resourceType: "server",
				resourceId: node.mesh.serverId ?? undefined,
				resourceName: `VM ${node.name}`,
				metadata: { availability: "active", acknowledgedFindings: findings },
			});
			return true;
		}),

	setAvailability: withPermission("server", "create")
		.input(apiSetClusterNodeAvailability)
		.mutation(async ({ input, ctx }) => {
			const node = await nodeForCaller(ctx, input.clusterNodeId);
			if (input.availability === "active") {
				await preflightBlock(node.mesh, input.acknowledgeFindings);
			}
			try {
				await setClusterNodeAvailability(
					input.clusterNodeId,
					input.availability,
				);
			} catch (error) {
				throw toTRPCError(error);
			}
			await audit(ctx, {
				action: "update",
				resourceType: "server",
				resourceId: node.mesh.serverId ?? undefined,
				resourceName: `VM ${node.name}`,
				metadata: { availability: input.availability },
			});
			return true;
		}),

	removeNode: withPermission("server", "create")
		.input(apiRemoveClusterNode)
		.mutation(async ({ input, ctx }) => {
			const node = await nodeForCaller(ctx, input.clusterNodeId);
			try {
				await removeClusterNode(input.clusterNodeId, input.force);
			} catch (error) {
				throw toTRPCError(error);
			}
			await audit(ctx, {
				action: "delete",
				resourceType: "server",
				resourceId: node.mesh.serverId ?? undefined,
				resourceName: `VM ${node.name}`,
				metadata: { force: input.force },
			});
			return true;
		}),

	pools: withPermission("docker", "read")
		.input(apiFindClusterMesh)
		.query(async ({ input, ctx }) => {
			await assertServer(ctx, input.serverId);
			try {
				return await listSwarmPools(input.serverId ?? null);
			} catch {
				return [];
			}
		}),

	setNodePool: withPermission("server", "create")
		.input(apiClusterNode.extend({ pool: poolName.nullable() }))
		.mutation(async ({ input, ctx }) => {
			const node = await nodeForCaller(ctx, input.clusterNodeId);
			if (!node.swarmNodeId) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "This VM has not joined the swarm yet.",
				});
			}
			try {
				await setSwarmNodePool({
					serverId: node.mesh.serverId,
					swarmNodeId: node.swarmNodeId,
					pool: input.pool,
				});
			} catch (error) {
				throw toTRPCError(error);
			}
			await audit(ctx, {
				action: "update",
				resourceType: "server",
				resourceId: node.mesh.serverId ?? undefined,
				resourceName: `VM ${node.name}`,
				metadata: { pool: input.pool },
			});
			return true;
		}),

	log: withPermission("docker", "read")
		.input(apiClusterNode)
		.query(async ({ input, ctx }) => {
			const node = await nodeForCaller(ctx, input.clusterNodeId);
			return { log: node.log, status: node.status, lastError: node.lastError };
		}),

	handshakes: withPermission("docker", "read")
		.input(z.object({ meshId: z.string().min(1) }))
		.query(async ({ input, ctx }) => {
			const mesh = await meshForCaller(ctx, input.meshId);
			try {
				const ages = await getMeshHandshakes(input.meshId);
				return Object.fromEntries(
					mesh.nodes
						.filter((node) => node.role === "worker" && node.wgPublicKey)
						.map((node) => [
							node.clusterNodeId,
							ages.get(node.wgPublicKey as string) ?? null,
						]),
				);
			} catch (error) {
				throw toTRPCError(error);
			}
		}),
});
