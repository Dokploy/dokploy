import {
	addNewService,
	checkServiceAccess,
	createMount,
	createPostgres,
	deployPostgres,
	findBackupsByDbId,
	findPostgresById,
	findProjectById,
	IS_CLOUD,
	rebuildDatabase,
	removePostgresById,
	removeService,
	startService,
	startServiceRemote,
	stopService,
	stopServiceRemote,
	updatePostgresById,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiChangePostgresStatus,
	apiCreatePostgres,
	apiDeployPostgres,
	apiFindOnePostgres,
	apiRebuildPostgres,
	apiResetPostgres,
	apiSaveEnvironmentVariablesPostgres,
	apiSaveExternalPortPostgres,
	apiUpdatePostgres,
	postgres as postgresTable,
} from "@/server/db/schema";
import { cancelJobs } from "@/server/utils/backup";
export const postgresRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreatePostgres)
		.mutation(async ({ input, ctx }) => {
			try {
				if (ctx.user.role === "member") {
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
						message: "You need to use a server to create a Postgres",
					});
				}

				const project = await findProjectById(input.projectId);
				if (project.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this project",
					});
				}
				const newPostgres = await createPostgres(input);
				if (ctx.user.role === "member") {
					await addNewService(
						ctx.user.id,
						newPostgres.postgresId,
						project.organizationId,
					);
				}

				await createMount({
					serviceId: newPostgres.postgresId,
					serviceType: "postgres",
					volumeName: `${newPostgres.appName}-data`,
					mountPath: "/var/lib/postgresql/data",
					type: "volume",
				});

				return true;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error input: Inserting Postgres database",
					cause: error,
				});
			}
		}),
	one: protectedProcedure
		.input(apiFindOnePostgres)
		.query(async ({ input, ctx }) => {
			if (ctx.user.role === "member") {
				await checkServiceAccess(
					ctx.user.id,
					input.postgresId,
					ctx.session.activeOrganizationId,
					"access",
				);
			}

			const postgres = await findPostgresById(input.postgresId);
			if (
				postgres.project.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this Postgres",
				});
			}
			return postgres;
		}),

	start: protectedProcedure
		.input(apiFindOnePostgres)
		.mutation(async ({ input, ctx }) => {
			const service = await findPostgresById(input.postgresId);

			if (service.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to start this Postgres",
				});
			}

			if (service.serverId) {
				await startServiceRemote(service.serverId, service.appName);
			} else {
				await startService(service.appName);
			}
			await updatePostgresById(input.postgresId, {
				applicationStatus: "done",
			});

			return service;
		}),
	stop: protectedProcedure
		.input(apiFindOnePostgres)
		.mutation(async ({ input, ctx }) => {
			const postgres = await findPostgresById(input.postgresId);
			if (
				postgres.project.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to stop this Postgres",
				});
			}
			if (postgres.serverId) {
				await stopServiceRemote(postgres.serverId, postgres.appName);
			} else {
				await stopService(postgres.appName);
			}
			await updatePostgresById(input.postgresId, {
				applicationStatus: "idle",
			});

			return postgres;
		}),
	saveExternalPort: protectedProcedure
		.input(apiSaveExternalPortPostgres)
		.mutation(async ({ input, ctx }) => {
			const postgres = await findPostgresById(input.postgresId);

			if (
				postgres.project.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this external port",
				});
			}
			await updatePostgresById(input.postgresId, {
				externalPort: input.externalPort,
			});
			await deployPostgres(input.postgresId);
			return postgres;
		}),
	deploy: protectedProcedure
		.input(apiDeployPostgres)
		.mutation(async ({ input, ctx }) => {
			const postgres = await findPostgresById(input.postgresId);
			if (
				postgres.project.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to deploy this Postgres",
				});
			}
			return deployPostgres(input.postgresId);
		}),

	deployWithLogs: protectedProcedure
		.meta({
			openapi: {
				path: "/deploy/postgres-with-logs",
				method: "POST",
				override: true,
				enabled: false,
			},
		})
		.input(apiDeployPostgres)
		.subscription(async ({ input, ctx }) => {
			const postgres = await findPostgresById(input.postgresId);
			if (
				postgres.project.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to deploy this Postgres",
				});
			}
			return observable<string>((emit) => {
				deployPostgres(input.postgresId, (log) => {
					emit.next(log);
				});
			});
		}),

	changeStatus: protectedProcedure
		.input(apiChangePostgresStatus)
		.mutation(async ({ input, ctx }) => {
			const postgres = await findPostgresById(input.postgresId);
			if (
				postgres.project.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to change this Postgres status",
				});
			}
			await updatePostgresById(input.postgresId, {
				applicationStatus: input.applicationStatus,
			});
			return postgres;
		}),
	remove: protectedProcedure
		.input(apiFindOnePostgres)
		.mutation(async ({ input, ctx }) => {
			if (ctx.user.role === "member") {
				await checkServiceAccess(
					ctx.user.id,
					input.postgresId,
					ctx.session.activeOrganizationId,
					"delete",
				);
			}
			const postgres = await findPostgresById(input.postgresId);

			if (
				postgres.project.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to delete this Postgres",
				});
			}

			const backups = await findBackupsByDbId(input.postgresId, "postgres");

			const cleanupOperations = [
				removeService(postgres.appName, postgres.serverId),
				cancelJobs(backups),
				removePostgresById(input.postgresId),
			];

			await Promise.allSettled(cleanupOperations);

			return postgres;
		}),
	saveEnvironment: protectedProcedure
		.input(apiSaveEnvironmentVariablesPostgres)
		.mutation(async ({ input, ctx }) => {
			const postgres = await findPostgresById(input.postgresId);
			if (
				postgres.project.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this environment",
				});
			}
			const service = await updatePostgresById(input.postgresId, {
				env: input.env,
			});

			if (!service) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error adding environment variables",
				});
			}

			return true;
		}),
	reload: protectedProcedure
		.input(apiResetPostgres)
		.mutation(async ({ input, ctx }) => {
			const postgres = await findPostgresById(input.postgresId);
			if (
				postgres.project.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to reload this Postgres",
				});
			}
			if (postgres.serverId) {
				await stopServiceRemote(postgres.serverId, postgres.appName);
			} else {
				await stopService(postgres.appName);
			}
			await updatePostgresById(input.postgresId, {
				applicationStatus: "idle",
			});

			if (postgres.serverId) {
				await startServiceRemote(postgres.serverId, postgres.appName);
			} else {
				await startService(postgres.appName);
			}
			await updatePostgresById(input.postgresId, {
				applicationStatus: "done",
			});
			return true;
		}),
	update: protectedProcedure
		.input(apiUpdatePostgres)
		.mutation(async ({ input, ctx }) => {
			const { postgresId, ...rest } = input;
			const postgres = await findPostgresById(postgresId);
			if (
				postgres.project.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to update this Postgres",
				});
			}
			const service = await updatePostgresById(postgresId, {
				...rest,
			});

			if (!service) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating Postgres",
				});
			}

			return true;
		}),
	move: protectedProcedure
		.input(
			z.object({
				postgresId: z.string(),
				targetProjectId: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const postgres = await findPostgresById(input.postgresId);
			if (
				postgres.project.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to move this postgres",
				});
			}

			const targetProject = await findProjectById(input.targetProjectId);
			if (targetProject.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to move to this project",
				});
			}

			// Update the postgres's projectId
			const updatedPostgres = await db
				.update(postgresTable)
				.set({
					projectId: input.targetProjectId,
				})
				.where(eq(postgresTable.postgresId, input.postgresId))
				.returning()
				.then((res) => res[0]);

			if (!updatedPostgres) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to move postgres",
				});
			}

			return updatedPostgres;
		}),
	rebuild: protectedProcedure
		.input(apiRebuildPostgres)
		.mutation(async ({ input, ctx }) => {
			const postgres = await findPostgresById(input.postgresId);
			if (
				postgres.project.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to rebuild this Postgres database",
				});
			}

			await rebuildDatabase(postgres.postgresId, "postgres");

			return true;
		}),
});
