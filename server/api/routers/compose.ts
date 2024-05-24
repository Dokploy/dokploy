import {
	apiCreateCompose,
	apiFindCompose,
	apiUpdateCompose,
} from "@/server/db/schema";
import {
	createCompose,
	findComposeById,
	loadServices,
	randomizeCompose,
	updateCompose,
} from "../services/compose";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { checkServiceAccess } from "../services/user";
import type { ComposeJob } from "@/server/queues/compose-queue";
import { myComposeQueue } from "@/server/queues/queueSetup";

export const composeRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateCompose)
		.mutation(async ({ input }) => {
			return createCompose(input);
		}),

	one: protectedProcedure
		.input(apiFindCompose)
		.query(async ({ input, ctx }) => {
			if (ctx.user.rol === "user") {
				await checkServiceAccess(ctx.user.authId, input.composeId, "access");
			}

			return await findComposeById(input.composeId);
		}),

	update: protectedProcedure
		.input(apiUpdateCompose)
		.mutation(async ({ input }) => {
			return updateCompose(input.composeId, input);
		}),

	allServices: protectedProcedure
		.input(apiFindCompose)
		.query(async ({ input }) => {
			return await loadServices(input.composeId);
		}),

	randomizeCompose: protectedProcedure
		.input(apiFindCompose)
		.mutation(async ({ input }) => {
			return await randomizeCompose(input.composeId);
		}),

	deploy: protectedProcedure
		.input(apiFindCompose)
		.mutation(async ({ input }) => {
			const jobData: ComposeJob = {
				composeId: input.composeId,
				titleLog: "Manual deployment",
				type: "deploy",
			};
			await myComposeQueue.add(
				"compose",
				{ ...jobData },
				{
					removeOnComplete: true,
					removeOnFail: true,
				},
			);
		}),
});
