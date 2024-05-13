import { docker } from "@/server/constants";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { getPublicIpWithFallback } from "@/server/wss/terminal";

export const clusterRouter = createTRPCRouter({
	getWorkers: protectedProcedure.query(async () => {
		const workers = await docker.listNodes();
		// console.log(workers);
		return workers;
	}),
	addWorker: protectedProcedure.query(async ({ input }) => {
		const result = await docker.swarmInspect();
		return `docker swarm join --token ${
			result.JoinTokens.Worker
		} ${await getPublicIpWithFallback()}:2377`;
	}),
});
