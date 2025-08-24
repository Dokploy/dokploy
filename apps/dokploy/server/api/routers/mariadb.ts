import {
	addNewService,
	checkServiceAccess,
	createMariadb,
	createMount,
	deployMariadb,
	findBackupsByDbId,
	findMariadbById,
	findProjectById,
	IS_CLOUD,
	rebuildDatabase,
	removeMariadbById,
	removeService,
	startService,
	startServiceRemote,
	stopService,
	stopServiceRemote,
	updateMariadbById,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiChangeMariaDBStatus,
	apiCreateMariaDB,
	apiDeployMariaDB,
	apiFindOneMariaDB,
	apiRebuildMariadb,
	apiResetMariadb,
	apiSaveEnvironmentVariablesMariaDB,
	apiSaveExternalPortMariaDB,
	apiUpdateMariaDB,
	mariadb as mariadbTable,
} from "@/server/db/schema";
import { cancelJobs } from "@/server/utils/backup";
export const mariadbRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateMariaDB)
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
						message: "You need to use a server to create a Mariadb",
					});
				}

				const project = await findProjectById(input.projectId);
				if (project.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this project",
					});
				}
				const newMariadb = await createMariadb(input);
				if (ctx.user.role === "member") {
					await addNewService(
						ctx.user.id,
						newMariadb.mariadbId,
						project.organizationId,
					);
				}

				await createMount({
					serviceId: newMariadb.mariadbId,
					serviceType: "mariadb",
					volumeName: `${newMariadb.appName}-data`,
					mountPath: "/var/lib/mysql",
					type: "volume",
				});

				return true;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw error;
			}
		}),
	one: protectedProcedure
		.input(apiFindOneMariaDB)
		.query(async ({ input, ctx }) => {
			if (ctx.user.role === "member") {
				await checkServiceAccess(
					ctx.user.id,
					input.mariadbId,
					ctx.session.activeOrganizationId,
					"access",
				);
			}
			const mariadb = await findMariadbById(input.mariadbId);
			if (mariadb.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this Mariadb",
				});
			}
			return mariadb;
		}),

	start: protectedProcedure
		.input(apiFindOneMariaDB)
		.mutation(async ({ input, ctx }) => {
			const service = await findMariadbById(input.mariadbId);
			if (service.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to start this Mariadb",
				});
			}
			if (service.serverId) {
				await startServiceRemote(service.serverId, service.appName);
			} else {
				await startService(service.appName);
			}
			await updateMariadbById(input.mariadbId, {
				applicationStatus: "done",
			});

			return service;
		}),
	stop: protectedProcedure
		.input(apiFindOneMariaDB)
		.mutation(async ({ input }) => {
			const mariadb = await findMariadbById(input.mariadbId);

			if (mariadb.serverId) {
				await stopServiceRemote(mariadb.serverId, mariadb.appName);
			} else {
				await stopService(mariadb.appName);
			}
			await updateMariadbById(input.mariadbId, {
				applicationStatus: "idle",
			});

			return mariadb;
		}),
	saveExternalPort: protectedProcedure
		.input(apiSaveExternalPortMariaDB)
		.mutation(async ({ input, ctx }) => {
			const mongo = await findMariadbById(input.mariadbId);
			if (mongo.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this external port",
				});
			}
			await updateMariadbById(input.mariadbId, {
				externalPort: input.externalPort,
			});
			await deployMariadb(input.mariadbId);
			return mongo;
		}),
	deploy: protectedProcedure
		.input(apiDeployMariaDB)
		.mutation(async ({ input, ctx }) => {
			const mariadb = await findMariadbById(input.mariadbId);
			if (mariadb.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to deploy this Mariadb",
				});
			}

			return deployMariadb(input.mariadbId);
		}),
	deployWithLogs: protectedProcedure
		.meta({
			openapi: {
				path: "/deploy/mariadb-with-logs",
				method: "POST",
				override: true,
				enabled: false,
			},
		})
		.input(apiDeployMariaDB)
		.subscription(async ({ input, ctx }) => {
			const mariadb = await findMariadbById(input.mariadbId);
			if (mariadb.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to deploy this Mariadb",
				});
			}

			return observable<string>((emit) => {
				deployMariadb(input.mariadbId, (log) => {
					emit.next(log);
				});
			});
		}),
	changeStatus: protectedProcedure
		.input(apiChangeMariaDBStatus)
		.mutation(async ({ input, ctx }) => {
			const mongo = await findMariadbById(input.mariadbId);
			if (mongo.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to change this Mariadb status",
				});
			}
			await updateMariadbById(input.mariadbId, {
				applicationStatus: input.applicationStatus,
			});
			return mongo;
		}),
	remove: protectedProcedure
		.input(apiFindOneMariaDB)
		.mutation(async ({ input, ctx }) => {
			if (ctx.user.role === "member") {
				await checkServiceAccess(
					ctx.user.id,
					input.mariadbId,
					ctx.session.activeOrganizationId,
					"delete",
				);
			}

			const mongo = await findMariadbById(input.mariadbId);
			if (mongo.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to delete this Mariadb",
				});
			}

			const backups = await findBackupsByDbId(input.mariadbId, "mariadb");
			const cleanupOperations = [
				async () => await removeService(mongo?.appName, mongo.serverId),
				async () => await cancelJobs(backups),
				async () => await removeMariadbById(input.mariadbId),
			];

			for (const operation of cleanupOperations) {
				try {
					await operation();
				} catch (_) {}
			}

			return mongo;
		}),
	saveEnvironment: protectedProcedure
		.input(apiSaveEnvironmentVariablesMariaDB)
		.mutation(async ({ input, ctx }) => {
			const mariadb = await findMariadbById(input.mariadbId);
			if (mariadb.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this environment",
				});
			}
			const service = await updateMariadbById(input.mariadbId, {
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
		.input(apiResetMariadb)
		.mutation(async ({ input, ctx }) => {
			const mariadb = await findMariadbById(input.mariadbId);
			if (mariadb.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to reload this Mariadb",
				});
			}
			if (mariadb.serverId) {
				await stopServiceRemote(mariadb.serverId, mariadb.appName);
			} else {
				await stopService(mariadb.appName);
			}
			await updateMariadbById(input.mariadbId, {
				applicationStatus: "idle",
			});

			if (mariadb.serverId) {
				await startServiceRemote(mariadb.serverId, mariadb.appName);
			} else {
				await startService(mariadb.appName);
			}
			await updateMariadbById(input.mariadbId, {
				applicationStatus: "done",
			});
			return true;
		}),
	update: protectedProcedure
		.input(apiUpdateMariaDB)
		.mutation(async ({ input, ctx }) => {
			const { mariadbId, ...rest } = input;
			const mariadb = await findMariadbById(mariadbId);
			if (mariadb.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to update this Mariadb",
				});
			}
			const service = await updateMariadbById(mariadbId, {
				...rest,
			});

			if (!service) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Update: Error updating Mariadb",
				});
			}

			return true;
		}),
	move: protectedProcedure
		.input(
			z.object({
				mariadbId: z.string(),
				targetProjectId: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const mariadb = await findMariadbById(input.mariadbId);
			if (mariadb.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to move this mariadb",
				});
			}

			const targetProject = await findProjectById(input.targetProjectId);
			if (targetProject.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to move to this project",
				});
			}

			// Update the mariadb's projectId
			const updatedMariadb = await db
				.update(mariadbTable)
				.set({
					projectId: input.targetProjectId,
				})
				.where(eq(mariadbTable.mariadbId, input.mariadbId))
				.returning()
				.then((res) => res[0]);

			if (!updatedMariadb) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to move mariadb",
				});
			}

			return updatedMariadb;
		}),
	rebuild: protectedProcedure
		.input(apiRebuildMariadb)
		.mutation(async ({ input, ctx }) => {
			const mariadb = await findMariadbById(input.mariadbId);
			if (mariadb.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to rebuild this MariaDB database",
				});
			}

			await rebuildDatabase(mariadb.mariadbId, "mariadb");
			return true;
		}),
});
