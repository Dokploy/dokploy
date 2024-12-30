import { getPublicIpWithFallback } from "@/server/wss/terminal";
import { type DockerNode, IS_CLOUD, docker, execAsync } from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const clusterRouter = createTRPCRouter({
	getNodes: protectedProcedure.query(async () => {
		if (IS_CLOUD) {
			return [];
		}
		const workers: DockerNode[] = await docker.listNodes();

		return workers;
	}),
	removeWorker: protectedProcedure
		.input(
			z.object({
				nodeId: z.string(),
			}),
		)
		.mutation(async ({ input }) => {
			if (IS_CLOUD) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Functionality not available in cloud version",
				});
			}
			try {
				await execAsync(
					`docker node update --availability drain ${input.nodeId}`,
				);
				await execAsync(`docker node rm ${input.nodeId} --force`);
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Error removing the node",
					cause: error,
				});
			}
		}),
	addWorker: protectedProcedure.query(async ({ input }) => {
		if (IS_CLOUD) {
			return {
				command: "",
				version: "",
			};
		}
		const result = await docker.swarmInspect();
		const docker_version = await docker.version();

		return {
			command: `docker swarm join --token ${
				result.JoinTokens.Worker
			} ${await getPublicIpWithFallback()}:2377`,
			version: docker_version.Version,
		};
	}),
	addManager: protectedProcedure.query(async ({ input }) => {
		if (IS_CLOUD) {
			return {
				command: "",
				version: "",
			};
		}
		const result = await docker.swarmInspect();
		const docker_version = await docker.version();
		return {
			command: `docker swarm join --token ${
				result.JoinTokens.Manager
			} ${await getPublicIpWithFallback()}:2377`,
			version: docker_version.Version,
		};
	}),
});
