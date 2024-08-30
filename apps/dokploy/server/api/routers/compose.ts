import { slugify } from "@/lib/slug";
import { db } from "@/server/db";
import {
	apiCreateCompose,
	apiCreateComposeByTemplate,
	apiFetchServices,
	apiFindCompose,
	apiRandomizeCompose,
	apiUpdateCompose,
	compose,
} from "@/server/db/schema";
import {
	type DeploymentJob,
	cleanQueuesByCompose,
} from "@/server/queues/deployments-queue";
import { myQueue } from "@/server/queues/queueSetup";
import { createCommand } from "@/server/utils/builders/compose";
import { randomizeComposeFile } from "@/server/utils/docker/compose";
import { addDomainToCompose, cloneCompose } from "@/server/utils/docker/domain";
import { removeComposeDirectory } from "@/server/utils/filesystem/directory";
import { templates } from "@/templates/templates";
import type { TemplatesKeys } from "@/templates/types/templates-data.type";
import {
	generatePassword,
	loadTemplateModule,
	readTemplateComposeFile,
} from "@/templates/utils";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { dump } from "js-yaml";
import _ from "lodash";
import { nanoid } from "nanoid";
import { findAdmin } from "../services/admin";
import {
	createCompose,
	createComposeByTemplate,
	findComposeById,
	loadServices,
	removeCompose,
	stopCompose,
	updateCompose,
} from "../services/compose";
import { removeDeploymentsByComposeId } from "../services/deployment";
import { createDomain, findDomainsByComposeId } from "../services/domain";
import { createMount } from "../services/mount";
import { findProjectById } from "../services/project";
import { addNewService, checkServiceAccess } from "../services/user";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const composeRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateCompose)
		.mutation(async ({ ctx, input }) => {
			try {
				if (ctx.user.rol === "user") {
					await checkServiceAccess(ctx.user.authId, input.projectId, "create");
				}
				const newService = await createCompose(input);

				if (ctx.user.rol === "user") {
					await addNewService(ctx.user.authId, newService.composeId);
				}
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to create the compose",
					cause: error,
				});
			}
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

	loadServices: protectedProcedure
		.input(apiFetchServices)
		.query(async ({ input }) => {
			return await loadServices(input.composeId, input.type);
		}),
	fetchSourceType: protectedProcedure
		.input(apiFindCompose)
		.mutation(async ({ input }) => {
			try {
				const compose = await findComposeById(input.composeId);
				await cloneCompose(compose);
				return compose.sourceType;
			} catch (err) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to fetch source type",
					cause: err,
				});
			}
		}),

	randomizeCompose: protectedProcedure
		.input(apiRandomizeCompose)
		.mutation(async ({ input }) => {
			return await randomizeComposeFile(input.composeId, input.prefix);
		}),
	getConvertedCompose: protectedProcedure
		.input(apiFindCompose)
		.query(async ({ input }) => {
			const compose = await findComposeById(input.composeId);
			const domains = await findDomainsByComposeId(input.composeId);

			const composeFile = await addDomainToCompose(compose, domains);
			return dump(composeFile, {
				lineWidth: 1000,
			});
		}),

	deploy: protectedProcedure
		.input(apiFindCompose)
		.mutation(async ({ input }) => {
			const jobData: DeploymentJob = {
				composeId: input.composeId,
				titleLog: "Manual deployment",
				type: "deploy",
				applicationType: "compose",
				descriptionLog: "",
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
				descriptionLog: "",
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
	refreshToken: protectedProcedure
		.input(apiFindCompose)
		.mutation(async ({ input }) => {
			await updateCompose(input.composeId, {
				refreshToken: nanoid(),
			});
			return true;
		}),
	deployTemplate: protectedProcedure
		.input(apiCreateComposeByTemplate)
		.mutation(async ({ ctx, input }) => {
			if (ctx.user.rol === "user") {
				await checkServiceAccess(ctx.user.authId, input.projectId, "create");
			}
			const composeFile = await readTemplateComposeFile(input.id);

			const generate = await loadTemplateModule(input.id as TemplatesKeys);

			const admin = await findAdmin();

			if (!admin.serverIp) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message:
						"You need to have a server IP to deploy this template in order to generate domains",
				});
			}

			const project = await findProjectById(input.projectId);

			const projectName = slugify(`${project.name} ${input.id}`);
			const { envs, mounts, domains } = generate({
				serverIp: admin.serverIp,
				projectName: projectName,
			});

			const compose = await createComposeByTemplate({
				...input,
				composeFile: composeFile,
				env: envs?.join("\n"),
				name: input.id,
				sourceType: "raw",
				appName: `${projectName}-${generatePassword(6)}`,
			});

			if (ctx.user.rol === "user") {
				await addNewService(ctx.user.authId, compose.composeId);
			}

			if (mounts && mounts?.length > 0) {
				for (const mount of mounts) {
					await createMount({
						filePath: mount.filePath,
						mountPath: "",
						content: mount.content,
						serviceId: compose.composeId,
						serviceType: "compose",
						type: "file",
					});
				}
			}

			if (domains && domains?.length > 0) {
				for (const domain of domains) {
					await createDomain({
						...domain,
						domainType: "compose",
						certificateType: "none",
						composeId: compose.composeId,
					});
				}
			}

			return null;
		}),

	templates: protectedProcedure.query(async () => {
		const templatesData = templates.map((t) => ({
			name: t.name,
			description: t.description,
			id: t.id,
			links: t.links,
			tags: t.tags,
			logo: t.logo,
			version: t.version,
		}));

		return templatesData;
	}),

	getTags: protectedProcedure.query(async ({ input }) => {
		const allTags = templates.flatMap((template) => template.tags);
		const uniqueTags = _.uniq(allTags);
		return uniqueTags;
	}),
});
