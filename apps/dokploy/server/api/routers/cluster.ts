import {
	type DockerNode,
	execAsync,
	execAsyncRemote,
	findServerById,
	getAccessibleServerIds,
	getRemoteDocker,
} from "@dokploy/server";
import { quoteShellArg } from "@dokploy/server/utils/filesystem/safe-path";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import { assertLocalHostAccess } from "@/server/api/utils/local-host-access";
import { getLocalServerIp } from "@/server/wss/terminal";
import { createTRPCRouter, withPermission } from "../trpc";

const dockerNodeIdentifierRegex = /^[a-zA-Z0-9._-]+$/;

const normalizeDockerNodeIdentifier = (nodeId: string) => {
	const normalizedNodeId = nodeId.trim();

	if (!dockerNodeIdentifierRegex.test(normalizedNodeId)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Invalid Docker node identifier",
		});
	}

	return normalizedNodeId;
};

const assertClusterServerAccess = async (
	ctx: {
		user: {
			id: string;
		};
		session: {
			userId: string;
			activeOrganizationId: string;
		};
	},
	serverId?: string,
) => {
	if (!serverId) {
		await assertLocalHostAccess(ctx);
		return;
	}

	const accessibleIds = await getAccessibleServerIds(ctx.session);
	if (!accessibleIds.has(serverId)) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You don't have access to this server.",
		});
	}
};

export const clusterRouter = createTRPCRouter({
	getNodes: withPermission("server", "read")
		.input(
			z.object({
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			await assertClusterServerAccess(ctx, input.serverId);
			const docker = await getRemoteDocker(input.serverId);
			const workers: DockerNode[] = await docker.listNodes();
			return workers;
		}),

	removeWorker: withPermission("server", "delete")
		.input(
			z.object({
				nodeId: z.string(),
				serverId: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			await assertClusterServerAccess(ctx, input.serverId);
			const nodeId = normalizeDockerNodeIdentifier(input.nodeId);
			const quotedNodeId = quoteShellArg(nodeId);
			try {
				const drainCommand = `docker node update --availability drain ${quotedNodeId}`;
				const removeCommand = `docker node rm ${quotedNodeId} --force`;

				if (input.serverId) {
					await execAsyncRemote(input.serverId, drainCommand);
					await execAsyncRemote(input.serverId, removeCommand);
				} else {
					await execAsync(drainCommand);
					await execAsync(removeCommand);
				}
				await audit(ctx, {
					action: "delete",
					resourceType: "cluster",
					resourceId: nodeId,
					resourceName: nodeId,
				});
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Error removing the node",
					cause: error,
				});
			}
		}),

	addWorker: withPermission("server", "execute")
		.input(
			z.object({
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			await assertClusterServerAccess(ctx, input.serverId);
			const docker = await getRemoteDocker(input.serverId);
			const result = await docker.swarmInspect();
			const docker_version = await docker.version();
			const info = await docker.info();

			const swarmNodeAddr = info?.Swarm?.NodeAddr;
			let ip = swarmNodeAddr || (await getLocalServerIp());
			if (!swarmNodeAddr && input.serverId) {
				const server = await findServerById(input.serverId);
				ip = server?.ipAddress;
			}

			return {
				command: `docker swarm join --token ${result.JoinTokens.Worker} ${ip}:2377`,
				version: docker_version.Version,
			};
		}),

	addManager: withPermission("server", "execute")
		.input(
			z.object({
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			await assertClusterServerAccess(ctx, input.serverId);
			const docker = await getRemoteDocker(input.serverId);
			const result = await docker.swarmInspect();
			const docker_version = await docker.version();
			const info = await docker.info();

			const swarmNodeAddr = info?.Swarm?.NodeAddr;
			let ip = swarmNodeAddr || (await getLocalServerIp());
			if (!swarmNodeAddr && input.serverId) {
				const server = await findServerById(input.serverId);
				ip = server?.ipAddress;
			}
			return {
				command: `docker swarm join --token ${result.JoinTokens.Manager} ${ip}:2377`,
				version: docker_version.Version,
			};
		}),
});
