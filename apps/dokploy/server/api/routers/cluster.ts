import {
	type DockerNode,
	execAsync,
	execAsyncRemote,
	findServerById,
	getRemoteDocker,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import { getLocalServerIp } from "@/server/wss/terminal";
import { createTRPCRouter, withPermission } from "../trpc";

export const clusterRouter = createTRPCRouter({
	getNodes: withPermission("server", "read")
		.meta({
			openapi: {
				summary: "Get cluster nodes",
				description: "Retrieves all nodes in the Docker Swarm cluster. Optionally targets a remote server.",
			},
		})
		.input(
			z.object({
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			const docker = await getRemoteDocker(input.serverId);
			const workers: DockerNode[] = await docker.listNodes();
			return workers;
		}),

	removeWorker: withPermission("server", "delete")
		.meta({
			openapi: {
				summary: "Remove a worker node",
				description: "Drains and forcefully removes a worker node from the Docker Swarm cluster. An audit log entry is created for the removal.",
			},
		})
		.input(
			z.object({
				nodeId: z.string(),
				serverId: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				const drainCommand = `docker node update --availability drain ${input.nodeId}`;
				const removeCommand = `docker node rm ${input.nodeId} --force`;

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
					resourceId: input.nodeId,
					resourceName: input.nodeId,
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

	addWorker: withPermission("server", "create")
		.meta({
			openapi: {
				summary: "Get worker join command",
				description: "Returns the Docker Swarm join command and token for adding a new worker node to the cluster, along with the Docker version.",
			},
		})
		.input(
			z.object({
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			const docker = await getRemoteDocker(input.serverId);
			const result = await docker.swarmInspect();
			const docker_version = await docker.version();

			let ip = await getLocalServerIp();
			if (input.serverId) {
				const server = await findServerById(input.serverId);
				ip = server?.ipAddress;
			}

			return {
				command: `docker swarm join --token ${result.JoinTokens.Worker} ${ip}:2377`,
				version: docker_version.Version,
			};
		}),

	addManager: withPermission("server", "create")
		.meta({
			openapi: {
				summary: "Get manager join command",
				description: "Returns the Docker Swarm join command and token for adding a new manager node to the cluster, along with the Docker version.",
			},
		})
		.input(
			z.object({
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			const docker = await getRemoteDocker(input.serverId);
			const result = await docker.swarmInspect();
			const docker_version = await docker.version();

			let ip = await getLocalServerIp();
			if (input.serverId) {
				const server = await findServerById(input.serverId);
				ip = server?.ipAddress;
			}
			return {
				command: `docker swarm join --token ${result.JoinTokens.Manager} ${ip}:2377`,
				version: docker_version.Version,
			};
		}),
});
