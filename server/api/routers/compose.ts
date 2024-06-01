import {
	apiCreateCompose,
	apiCreateComposeByTemplate,
	apiFindCompose,
	apiRandomizeCompose,
	apiUpdateCompose,
	compose,
} from "@/server/db/schema";
import {
	createCompose,
	createComposeByTemplate,
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
	type DeploymentJob,
} from "@/server/queues/deployments-queue";
import { myQueue } from "@/server/queues/queueSetup";
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
import { loadTemplateModule, readComposeFile } from "@/server/templates/utils";
import { templates } from "@/server/templates/templates";
import { findAdmin } from "../services/admin";
import { TRPCError } from "@trpc/server";
import { findProjectById, slugifyProjectName } from "../services/project";
import type { TemplatesKeys } from "@/server/templates/types/templates-data.type";
import { createMount } from "../services/mount";

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
		.input(apiRandomizeCompose)
		.mutation(async ({ input }) => {
			return await randomizeComposeFile(input.composeId, input.prefix);
		}),

	deploy: protectedProcedure
		.input(apiFindCompose)
		.mutation(async ({ input }) => {
			const jobData: DeploymentJob = {
				composeId: input.composeId,
				titleLog: "Manual deployment",
				type: "deploy",
				applicationType: "compose",
			};
			await myQueue.add(
				"deployments",
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
			const jobData: DeploymentJob = {
				composeId: input.composeId,
				titleLog: "Rebuild deployment",
				type: "redeploy",
				applicationType: "compose",
			};
			await myQueue.add(
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
	deployTemplate: protectedProcedure
		.input(apiCreateComposeByTemplate)
		.mutation(async ({ input }) => {
			const composeFile = await readComposeFile(input.folder);

			const generate = await loadTemplateModule(input.folder as TemplatesKeys);

			const admin = await findAdmin();

			if (!admin.host) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message:
						"You need to have a host to deploy this template in order to generate domains, please configure in settings -> domain",
				});
			}

			const project = await findProjectById(input.projectId);

			const projectName = slugifyProjectName(`${project.name}-${input.folder}`);
			const { envs, mounts } = generate({
				domain: admin.host,
				projectName: projectName,
			});

			const compose = await createComposeByTemplate({
				...input,
				composeFile,
				env: envs.join("\n"),
				name: input.folder,
				sourceType: "raw",
			});

			if (mounts && mounts?.length > 0) {
				for (const mount of mounts) {
					await createMount({
						mountPath: mount.mountPath,
						content: mount.content,
						serviceId: compose.composeId,
						serviceType: "compose",
						type: "file",
					});
				}
			}

			return compose;
		}),

	templates: protectedProcedure.query(async () => {
		const templatesData = templates.map((t) => ({
			name: t.name,
			description: t.description,
			type: t.type,
			folder: t.folder,
			links: t.links,
			logo: t.logo,
		}));

		return templatesData;
	}),
});
