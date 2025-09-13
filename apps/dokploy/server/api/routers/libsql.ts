import {
	addNewService,
	checkServiceAccess,
	createLibsql,
	createMount,
	deployLibsql,
	findEnvironmentById,
	findLibsqlById,
	findProjectById,
	IS_CLOUD,
	rebuildDatabase,
	removeLibsqlById,
	removeService,
	startService,
	startServiceRemote,
	stopService,
	stopServiceRemote,
	updateLibsqlById,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiChangeLibsqlStatus,
	apiCreateLibsql,
	apiDeployLibsql,
	apiFindOneLibsql,
	apiRebuildLibsql,
	apiResetLibsql,
	apiSaveEnvironmentVariablesLibsql,
	apiSaveExternalPortsLibsql,
	apiUpdateLibsql,
	libsql as libsqlTable,
} from "@/server/db/schema";
export const libsqlRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateLibsql)
		.mutation(async ({ input, ctx }) => {
			try {
				// Get project from environment
				const environment = await findEnvironmentById(input.environmentId);
				const project = await findProjectById(environment.projectId);

				if (ctx.user.role === "member") {
					await checkServiceAccess(
						ctx.user.id,
						project.projectId,
						ctx.session.activeOrganizationId,
						"create",
					);
				}

				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You need to use a server to create a Libsql",
					});
				}

				if (project.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this project",
					});
				}
				const newLibsql = await createLibsql({
					...input,
				});
				if (ctx.user.role === "member") {
					await addNewService(
						ctx.user.id,
						newLibsql.libsqlId,
						project.organizationId,
					);
				}

				await createMount({
					serviceId: newLibsql.libsqlId,
					serviceType: "libsql",
					volumeName: `${newLibsql.appName}-data`,
					mountPath: "/var/lib/sqld",
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
		.input(apiFindOneLibsql)
		.query(async ({ input, ctx }) => {
			if (ctx.user.role === "member") {
				await checkServiceAccess(
					ctx.user.id,
					input.libsqlId,
					ctx.session.activeOrganizationId,
					"access",
				);
			}
			const libsql = await findLibsqlById(input.libsqlId);
			if (
				libsql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this Libsql",
				});
			}
			return libsql;
		}),

	start: protectedProcedure
		.input(apiFindOneLibsql)
		.mutation(async ({ input, ctx }) => {
			const service = await findLibsqlById(input.libsqlId);
			if (
				service.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to start this Libsql",
				});
			}
			if (service.serverId) {
				await startServiceRemote(service.serverId, service.appName);
			} else {
				await startService(service.appName);
			}
			await updateLibsqlById(input.libsqlId, {
				applicationStatus: "done",
			});

			return service;
		}),
	stop: protectedProcedure
		.input(apiFindOneLibsql)
		.mutation(async ({ input }) => {
			const libsql = await findLibsqlById(input.libsqlId);

			if (libsql.serverId) {
				await stopServiceRemote(libsql.serverId, libsql.appName);
			} else {
				await stopService(libsql.appName);
			}
			await updateLibsqlById(input.libsqlId, {
				applicationStatus: "idle",
			});

			return libsql;
		}),
	saveExternalPorts: protectedProcedure
		.input(apiSaveExternalPortsLibsql)
		.mutation(async ({ input, ctx }) => {
			const libsql = await findLibsqlById(input.libsqlId);
			if (
				libsql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this external port",
				});
			}
			if (libsql.sqldNode === "replica" && input.externalGRPCPort !== null) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "externalGRPCPort cannot be set when sqldNode is 'replica'",
				});
			}
			await updateLibsqlById(input.libsqlId, {
				externalPort: input.externalPort,
				externalGRPCPort: input.externalGRPCPort,
			});
			await deployLibsql(input.libsqlId);
			return libsql;
		}),
	deploy: protectedProcedure
		.input(apiDeployLibsql)
		.mutation(async ({ input, ctx }) => {
			const libsql = await findLibsqlById(input.libsqlId);
			if (
				libsql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to deploy this Libsql",
				});
			}

			return deployLibsql(input.libsqlId);
		}),
	deployWithLogs: protectedProcedure
		.meta({
			openapi: {
				path: "/deploy/libsql-with-logs",
				method: "POST",
				override: true,
				enabled: false,
			},
		})
		.input(apiDeployLibsql)
		.subscription(async ({ input, ctx }) => {
			const libsql = await findLibsqlById(input.libsqlId);
			if (
				libsql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to deploy this Libsql",
				});
			}

			return observable<string>((emit) => {
				deployLibsql(input.libsqlId, (log) => {
					emit.next(log);
				});
			});
		}),
	changeStatus: protectedProcedure
		.input(apiChangeLibsqlStatus)
		.mutation(async ({ input, ctx }) => {
			const libsql = await findLibsqlById(input.libsqlId);
			if (
				libsql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to change this Libsql status",
				});
			}
			await updateLibsqlById(input.libsqlId, {
				applicationStatus: input.applicationStatus,
			});
			return libsql;
		}),
	remove: protectedProcedure
		.input(apiFindOneLibsql)
		.mutation(async ({ input, ctx }) => {
			if (ctx.user.role === "member") {
				await checkServiceAccess(
					ctx.user.id,
					input.libsqlId,
					ctx.session.activeOrganizationId,
					"delete",
				);
			}

			const libsql = await findLibsqlById(input.libsqlId);
			if (
				libsql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to delete this Libsql",
				});
			}

			const cleanupOperations = [
				async () => await removeService(libsql?.appName, libsql.serverId),
				async () => await removeLibsqlById(input.libsqlId),
			];

			for (const operation of cleanupOperations) {
				try {
					await operation();
				} catch (_) {}
			}

			return libsql;
		}),
	saveEnvironment: protectedProcedure
		.input(apiSaveEnvironmentVariablesLibsql)
		.mutation(async ({ input, ctx }) => {
			const libsql = await findLibsqlById(input.libsqlId);
			if (
				libsql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this environment",
				});
			}
			const service = await updateLibsqlById(input.libsqlId, {
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
		.input(apiResetLibsql)
		.mutation(async ({ input, ctx }) => {
			const libsql = await findLibsqlById(input.libsqlId);
			if (
				libsql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to reload this Libsql",
				});
			}
			if (libsql.serverId) {
				await stopServiceRemote(libsql.serverId, libsql.appName);
			} else {
				await stopService(libsql.appName);
			}
			await updateLibsqlById(input.libsqlId, {
				applicationStatus: "idle",
			});

			if (libsql.serverId) {
				await startServiceRemote(libsql.serverId, libsql.appName);
			} else {
				await startService(libsql.appName);
			}
			await updateLibsqlById(input.libsqlId, {
				applicationStatus: "done",
			});
			return true;
		}),
	update: protectedProcedure
		.input(apiUpdateLibsql)
		.mutation(async ({ input, ctx }) => {
			const { libsqlId, ...rest } = input;
			const libsql = await findLibsqlById(libsqlId);
			if (
				libsql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to update this Libsql",
				});
			}
			const service = await updateLibsqlById(libsqlId, {
				...rest,
			});

			if (!service) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Update: Error updating Libsql",
				});
			}

			return true;
		}),
	move: protectedProcedure
		.input(
			z.object({
				libsqlId: z.string(),
				targetEnvironmentId: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const libsql = await findLibsqlById(input.libsqlId);
			if (
				libsql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to move this libsql",
				});
			}

			const targetEnvironment = await findEnvironmentById(
				input.targetEnvironmentId,
			);
			if (
				targetEnvironment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to move to this environment",
				});
			}

			// Update the libsql's projectId
			const updatedLibsql = await db
				.update(libsqlTable)
				.set({
					environmentId: input.targetEnvironmentId,
				})
				.where(eq(libsqlTable.libsqlId, input.libsqlId))
				.returning()
				.then((res) => res[0]);

			if (!updatedLibsql) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to move libsql",
				});
			}

			return updatedLibsql;
		}),
	rebuild: protectedProcedure
		.input(apiRebuildLibsql)
		.mutation(async ({ input, ctx }) => {
			const libsql = await findLibsqlById(input.libsqlId);
			if (
				libsql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to rebuild this MariaDB database",
				});
			}

			await rebuildDatabase(libsql.libsqlId, "libsql");
			return true;
		}),
});
