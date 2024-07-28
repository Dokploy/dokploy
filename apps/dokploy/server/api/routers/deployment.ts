import {
	apiFindAllByApplication,
	apiFindAllByCompose,
} from "@dokploy/server/db/schema";
import {
	findAllDeploymentsByApplicationId,
	findAllDeploymentsByComposeId,
} from "../services/deployment";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const deploymentRouter = createTRPCRouter({
	all: protectedProcedure
		.input(apiFindAllByApplication)
		.query(async ({ input }) => {
			return await findAllDeploymentsByApplicationId(input.applicationId);
		}),

	allByCompose: protectedProcedure
		.input(apiFindAllByCompose)
		.query(async ({ input }) => {
			return await findAllDeploymentsByComposeId(input.composeId);
		}),
});
