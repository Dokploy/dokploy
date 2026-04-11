import {
	checkPortInUse,
	createMount,
	createMysql,
	deployMySql,
	execAsync,
	execAsyncRemote,
	findBackupsByDbId,
	findEnvironmentById,
	findMySqlById,
	findProjectById,
	getContainerLogs,
	getServiceContainerCommand,
	IS_CLOUD,
	rebuildDatabase,
	removeMySqlById,
	removeService,
	startService,
	startServiceRemote,
	stopService,
	stopServiceRemote,
	updateMySqlById,
	getAccessibleServerIds,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import {
	addNewService,
	checkServiceAccess,
	checkServicePermissionAndAccess,
	findMemberByUserId,
} from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiChangeMySqlStatus,
	apiCreateMySql,
	apiDeployMySql,
	apiFindOneMySql,
	apiRebuildMysql,
	apiResetMysql,
	apiSaveEnvironmentVariablesMySql,
	apiSaveExternalPortMySql,
	apiUpdateMySql,
	DATABASE_PASSWORD_MESSAGE,
	DATABASE_PASSWORD_REGEX,
	environments,
	mysql as mysqlTable,
	projects,
} from "@/server/db/schema";
import { cancelJobs } from "@/server/utils/backup";

export const mysqlRouter = createTRPCRouter({
	create: protectedProcedure
		.meta({
			openapi: {
				summary: "Create a MySQL database",
				description: "Creates a new MySQL database service with the specified configuration, sets up a persistent data volume, and registers it in the project.",
			},
		})
		.input(apiCreateMySql)
		.mutation(async ({ input, ctx }) => {
			try {
				const environment = await findEnvironmentById(input.environmentId);
				const project = await findProjectById(environment.projectId);

				await checkServiceAccess(ctx, project.projectId, "create");

				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You need to use a server to create a MySQL",
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

				const newMysql = await createMysql({
					...input,
				});
				await addNewService(ctx, newMysql.mysqlId);

				await createMount({
					serviceId: newMysql.mysqlId,
					serviceType: "mysql",
					volumeName: `${newMysql.appName}-data`,
					mountPath: "/var/lib/mysql",
					type: "volume",
				});

				await audit(ctx, {
					action: "create",
					resourceType: "service",
					resourceId: newMysql.mysqlId,
					resourceName: newMysql.appName,
				});
				return newMysql;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error input: Inserting MySQL database",
					cause: error,
				});
			}
		}),
	one: protectedProcedure
		.meta({
			openapi: {
				summary: "Get a MySQL database by ID",
				description: "Returns the full details of a MySQL database service, including its environment and project configuration.",
			},
		})
		.input(apiFindOneMySql)
		.query(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.mysqlId, "read");
			const mysql = await findMySqlById(input.mysqlId);
			if (
				mysql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this MySQL",
				});
			}
			return mysql;
		}),

	start: protectedProcedure
		.meta({
			openapi: {
				summary: "Start a MySQL database",
				description: "Starts the Docker container for the specified MySQL database and sets its status to done.",
			},
		})
		.input(apiFindOneMySql)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mysqlId, {
				deployment: ["create"],
			});
			const service = await findMySqlById(input.mysqlId);

			if (service.serverId) {
				await startServiceRemote(service.serverId, service.appName);
			} else {
				await startService(service.appName);
			}
			await updateMySqlById(input.mysqlId, {
				applicationStatus: "done",
			});

			await audit(ctx, {
				action: "start",
				resourceType: "service",
				resourceId: service.mysqlId,
				resourceName: service.appName,
			});
			return service;
		}),
	stop: protectedProcedure
		.meta({
			openapi: {
				summary: "Stop a MySQL database",
				description: "Stops the Docker container for the specified MySQL database and sets its status to idle.",
			},
		})
		.input(apiFindOneMySql)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mysqlId, {
				deployment: ["create"],
			});
			const mongo = await findMySqlById(input.mysqlId);
			if (mongo.serverId) {
				await stopServiceRemote(mongo.serverId, mongo.appName);
			} else {
				await stopService(mongo.appName);
			}
			await updateMySqlById(input.mysqlId, {
				applicationStatus: "idle",
			});

			await audit(ctx, {
				action: "stop",
				resourceType: "service",
				resourceId: mongo.mysqlId,
				resourceName: mongo.appName,
			});
			return mongo;
		}),
	saveExternalPort: protectedProcedure
		.meta({
			openapi: {
				summary: "Save the external port for a MySQL database",
				description: "Updates the external port mapping for the MySQL database and triggers a redeployment. Validates that the port is not already in use.",
			},
		})
		.input(apiSaveExternalPortMySql)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mysqlId, {
				service: ["create"],
			});
			const mysql = await findMySqlById(input.mysqlId);

			if (input.externalPort) {
				const portCheck = await checkPortInUse(
					input.externalPort,
					mysql.serverId || undefined,
				);
				if (portCheck.isInUse) {
					throw new TRPCError({
						code: "CONFLICT",
						message: `Port ${input.externalPort} is already in use by ${portCheck.conflictingContainer}`,
					});
				}
			}

			await updateMySqlById(input.mysqlId, {
				externalPort: input.externalPort,
			});
			await deployMySql(input.mysqlId);
			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: mysql.mysqlId,
				resourceName: mysql.appName,
			});
			return mysql;
		}),
	deploy: protectedProcedure
		.meta({
			openapi: {
				summary: "Deploy a MySQL database",
				description: "Triggers a deployment for the specified MySQL database, rebuilding and restarting its Docker container with the current configuration.",
			},
		})
		.input(apiDeployMySql)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mysqlId, {
				deployment: ["create"],
			});
			const mysql = await findMySqlById(input.mysqlId);
			await audit(ctx, {
				action: "deploy",
				resourceType: "service",
				resourceId: mysql.mysqlId,
				resourceName: mysql.appName,
			});
			return deployMySql(input.mysqlId);
		}),
	deployWithLogs: protectedProcedure
		.meta({
			openapi: {
				path: "/deploy/mysql-with-logs",
				method: "POST",
				override: true,
				enabled: false,
			},
		})
		.input(apiDeployMySql)
		.subscription(async function* ({ input, ctx, signal }) {
			await checkServicePermissionAndAccess(ctx, input.mysqlId, {
				deployment: ["create"],
			});

			const queue: string[] = [];
			let done = false;

			deployMySql(input.mysqlId, (log) => {
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
				summary: "Change MySQL database status",
				description: "Updates the application status of a MySQL database without starting or stopping the container.",
			},
		})
		.input(apiChangeMySqlStatus)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mysqlId, {
				deployment: ["create"],
			});
			const mongo = await findMySqlById(input.mysqlId);
			await updateMySqlById(input.mysqlId, {
				applicationStatus: input.applicationStatus,
			});
			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: mongo.mysqlId,
				resourceName: mongo.appName,
			});
			return mongo;
		}),
	reload: protectedProcedure
		.meta({
			openapi: {
				summary: "Reload a MySQL database",
				description: "Restarts the MySQL database by stopping and then starting its Docker container.",
			},
		})
		.input(apiResetMysql)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mysqlId, {
				deployment: ["create"],
			});
			const mysql = await findMySqlById(input.mysqlId);
			if (mysql.serverId) {
				await stopServiceRemote(mysql.serverId, mysql.appName);
			} else {
				await stopService(mysql.appName);
			}
			await updateMySqlById(input.mysqlId, {
				applicationStatus: "idle",
			});
			if (mysql.serverId) {
				await startServiceRemote(mysql.serverId, mysql.appName);
			} else {
				await startService(mysql.appName);
			}
			await updateMySqlById(input.mysqlId, {
				applicationStatus: "done",
			});
			await audit(ctx, {
				action: "reload",
				resourceType: "service",
				resourceId: mysql.mysqlId,
				resourceName: mysql.appName,
			});
			return true;
		}),
	remove: protectedProcedure
		.meta({
			openapi: {
				summary: "Delete a MySQL database",
				description: "Removes the MySQL database service, its Docker container, cancels associated backup jobs, and deletes the database record.",
			},
		})
		.input(apiFindOneMySql)
		.mutation(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.mysqlId, "delete");
			const mongo = await findMySqlById(input.mysqlId);
			if (
				mongo.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to delete this MySQL",
				});
			}

			await audit(ctx, {
				action: "delete",
				resourceType: "service",
				resourceId: mongo.mysqlId,
				resourceName: mongo.appName,
			});
			const backups = await findBackupsByDbId(input.mysqlId, "mysql");
			const cleanupOperations = [
				async () => await removeService(mongo?.appName, mongo.serverId),
				async () => await cancelJobs(backups),
				async () => await removeMySqlById(input.mysqlId),
			];

			for (const operation of cleanupOperations) {
				try {
					await operation();
				} catch (_) {}
			}

			return mongo;
		}),
	saveEnvironment: protectedProcedure
		.meta({
			openapi: {
				summary: "Save environment variables for a MySQL database",
				description: "Updates the environment variables for the specified MySQL database service.",
			},
		})
		.input(apiSaveEnvironmentVariablesMySql)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mysqlId, {
				envVars: ["write"],
			});
			const service = await updateMySqlById(input.mysqlId, {
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
				resourceId: input.mysqlId,
			});
			return true;
		}),
	update: protectedProcedure
		.meta({
			openapi: {
				summary: "Update a MySQL database",
				description: "Updates the configuration of an existing MySQL database service.",
			},
		})
		.input(apiUpdateMySql)
		.mutation(async ({ input, ctx }) => {
			const { mysqlId, ...rest } = input;
			await checkServicePermissionAndAccess(ctx, mysqlId, {
				service: ["create"],
			});
			const service = await updateMySqlById(mysqlId, {
				...rest,
			});

			if (!service) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Update: Error updating MySQL",
				});
			}

			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: mysqlId,
				resourceName: service.appName,
			});
			return true;
		}),
	changePassword: protectedProcedure
		.meta({
			openapi: {
				summary: "Change MySQL database password",
				description: "Changes the password for a MySQL user or root account by executing ALTER USER inside the running container and updating the stored password.",
			},
		})
		.input(
			z.object({
				mysqlId: z.string().min(1),
				password: z.string().min(1).regex(DATABASE_PASSWORD_REGEX, {
					message: DATABASE_PASSWORD_MESSAGE,
				}),
				type: z.enum(["user", "root"]).default("user"),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const { mysqlId, password, type } = input;
			await checkServicePermissionAndAccess(ctx, mysqlId, {
				service: ["create"],
			});

			const my = await findMySqlById(mysqlId);
			const { appName, serverId, databaseUser, databaseRootPassword } = my;

			const containerCmd = getServiceContainerCommand(appName);
			const targetUser = type === "root" ? "root" : databaseUser;

			const command = `
				CONTAINER_ID=$(${containerCmd})
				if [ -z "$CONTAINER_ID" ]; then
					echo "No running container found for ${appName}" >&2
					exit 1
				fi
				docker exec "$CONTAINER_ID" mysql -u root -p'${databaseRootPassword}' -e "ALTER USER '${targetUser}'@'%' IDENTIFIED BY '${password}'; FLUSH PRIVILEGES;"
			`;

			await db.transaction(async (tx) => {
				const setData =
					type === "root"
						? { databaseRootPassword: password }
						: { databasePassword: password };
				await tx
					.update(mysqlTable)
					.set(setData)
					.where(eq(mysqlTable.mysqlId, mysqlId));

				if (serverId) {
					await execAsyncRemote(serverId, command);
				} else {
					await execAsync(command, { shell: "/bin/bash" });
				}
			});

			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: mysqlId,
				resourceName: appName,
			});

			return true;
		}),
	move: protectedProcedure
		.meta({
			openapi: {
				summary: "Move a MySQL database to another environment",
				description: "Moves the MySQL database to a different environment within the same project.",
			},
		})
		.input(
			z.object({
				mysqlId: z.string(),
				targetEnvironmentId: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mysqlId, {
				service: ["create"],
			});

			const updatedMysql = await db
				.update(mysqlTable)
				.set({
					environmentId: input.targetEnvironmentId,
				})
				.where(eq(mysqlTable.mysqlId, input.mysqlId))
				.returning()
				.then((res) => res[0]);

			if (!updatedMysql) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to move mysql",
				});
			}

			await audit(ctx, {
				action: "move",
				resourceType: "service",
				resourceId: updatedMysql.mysqlId,
				resourceName: updatedMysql.appName,
			});
			return updatedMysql;
		}),
	rebuild: protectedProcedure
		.meta({
			openapi: {
				summary: "Rebuild a MySQL database",
				description: "Rebuilds the MySQL database Docker container from scratch, pulling the latest image and recreating the service.",
			},
		})
		.input(apiRebuildMysql)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mysqlId, {
				deployment: ["create"],
			});

			await rebuildDatabase(input.mysqlId, "mysql");

			await audit(ctx, {
				action: "rebuild",
				resourceType: "service",
				resourceId: input.mysqlId,
			});
			return true;
		}),
	search: protectedProcedure
		.meta({
			openapi: {
				summary: "Search MySQL databases",
				description: "Returns a paginated list of MySQL databases matching the given filters. Supports searching by name, appName, description, project, and environment.",
			},
		})
		.input(
			z.object({
				q: z.string().optional(),
				name: z.string().optional(),
				appName: z.string().optional(),
				description: z.string().optional(),
				projectId: z.string().optional(),
				environmentId: z.string().optional(),
				limit: z.number().min(1).max(100).default(20),
				offset: z.number().min(0).default(0),
			}),
		)
		.query(async ({ ctx, input }) => {
			const baseConditions = [
				eq(projects.organizationId, ctx.session.activeOrganizationId),
			];
			if (input.projectId) {
				baseConditions.push(eq(environments.projectId, input.projectId));
			}
			if (input.environmentId) {
				baseConditions.push(eq(mysqlTable.environmentId, input.environmentId));
			}
			if (input.q?.trim()) {
				const term = `%${input.q.trim()}%`;
				baseConditions.push(
					or(
						ilike(mysqlTable.name, term),
						ilike(mysqlTable.appName, term),
						ilike(mysqlTable.description ?? "", term),
					)!,
				);
			}
			if (input.name?.trim()) {
				baseConditions.push(ilike(mysqlTable.name, `%${input.name.trim()}%`));
			}
			if (input.appName?.trim()) {
				baseConditions.push(
					ilike(mysqlTable.appName, `%${input.appName.trim()}%`),
				);
			}
			if (input.description?.trim()) {
				baseConditions.push(
					ilike(mysqlTable.description ?? "", `%${input.description.trim()}%`),
				);
			}
			const { accessedServices } = await findMemberByUserId(
				ctx.user.id,
				ctx.session.activeOrganizationId,
			);
			if (accessedServices.length === 0) return { items: [], total: 0 };
			baseConditions.push(
				sql`${mysqlTable.mysqlId} IN (${sql.join(
					accessedServices.map((id) => sql`${id}`),
					sql`, `,
				)})`,
			);

			const where = and(...baseConditions);
			const [items, countResult] = await Promise.all([
				db
					.select({
						mysqlId: mysqlTable.mysqlId,
						name: mysqlTable.name,
						appName: mysqlTable.appName,
						description: mysqlTable.description,
						environmentId: mysqlTable.environmentId,
						applicationStatus: mysqlTable.applicationStatus,
						createdAt: mysqlTable.createdAt,
					})
					.from(mysqlTable)
					.innerJoin(
						environments,
						eq(mysqlTable.environmentId, environments.environmentId),
					)
					.innerJoin(projects, eq(environments.projectId, projects.projectId))
					.where(where)
					.orderBy(desc(mysqlTable.createdAt))
					.limit(input.limit)
					.offset(input.offset),
				db
					.select({ count: sql<number>`count(*)::int` })
					.from(mysqlTable)
					.innerJoin(
						environments,
						eq(mysqlTable.environmentId, environments.environmentId),
					)
					.innerJoin(projects, eq(environments.projectId, projects.projectId))
					.where(where),
			]);
			return { items, total: countResult[0]?.count ?? 0 };
		}),

	readLogs: protectedProcedure
		.meta({
			openapi: {
				summary: "Read MySQL container logs",
				description: "Retrieves the Docker container logs for the specified MySQL database, with support for tail count, time-based filtering, and text search.",
			},
		})
		.input(
			apiFindOneMySql.extend({
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
			await checkServiceAccess(ctx, input.mysqlId, "read");
			const mysql = await findMySqlById(input.mysqlId);
			if (
				mysql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this MySQL",
				});
			}
			return await getContainerLogs(
				mysql.appName,
				input.tail,
				input.since,
				input.search,
				mysql.serverId,
			);
		}),
});
