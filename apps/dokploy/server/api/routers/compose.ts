import { slugify } from "@/lib/slug";
import { db } from "@/server/db";
import {
	apiCreateCompose,
	apiCreateComposeByTemplate,
	apiDeleteCompose,
	apiFetchServices,
	apiFindCompose,
	apiRandomizeCompose,
	apiUpdateCompose,
	compose,
} from "@/server/db/schema";
import { cleanQueuesByCompose, myQueue } from "@/server/queues/queueSetup";
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
import { createTRPCRouter, protectedProcedure } from "../trpc";

import type { DeploymentJob } from "@/server/queues/queue-types";
import { deploy } from "@/server/utils/deploy";
import {
	IS_CLOUD,
	addDomainToCompose,
	addNewService,
	checkServiceAccess,
	cloneCompose,
	cloneComposeRemote,
	createCommand,
	createCompose,
	createComposeByTemplate,
	createDomain,
	createMount,
	findAdminById,
	findComposeById,
	findDomainsByComposeId,
	findProjectById,
	findServerById,
	loadServices,
	randomizeComposeFile,
	removeCompose,
	removeComposeDirectory,
	removeDeploymentsByComposeId,
	startCompose,
	stopCompose,
	updateCompose,
} from "@dokploy/server";

export const composeRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateCompose)
		.mutation(async ({ ctx, input }) => {
			try {
				if (ctx.user.rol === "user") {
					await checkServiceAccess(ctx.user.authId, input.projectId, "create");
				}

				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You need to use a server to create a compose",
					});
				}
				const project = await findProjectById(input.projectId);
				if (project.adminId !== ctx.user.adminId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this project",
					});
				}
				const newService = await createCompose(input);

				if (ctx.user.rol === "user") {
					await addNewService(ctx.user.authId, newService.composeId);
				}

				return newService;
			} catch (error) {
				throw error;
			}
		}),

	one: protectedProcedure
		.input(apiFindCompose)
		.query(async ({ input, ctx }) => {
			if (ctx.user.rol === "user") {
				await checkServiceAccess(ctx.user.authId, input.composeId, "access");
			}

			const compose = await findComposeById(input.composeId);
			if (compose.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this compose",
				});
			}
			return compose;
		}),

	update: protectedProcedure
		.input(apiUpdateCompose)
		.mutation(async ({ input, ctx }) => {
			const compose = await findComposeById(input.composeId);
			if (compose.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to update this compose",
				});
			}
			return updateCompose(input.composeId, input);
		}),
	delete: protectedProcedure
		.input(apiDeleteCompose)
		.mutation(async ({ input, ctx }) => {
			if (ctx.user.rol === "user") {
				await checkServiceAccess(ctx.user.authId, input.composeId, "delete");
			}
			const composeResult = await findComposeById(input.composeId);

			if (composeResult.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to delete this compose",
				});
			}
			4;

			const result = await db
				.delete(compose)
				.where(eq(compose.composeId, input.composeId))
				.returning();

			const cleanupOperations = [
				async () => await removeCompose(composeResult, input.deleteVolumes),
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
		.mutation(async ({ input, ctx }) => {
			const compose = await findComposeById(input.composeId);
			if (compose.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to clean this compose",
				});
			}
			await cleanQueuesByCompose(input.composeId);
		}),

	loadServices: protectedProcedure
		.input(apiFetchServices)
		.query(async ({ input, ctx }) => {
			const compose = await findComposeById(input.composeId);
			if (compose.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to load this compose",
				});
			}
			return await loadServices(input.composeId, input.type);
		}),
	fetchSourceType: protectedProcedure
		.input(apiFindCompose)
		.mutation(async ({ input, ctx }) => {
			try {
				const compose = await findComposeById(input.composeId);

				if (compose.project.adminId !== ctx.user.adminId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to fetch this compose",
					});
				}
				if (compose.serverId) {
					await cloneComposeRemote(compose);
				} else {
					await cloneCompose(compose);
				}
				return compose.sourceType;
			} catch (err) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error fetching source type",
					cause: err,
				});
			}
		}),

	randomizeCompose: protectedProcedure
		.input(apiRandomizeCompose)
		.mutation(async ({ input, ctx }) => {
			const compose = await findComposeById(input.composeId);
			if (compose.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to randomize this compose",
				});
			}
			return await randomizeComposeFile(input.composeId, input.suffix);
		}),
	getConvertedCompose: protectedProcedure
		.input(apiFindCompose)
		.query(async ({ input, ctx }) => {
			const compose = await findComposeById(input.composeId);
			if (compose.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to get this compose",
				});
			}
			const domains = await findDomainsByComposeId(input.composeId);
			const composeFile = await addDomainToCompose(compose, domains);
			return dump(composeFile, {
				lineWidth: 1000,
			});
		}),

	deploy: protectedProcedure
		.input(apiFindCompose)
		.mutation(async ({ input, ctx }) => {
			const compose = await findComposeById(input.composeId);

			if (compose.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to deploy this compose",
				});
			}
			const jobData: DeploymentJob = {
				composeId: input.composeId,
				titleLog: "Manual deployment",
				type: "deploy",
				applicationType: "compose",
				descriptionLog: "",
				server: !!compose.serverId,
			};

			if (IS_CLOUD && compose.serverId) {
				jobData.serverId = compose.serverId;
				await deploy(jobData);
				return true;
			}
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
		.mutation(async ({ input, ctx }) => {
			const compose = await findComposeById(input.composeId);
			if (compose.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to redeploy this compose",
				});
			}
			const jobData: DeploymentJob = {
				composeId: input.composeId,
				titleLog: "Rebuild deployment",
				type: "redeploy",
				applicationType: "compose",
				descriptionLog: "",
				server: !!compose.serverId,
			};
			if (IS_CLOUD && compose.serverId) {
				jobData.serverId = compose.serverId;
				await deploy(jobData);
				return true;
			}
			await myQueue.add(
				"deployments",
				{ ...jobData },
				{
					removeOnComplete: true,
					removeOnFail: true,
				},
			);
		}),
	stop: protectedProcedure
		.input(apiFindCompose)
		.mutation(async ({ input, ctx }) => {
			const compose = await findComposeById(input.composeId);
			if (compose.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to stop this compose",
				});
			}
			await stopCompose(input.composeId);

			return true;
		}),
	start: protectedProcedure
		.input(apiFindCompose)
		.mutation(async ({ input, ctx }) => {
			const compose = await findComposeById(input.composeId);
			if (compose.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to stop this compose",
				});
			}
			await startCompose(input.composeId);

			return true;
		}),
	getDefaultCommand: protectedProcedure
		.input(apiFindCompose)
		.query(async ({ input, ctx }) => {
			const compose = await findComposeById(input.composeId);

			if (compose.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to get this compose",
				});
			}
			const command = createCommand(compose);
			return `docker ${command}`;
		}),
	refreshToken: protectedProcedure
		.input(apiFindCompose)
		.mutation(async ({ input, ctx }) => {
			const compose = await findComposeById(input.composeId);
			if (compose.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to refresh this compose",
				});
			}
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

			if (IS_CLOUD && !input.serverId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You need to use a server to create a compose",
				});
			}

			const composeFile = await readTemplateComposeFile(input.id);

			const generate = await loadTemplateModule(input.id as TemplatesKeys);

			const admin = await findAdminById(ctx.user.adminId);
			let serverIp = admin.serverIp || "127.0.0.1";

			const project = await findProjectById(input.projectId);

			if (input.serverId) {
				const server = await findServerById(input.serverId);
				serverIp = server.ipAddress;
			} else if (process.env.NODE_ENV === "development") {
				serverIp = "127.0.0.1";
			}
			const projectName = slugify(`${project.name} ${input.id}`);
			const { envs, mounts, domains } = generate({
				serverIp: serverIp || "",
				projectName: projectName,
			});

			const compose = await createComposeByTemplate({
				...input,
				composeFile: composeFile,
				env: envs?.join("\n"),
				serverId: input.serverId,
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
