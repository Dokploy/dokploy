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
	scanServiceForTransfer,
	executeTransfer,
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
	apiTransferMysql,
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

	transferScan: protectedProcedure
		.input(apiTransferMysql.pick({ mysqlId: true, targetServerId: true }))
		.mutation(async ({ input, ctx }) => {
			const mysql = await findMySqlById(input.mysqlId);
			await checkServicePermissionAndAccess(ctx, input.mysqlId, {
				service: ["delete"],
			});
			if (
				mysql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this MySQL",
				});
			}
			return await scanServiceForTransfer({
				serviceId: input.mysqlId,
				serviceType: "mysql",
				appName: mysql.appName,
				sourceServerId: mysql.serverId,
				targetServerId: input.targetServerId,
			});
		}),

	transferWithLogs: protectedProcedure
		.input(apiTransferMysql)
		.subscription(async function* ({ input, ctx, signal }) {
			const mysql = await findMySqlById(input.mysqlId);
			await checkServicePermissionAndAccess(ctx, input.mysqlId, {
				service: ["delete"],
			});
			if (
				mysql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this MySQL",
				});
			}
			const queue: string[] = [];
			let done = false;
			executeTransfer(
				{
					serviceId: input.mysqlId,
					serviceType: "mysql",
					appName: mysql.appName,
					sourceServerId: mysql.serverId,
					targetServerId: input.targetServerId,
				},
				input.decisions || {},
				(progress) => { queue.push(JSON.stringify(progress)); },
			)
				.then(async (result) => {
					if (result.success) {
						await db
							.update(mysqlTable)
							.set({ serverId: input.targetServerId })
							.where(eq(mysqlTable.mysqlId, input.mysqlId));
						queue.push("Transfer completed successfully!");
					} else {
						queue.push(`Transfer failed: ${result.errors.join(", ")}`);
					}
				})
				.catch((error) => {
					queue.push(`Transfer error: ${error instanceof Error ? error.message : String(error)}`);
				})
				.finally(() => { done = true; });

			while (!done || queue.length > 0) {
				if (queue.length > 0) { yield queue.shift()!; }
				else { await new Promise((r) => setTimeout(r, 50)); }
				if (signal?.aborted) { return; }
			}
		}),

	transfer: protectedProcedure
		.input(apiTransferMysql)
		.mutation(async ({ input, ctx }) => {
			const mysql = await findMySqlById(input.mysqlId);
			await checkServicePermissionAndAccess(ctx, input.mysqlId, {
				service: ["delete"],
			});
			if (
				mysql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this MySQL",
				});
			}
			const result = await executeTransfer(
				{
					serviceId: input.mysqlId,
					serviceType: "mysql",
					appName: mysql.appName,
					sourceServerId: mysql.serverId,
					targetServerId: input.targetServerId,
				},
				input.decisions || {},
			);
			if (!result.success) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Transfer failed: ${result.errors.join(", ")}`,
				});
			}
			await db
				.update(mysqlTable)
				.set({ serverId: input.targetServerId })
				.where(eq(mysqlTable.mysqlId, input.mysqlId));
			return { success: true };
		}),
});
