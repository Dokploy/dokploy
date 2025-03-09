import { slugify } from "@/lib/slug";
import { db } from "@/server/db";
import {
	apiCreateCompose,
	apiDeleteCompose,
	apiFetchServices,
	apiFindCompose,
	apiRandomizeCompose,
	apiUpdateCompose,
	compose as composeTable,
} from "@/server/db/schema";
import { cleanQueuesByCompose, myQueue } from "@/server/queues/queueSetup";
import { generatePassword } from "@/templates/utils";
import {
	fetchTemplateFiles,
	fetchTemplatesList,
} from "@dokploy/server/templates/utils/github";
import { processTemplate } from "@dokploy/server/templates/utils/processors";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { dump } from "js-yaml";
import _ from "lodash";
import { nanoid } from "nanoid";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { z } from "zod";
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
	findComposeById,
	findDomainsByComposeId,
	findProjectById,
	findServerById,
	findUserById,
	loadServices,
	randomizeComposeFile,
	randomizeIsolatedDeploymentComposeFile,
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
				if (ctx.user.rol === "member") {
					await checkServiceAccess(
						ctx.user.id,
						input.projectId,
						ctx.session.activeOrganizationId,
						"create",
					);
				}

				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You need to use a server to create a compose",
					});
				}
				const project = await findProjectById(input.projectId);
				if (project.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this project",
					});
				}
				const newService = await createCompose(input);

				if (ctx.user.rol === "member") {
					await addNewService(
						ctx.user.id,
						newService.composeId,
						project.organizationId,
					);
				}

				return newService;
			} catch (error) {
				throw error;
			}
		}),

	one: protectedProcedure
		.input(apiFindCompose)
		.query(async ({ input, ctx }) => {
			if (ctx.user.rol === "member") {
				await checkServiceAccess(
					ctx.user.id,
					input.composeId,
					ctx.session.activeOrganizationId,
					"access",
				);
			}

			const compose = await findComposeById(input.composeId);
			if (compose.project.organizationId !== ctx.session.activeOrganizationId) {
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
			if (compose.project.organizationId !== ctx.session.activeOrganizationId) {
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
			if (ctx.user.rol === "member") {
				await checkServiceAccess(
					ctx.user.id,
					input.composeId,
					ctx.session.activeOrganizationId,
					"delete",
				);
			}
			const composeResult = await findComposeById(input.composeId);

			if (
				composeResult.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to delete this compose",
				});
			}
			4;

			const result = await db
				.delete(composeTable)
				.where(eq(composeTable.composeId, input.composeId))
				.returning();

			const cleanupOperations = [
				async () => await removeCompose(composeResult, input.deleteVolumes),
				async () => await removeDeploymentsByComposeId(composeResult),
				async () => await removeComposeDirectory(composeResult.appName),
			];

			for (const operation of cleanupOperations) {
				try {
					await operation();
				} catch (_) {}
			}

			return result[0];
		}),
	cleanQueues: protectedProcedure
		.input(apiFindCompose)
		.mutation(async ({ input, ctx }) => {
			const compose = await findComposeById(input.composeId);
			if (compose.project.organizationId !== ctx.session.activeOrganizationId) {
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
			if (compose.project.organizationId !== ctx.session.activeOrganizationId) {
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

				if (
					compose.project.organizationId !== ctx.session.activeOrganizationId
				) {
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
			if (compose.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to randomize this compose",
				});
			}
			return await randomizeComposeFile(input.composeId, input.suffix);
		}),
	isolatedDeployment: protectedProcedure
		.input(apiRandomizeCompose)
		.mutation(async ({ input, ctx }) => {
			const compose = await findComposeById(input.composeId);
			if (compose.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to randomize this compose",
				});
			}
			return await randomizeIsolatedDeploymentComposeFile(
				input.composeId,
				input.suffix,
			);
		}),
	getConvertedCompose: protectedProcedure
		.input(apiFindCompose)
		.query(async ({ input, ctx }) => {
			const compose = await findComposeById(input.composeId);
			if (compose.project.organizationId !== ctx.session.activeOrganizationId) {
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

			if (compose.project.organizationId !== ctx.session.activeOrganizationId) {
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
			if (compose.project.organizationId !== ctx.session.activeOrganizationId) {
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
			if (compose.project.organizationId !== ctx.session.activeOrganizationId) {
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
			if (compose.project.organizationId !== ctx.session.activeOrganizationId) {
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

			if (compose.project.organizationId !== ctx.session.activeOrganizationId) {
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
			if (compose.project.organizationId !== ctx.session.activeOrganizationId) {
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
		.input(
			z.object({
				projectId: z.string(),
				serverId: z.string().optional(),
				id: z.string(),
				baseUrl: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (ctx.user.rol === "member") {
				await checkServiceAccess(
					ctx.user.id,
					input.projectId,
					ctx.session.activeOrganizationId,
					"create",
				);
			}

			if (IS_CLOUD && !input.serverId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You need to use a server to create a compose",
				});
			}

			const template = await fetchTemplateFiles(input.id, input.baseUrl);

			const admin = await findUserById(ctx.user.ownerId);
			let serverIp = admin.serverIp || "127.0.0.1";

			const project = await findProjectById(input.projectId);

			if (input.serverId) {
				const server = await findServerById(input.serverId);
				serverIp = server.ipAddress;
			} else if (process.env.NODE_ENV === "development") {
				serverIp = "127.0.0.1";
			}

			const generate = processTemplate(template.config, {
				serverIp: serverIp,
				projectName: project.name,
			});

			const projectName = slugify(`${project.name} ${input.id}`);

			const compose = await createComposeByTemplate({
				...input,
				composeFile: template.dockerCompose,
				env: generate.envs?.join("\n"),
				serverId: input.serverId,
				name: input.id,
				sourceType: "raw",
				appName: `${projectName}-${generatePassword(6)}`,
				isolatedDeployment: true,
			});

			if (ctx.user.rol === "member") {
				await addNewService(
					ctx.user.id,
					compose.composeId,
					ctx.session.activeOrganizationId,
				);
			}

			if (generate.mounts && generate.mounts?.length > 0) {
				for (const mount of generate.mounts) {
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

			if (generate.domains && generate.domains?.length > 0) {
				for (const domain of generate.domains) {
					await createDomain({
						...domain,
						domainType: "compose",
						certificateType: "none",
						composeId: compose.composeId,
						host: domain.host || "",
					});
				}
			}

			return null;
		}),

	templates: publicProcedure
		.input(z.object({ baseUrl: z.string().optional() }))
		.query(async ({ input }) => {
			try {
				const githubTemplates = await fetchTemplatesList(input.baseUrl);

				if (githubTemplates.length > 0) {
					return githubTemplates;
				}
			} catch (error) {
				console.warn(
					"Failed to fetch templates from GitHub, falling back to local templates:",
					error,
				);
			}
			return [];
		}),

	getTags: protectedProcedure
		.input(z.object({ baseUrl: z.string().optional() }))
		.query(async ({ input }) => {
			const githubTemplates = await fetchTemplatesList(input.baseUrl);

			const allTags = githubTemplates.flatMap((template) => template.tags);
			const uniqueTags = _.uniq(allTags);
			return uniqueTags;
		}),

	move: protectedProcedure
		.input(
			z.object({
				composeId: z.string(),
				targetProjectId: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const compose = await findComposeById(input.composeId);
			if (compose.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to move this compose",
				});
			}

			const targetProject = await findProjectById(input.targetProjectId);
			if (targetProject.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to move to this project",
				});
			}

			// Update the compose's projectId
			const updatedCompose = await db
				.update(composeTable)
				.set({
					projectId: input.targetProjectId,
				})
				.where(eq(composeTable.composeId, input.composeId))
				.returning()
				.then((res) => res[0]);

			if (!updatedCompose) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to move compose",
				});
			}

			return updatedCompose;
		}),
});
