import {
	checkPortInUse,
	createLibsql,
	createMount,
	deployLibsql,
	findEnvironmentById,
	findLibsqlById,
	findProjectById,
	getAccessibleServerIds,
	getContainerLogs,
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
import {
	addNewService,
	checkServiceAccess,
	checkServicePermissionAndAccess,
} from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
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
		.meta({
			openapi: {
				summary: "Create a LibSQL database",
				description: "Creates a new LibSQL database service with the specified configuration, sets up a persistent data volume, and registers it in the project.",
			},
		})
		.input(apiCreateLibsql)
		.mutation(async ({ input, ctx }) => {
			try {
				const environment = await findEnvironmentById(input.environmentId);
				const project = await findProjectById(environment.projectId);

				await checkServiceAccess(ctx, project.projectId, "create");

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

				if (input.serverId) {
					const accessibleIds = await getAccessibleServerIds(ctx.session);
					if (!accessibleIds.has(input.serverId)) {
						throw new TRPCError({
							code: "UNAUTHORIZED",
							message: "You are not authorized to access this server",
						});
					}
				}

				const newLibsql = await createLibsql({
					...input,
				});
				await addNewService(ctx, newLibsql.libsqlId);

				await createMount({
					serviceId: newLibsql.libsqlId,
					serviceType: "libsql",
					volumeName: `${newLibsql.appName}-data`,
					mountPath: "/var/lib/sqld",
					type: "volume",
				});

				await audit(ctx, {
					action: "create",
					resourceType: "service",
					resourceId: newLibsql.libsqlId,
					resourceName: newLibsql.appName,
				});
				return true;
			} catch (error) {
				throw error;
			}
		}),
	one: protectedProcedure
		.meta({
			openapi: {
				summary: "Get a LibSQL database by ID",
				description: "Returns the full details of a LibSQL database service, including its environment and project configuration.",
			},
		})
		.input(apiFindOneLibsql)
		.query(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.libsqlId, "read");

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
		.meta({
			openapi: {
				summary: "Start a LibSQL database",
				description: "Starts the Docker container for the specified LibSQL database and sets its status to done.",
			},
		})
		.input(apiFindOneLibsql)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.libsqlId, {
				deployment: ["create"],
			});
			const libsql = await findLibsqlById(input.libsqlId);

			if (libsql.serverId) {
				await startServiceRemote(libsql.serverId, libsql.appName);
			} else {
				await startService(libsql.appName);
			}
			await updateLibsqlById(input.libsqlId, {
				applicationStatus: "done",
			});

			await audit(ctx, {
				action: "start",
				resourceType: "service",
				resourceId: libsql.libsqlId,
				resourceName: libsql.appName,
			});
			return libsql;
		}),
	stop: protectedProcedure
		.meta({
			openapi: {
				summary: "Stop a LibSQL database",
				description: "Stops the Docker container for the specified LibSQL database and sets its status to idle.",
			},
		})
		.input(apiFindOneLibsql)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.libsqlId, {
				deployment: ["create"],
			});
			const libsql = await findLibsqlById(input.libsqlId);

			if (libsql.serverId) {
				await stopServiceRemote(libsql.serverId, libsql.appName);
			} else {
				await stopService(libsql.appName);
			}
			await updateLibsqlById(input.libsqlId, {
				applicationStatus: "idle",
			});

			await audit(ctx, {
				action: "stop",
				resourceType: "service",
				resourceId: libsql.libsqlId,
				resourceName: libsql.appName,
			});
			return libsql;
		}),
	saveExternalPorts: protectedProcedure
		.meta({
			openapi: {
				summary: "Save the external ports for a LibSQL database",
				description: "Updates the external port mappings (HTTP, gRPC, admin) for the LibSQL database and triggers a redeployment. Validates that ports are not already in use.",
			},
		})
		.input(apiSaveExternalPortsLibsql)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.libsqlId, {
				service: ["create"],
			});
			const libsql = await findLibsqlById(input.libsqlId);

			if (libsql.sqldNode === "replica" && input.externalGRPCPort !== null) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "externalGRPCPort cannot be set when sqldNode is 'replica'",
				});
			}

			const portsToCheck = [
				{
					port: input.externalPort,
					name: "externalPort",
					current: libsql.externalPort,
				},
				{
					port: input.externalGRPCPort,
					name: "externalGRPCPort",
					current: libsql.externalGRPCPort,
				},
				{
					port: input.externalAdminPort,
					name: "externalAdminPort",
					current: libsql.externalAdminPort,
				},
			];

			for (const { port, name, current } of portsToCheck) {
				if (port && port !== current) {
					const portCheck = await checkPortInUse(
						port,
						libsql.serverId || undefined,
					);
					if (portCheck.isInUse) {
						throw new TRPCError({
							code: "CONFLICT",
							message: `Port ${port} (${name}) is already in use by ${portCheck.conflictingContainer}`,
						});
					}
				}
			}

			await updateLibsqlById(input.libsqlId, {
				externalPort: input.externalPort,
				externalGRPCPort: input.externalGRPCPort,
				externalAdminPort: input.externalAdminPort,
			});
			await deployLibsql(input.libsqlId);
			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: libsql.libsqlId,
				resourceName: libsql.appName,
			});
			return libsql;
		}),
	deploy: protectedProcedure
		.meta({
			openapi: {
				summary: "Deploy a LibSQL database",
				description: "Triggers a deployment for the specified LibSQL database, rebuilding and restarting its Docker container with the current configuration.",
			},
		})
		.input(apiDeployLibsql)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.libsqlId, {
				deployment: ["create"],
			});
			const libsql = await findLibsqlById(input.libsqlId);
			await audit(ctx, {
				action: "deploy",
				resourceType: "service",
				resourceId: libsql.libsqlId,
				resourceName: libsql.appName,
			});
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
		.subscription(async function* ({ input, ctx, signal }) {
			await checkServicePermissionAndAccess(ctx, input.libsqlId, {
				deployment: ["create"],
			});
			const queue: string[] = [];
			let done = false;

			deployLibsql(input.libsqlId, (log) => {
				queue.push(log);
			})
				.catch(() => {})
				.finally(() => {
					done = true;
				});

			while (!done || queue.length > 0) {
				if (queue.length > 0) {
					yield queue.shift()!;
				} else {
					await new Promise((r) => setTimeout(r, 50));
				}

				if (signal?.aborted) {
					return;
				}
			}
		}),
	changeStatus: protectedProcedure
		.meta({
			openapi: {
				summary: "Change LibSQL database status",
				description: "Updates the application status of a LibSQL database without starting or stopping the container.",
			},
		})
		.input(apiChangeLibsqlStatus)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.libsqlId, {
				deployment: ["create"],
			});
			const libsql = await findLibsqlById(input.libsqlId);
			await updateLibsqlById(input.libsqlId, {
				applicationStatus: input.applicationStatus,
			});
			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: libsql.libsqlId,
				resourceName: libsql.appName,
			});
			return libsql;
		}),
	remove: protectedProcedure
		.meta({
			openapi: {
				summary: "Delete a LibSQL database",
				description: "Removes the LibSQL database service, its Docker container, and deletes the database record.",
			},
		})
		.input(apiFindOneLibsql)
		.mutation(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.libsqlId, "delete");

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
			await audit(ctx, {
				action: "delete",
				resourceType: "service",
				resourceId: libsql.libsqlId,
				resourceName: libsql.appName,
			});
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
		.meta({
			openapi: {
				summary: "Save environment variables for a LibSQL database",
				description: "Updates the environment variables for the specified LibSQL database service.",
			},
		})
		.input(apiSaveEnvironmentVariablesLibsql)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.libsqlId, {
				envVars: ["write"],
			});
			const service = await updateLibsqlById(input.libsqlId, {
				env: input.env,
			});

			if (!service) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error adding environment variables",
				});
			}

			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: input.libsqlId,
			});
			return true;
		}),
	reload: protectedProcedure
		.meta({
			openapi: {
				summary: "Reload a LibSQL database",
				description: "Restarts the LibSQL database by stopping and then starting its Docker container.",
			},
		})
		.input(apiResetLibsql)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.libsqlId, {
				deployment: ["create"],
			});
			const libsql = await findLibsqlById(input.libsqlId);
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
			await audit(ctx, {
				action: "reload",
				resourceType: "service",
				resourceId: libsql.libsqlId,
				resourceName: libsql.appName,
			});
			return true;
		}),
	update: protectedProcedure
		.meta({
			openapi: {
				summary: "Update a LibSQL database",
				description: "Updates the configuration of an existing LibSQL database service.",
			},
		})
		.input(apiUpdateLibsql)
		.mutation(async ({ input, ctx }) => {
			const { libsqlId, ...rest } = input;
			await checkServicePermissionAndAccess(ctx, libsqlId, {
				service: ["create"],
			});
			const libsql = await updateLibsqlById(libsqlId, {
				...rest,
			});

			if (!libsql) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating Libsql",
				});
			}

			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: libsqlId,
				resourceName: libsql.appName,
			});
			return true;
		}),
	move: protectedProcedure
		.meta({
			openapi: {
				summary: "Move a LibSQL database to another environment",
				description: "Moves the LibSQL database to a different environment within the same project.",
			},
		})
		.input(
			z.object({
				libsqlId: z.string(),
				targetEnvironmentId: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.libsqlId, {
				service: ["create"],
			});

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

			await audit(ctx, {
				action: "move",
				resourceType: "service",
				resourceId: updatedLibsql.libsqlId,
				resourceName: updatedLibsql.appName,
			});
			return updatedLibsql;
		}),
	rebuild: protectedProcedure
		.meta({
			openapi: {
				summary: "Rebuild a LibSQL database",
				description: "Rebuilds the LibSQL database Docker container from scratch, pulling the latest image and recreating the service.",
			},
		})
		.input(apiRebuildLibsql)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.libsqlId, {
				deployment: ["create"],
			});

			await rebuildDatabase(input.libsqlId, "libsql");
			await audit(ctx, {
				action: "rebuild",
				resourceType: "service",
				resourceId: input.libsqlId,
			});
			return true;
		}),

	readLogs: protectedProcedure
		.meta({
			openapi: {
				summary: "Read LibSQL container logs",
				description: "Retrieves the Docker container logs for the specified LibSQL database, with support for tail count, time-based filtering, and text search.",
			},
		})
		.input(
			apiFindOneLibsql.extend({
				tail: z.number().int().min(1).max(10000).default(100),
				since: z
					.string()
					.regex(/^(all|\d+[smhd])$/, "Invalid since format")
					.default("all"),
				search: z
					.string()
					.regex(/^[a-zA-Z0-9 ._-]{0,500}$/)
					.optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.libsqlId, "read");
			const libsql = await findLibsqlById(input.libsqlId);
			if (
				libsql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this LibSQL",
				});
			}
			return await getContainerLogs(
				libsql.appName,
				input.tail,
				input.since,
				input.search,
				libsql.serverId,
			);
		}),
});
