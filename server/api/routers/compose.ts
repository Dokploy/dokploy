import {
	apiCreateCompose,
	apiFindCompose,
	apiUpdateCompose,
	compose,
} from "@/server/db/schema";
import {
	createCompose,
	findComposeById,
	loadServices,
	removeCompose,
	stopCompose,
	updateCompose,
} from "../services/compose";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { checkServiceAccess } from "../services/user";
import {
	cleanQueuesByCompose,
	type ComposeJob,
} from "@/server/queues/compose-queue";
import { myComposeQueue } from "@/server/queues/queueSetup";
import {
	generateSSHKey,
	readRSAFile,
	removeRSAFiles,
} from "@/server/utils/filesystem/ssh";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { randomizeComposeFile } from "@/server/utils/docker/compose";
import { nanoid } from "nanoid";
import { removeDeploymentsByComposeId } from "../services/deployment";
import { removeComposeDirectory } from "@/server/utils/filesystem/directory";
import { createCommand } from "@/server/utils/builders/compose";

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
	delete: protectedProcedure
		.input(apiFindCompose)
		.mutation(async ({ input, ctx }) => {
			if (ctx.user.rol === "user") {
				await checkServiceAccess(ctx.user.authId, input.composeId, "delete");
			}
			const composeResult = await findComposeById(input.composeId);

			const result = await db
				.delete(compose)
				.where(eq(compose.composeId, input.composeId))
				.returning();

			const cleanupOperations = [
				async () => await removeCompose(composeResult),
				async () => await removeDeploymentsByComposeId(composeResult),
				async () => await removeComposeDirectory(composeResult.appName),
				async () => await removeRSAFiles(composeResult.appName),
			];

			for (const operation of cleanupOperations) {
				try {
					await operation();
				} catch (error) {}
			}

			return result[0];
		}),
	cleanQueues: protectedProcedure
		.input(apiFindCompose)
		.mutation(async ({ input }) => {
			await cleanQueuesByCompose(input.composeId);
		}),

	allServices: protectedProcedure
		.input(apiFindCompose)
		.query(async ({ input }) => {
			return await loadServices(input.composeId);
		}),

	randomizeCompose: protectedProcedure
		.input(apiFindCompose)
		.mutation(async ({ input }) => {
			return await randomizeComposeFile(input.composeId);
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
	redeploy: protectedProcedure
		.input(apiFindCompose)
		.mutation(async ({ input }) => {
			const jobData: ComposeJob = {
				composeId: input.composeId,
				titleLog: "Rebuild deployment",
				type: "redeploy",
			};
			await myComposeQueue.add(
				"deployments",
				{ ...jobData },
				{
					removeOnComplete: true,
					removeOnFail: true,
				},
			);
		}),
	stop: protectedProcedure.input(apiFindCompose).mutation(async ({ input }) => {
		await stopCompose(input.composeId);

		return true;
	}),
	getDefaultCommand: protectedProcedure
		.input(apiFindCompose)
		.query(async ({ input }) => {
			const compose = await findComposeById(input.composeId);
			const command = createCommand(compose);
			return `docker ${command}`;
		}),
	generateSSHKey: protectedProcedure
		.input(apiFindCompose)
		.mutation(async ({ input }) => {
			const compose = await findComposeById(input.composeId);
			try {
				await generateSSHKey(compose.appName);
				const file = await readRSAFile(compose.appName);

				await updateCompose(input.composeId, {
					customGitSSHKey: file,
				});
			} catch (error) {}

			return true;
		}),
	refreshToken: protectedProcedure
		.input(apiFindCompose)
		.mutation(async ({ input }) => {
			await updateCompose(input.composeId, {
				refreshToken: nanoid(),
			});
			return true;
		}),
	removeSSHKey: protectedProcedure
		.input(apiFindCompose)
		.mutation(async ({ input }) => {
			const compose = await findComposeById(input.composeId);
			await removeRSAFiles(compose.appName);
			await updateCompose(input.composeId, {
				customGitSSHKey: null,
			});

			return true;
		}),
});
