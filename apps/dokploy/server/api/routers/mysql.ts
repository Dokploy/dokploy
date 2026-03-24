import {
	checkPortInUse,
	createMount,
	createMysql,
	deployMySql,
	findBackupsByDbId,
	findEnvironmentById,
	findMySqlById,
	findProjectById,
	IS_CLOUD,
	rebuildDatabase,
	removeMySqlById,
	removeService,
	startService,
	startServiceRemote,
	stopService,
	stopServiceRemote,
	updateMySqlById,
} from "@dokploy/server";
import {
	addNewService,
	checkServiceAccess,
	checkServicePermissionAndAccess,
	findMemberByUserId,
} from "@dokploy/server/services/permission";
import { db } from "@dokploy/server/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
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
			const done = false;

			deployMySql(input.mysqlId, (log) => {
				queue.push(log);
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
});
