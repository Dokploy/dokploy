import {
	checkPortInUse,
	createMount,
	createRedis,
	deployRedis,
	execAsync,
	execAsyncRemote,
	findEnvironmentById,
	findProjectById,
	findRedisById,
	getServiceContainerCommand,
	IS_CLOUD,
	rebuildDatabase,
	removeRedisById,
	removeService,
	startService,
	startServiceRemote,
	stopService,
	stopServiceRemote,
	updateRedisById,
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
	apiChangeRedisStatus,
	apiCreateRedis,
	apiDeployRedis,
	apiFindOneRedis,
	apiRebuildRedis,
	apiResetRedis,
	apiSaveEnvironmentVariablesRedis,
	apiSaveExternalPortRedis,
	apiUpdateRedis,
	DATABASE_PASSWORD_MESSAGE,
	DATABASE_PASSWORD_REGEX,
	environments,
	projects,
	redis as redisTable,
} from "@/server/db/schema";
export const redisRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateRedis)
		.mutation(async ({ input, ctx }) => {
			try {
				const environment = await findEnvironmentById(input.environmentId);
				const project = await findProjectById(environment.projectId);

				await checkServiceAccess(ctx, project.projectId, "create");

				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You need to use a server to create a Redis",
					});
				}

				if (project.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this project",
					});
				}
				const newRedis = await createRedis({
					...input,
				});
				await addNewService(ctx, newRedis.redisId);

				await createMount({
					serviceId: newRedis.redisId,
					serviceType: "redis",
					volumeName: `${newRedis.appName}-data`,
					mountPath: "/data",
					type: "volume",
				});

				await audit(ctx, {
					action: "create",
					resourceType: "service",
					resourceId: newRedis.redisId,
					resourceName: newRedis.appName,
				});
				return newRedis;
			} catch (error) {
				throw error;
			}
		}),
	one: protectedProcedure
		.input(apiFindOneRedis)
		.query(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.redisId, "read");

			const redis = await findRedisById(input.redisId);
			if (
				redis.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this Redis",
				});
			}
			return redis;
		}),

	start: protectedProcedure
		.input(apiFindOneRedis)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.redisId, {
				deployment: ["create"],
			});
			const redis = await findRedisById(input.redisId);

			if (redis.serverId) {
				await startServiceRemote(redis.serverId, redis.appName);
			} else {
				await startService(redis.appName);
			}
			await updateRedisById(input.redisId, {
				applicationStatus: "done",
			});

			await audit(ctx, {
				action: "start",
				resourceType: "service",
				resourceId: redis.redisId,
				resourceName: redis.appName,
			});
			return redis;
		}),
	reload: protectedProcedure
		.input(apiResetRedis)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.redisId, {
				deployment: ["create"],
			});
			const redis = await findRedisById(input.redisId);
			if (redis.serverId) {
				await stopServiceRemote(redis.serverId, redis.appName);
			} else {
				await stopService(redis.appName);
			}
			await updateRedisById(input.redisId, {
				applicationStatus: "idle",
			});

			if (redis.serverId) {
				await startServiceRemote(redis.serverId, redis.appName);
			} else {
				await startService(redis.appName);
			}
			await updateRedisById(input.redisId, {
				applicationStatus: "done",
			});
			await audit(ctx, {
				action: "reload",
				resourceType: "service",
				resourceId: redis.redisId,
				resourceName: redis.appName,
			});
			return true;
		}),

	stop: protectedProcedure
		.input(apiFindOneRedis)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.redisId, {
				deployment: ["create"],
			});
			const redis = await findRedisById(input.redisId);
			if (redis.serverId) {
				await stopServiceRemote(redis.serverId, redis.appName);
			} else {
				await stopService(redis.appName);
			}
			await updateRedisById(input.redisId, {
				applicationStatus: "idle",
			});

			await audit(ctx, {
				action: "stop",
				resourceType: "service",
				resourceId: redis.redisId,
				resourceName: redis.appName,
			});
			return redis;
		}),
	saveExternalPort: protectedProcedure
		.input(apiSaveExternalPortRedis)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.redisId, {
				service: ["create"],
			});
			const redis = await findRedisById(input.redisId);

			if (input.externalPort) {
				const portCheck = await checkPortInUse(
					input.externalPort,
					redis.serverId || undefined,
				);
				if (portCheck.isInUse) {
					throw new TRPCError({
						code: "CONFLICT",
						message: `Port ${input.externalPort} is already in use by ${portCheck.conflictingContainer}`,
					});
				}
			}

			await updateRedisById(input.redisId, {
				externalPort: input.externalPort,
			});
			await deployRedis(input.redisId);
			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: redis.redisId,
				resourceName: redis.appName,
			});
			return redis;
		}),
	deploy: protectedProcedure
		.input(apiDeployRedis)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.redisId, {
				deployment: ["create"],
			});
			const redis = await findRedisById(input.redisId);
			await audit(ctx, {
				action: "deploy",
				resourceType: "service",
				resourceId: redis.redisId,
				resourceName: redis.appName,
			});
			return deployRedis(input.redisId);
		}),
	deployWithLogs: protectedProcedure
		.meta({
			openapi: {
				path: "/deploy/redis-with-logs",
				method: "POST",
				override: true,
				enabled: false,
			},
		})
		.input(apiDeployRedis)
		.subscription(async function* ({ input, ctx, signal }) {
			await checkServicePermissionAndAccess(ctx, input.redisId, {
				deployment: ["create"],
			});
			const queue: string[] = [];
			let done = false;

			deployRedis(input.redisId, (log) => {
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
		.input(apiChangeRedisStatus)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.redisId, {
				deployment: ["create"],
			});
			const mongo = await findRedisById(input.redisId);
			await updateRedisById(input.redisId, {
				applicationStatus: input.applicationStatus,
			});
			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: mongo.redisId,
				resourceName: mongo.appName,
			});
			return mongo;
		}),
	remove: protectedProcedure
		.input(apiFindOneRedis)
		.mutation(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.redisId, "delete");

			const redis = await findRedisById(input.redisId);

			if (
				redis.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to delete this Redis",
				});
			}
			await audit(ctx, {
				action: "delete",
				resourceType: "service",
				resourceId: redis.redisId,
				resourceName: redis.appName,
			});
			const cleanupOperations = [
				async () => await removeService(redis?.appName, redis.serverId),
				async () => await removeRedisById(input.redisId),
			];

			for (const operation of cleanupOperations) {
				try {
					await operation();
				} catch (_) {}
			}

			return redis;
		}),
	saveEnvironment: protectedProcedure
		.input(apiSaveEnvironmentVariablesRedis)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.redisId, {
				envVars: ["write"],
			});
			const updatedRedis = await updateRedisById(input.redisId, {
				env: input.env,
			});

			if (!updatedRedis) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error adding environment variables",
				});
			}

			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: input.redisId,
			});
			return true;
		}),
	update: protectedProcedure
		.input(apiUpdateRedis)
		.mutation(async ({ input, ctx }) => {
			const { redisId, ...rest } = input;
			await checkServicePermissionAndAccess(ctx, redisId, {
				service: ["create"],
			});
			const redis = await updateRedisById(redisId, {
				...rest,
			});

			if (!redis) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating Redis",
				});
			}

			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: redisId,
				resourceName: redis.appName,
			});
			return true;
		}),
	changePassword: protectedProcedure
		.input(
			z.object({
				redisId: z.string().min(1),
				password: z
					.string()
					.min(1)
					.regex(DATABASE_PASSWORD_REGEX, {
						message: DATABASE_PASSWORD_MESSAGE,
					}),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const { redisId, password } = input;
			await checkServicePermissionAndAccess(ctx, redisId, {
				service: ["create"],
			});

			const rd = await findRedisById(redisId);
			const { appName, serverId, databasePassword } = rd;

			const containerCmd = getServiceContainerCommand(appName);
			const command = `
				CONTAINER_ID=$(${containerCmd})
				if [ -z "$CONTAINER_ID" ]; then
					echo "No running container found for ${appName}" >&2
					exit 1
				fi
				docker exec "$CONTAINER_ID" redis-cli -a '${databasePassword}' CONFIG SET requirepass '${password}'
			`;

			await db.transaction(async (tx) => {
				await tx
					.update(redisTable)
					.set({ databasePassword: password })
					.where(eq(redisTable.redisId, redisId));

				if (serverId) {
					await execAsyncRemote(serverId, command);
				} else {
					await execAsync(command, { shell: "/bin/bash" });
				}
			});

			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: redisId,
				resourceName: appName,
			});

			return true;
		}),
	move: protectedProcedure
		.input(
			z.object({
				redisId: z.string(),
				targetEnvironmentId: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.redisId, {
				service: ["create"],
			});

			const updatedRedis = await db
				.update(redisTable)
				.set({
					environmentId: input.targetEnvironmentId,
				})
				.where(eq(redisTable.redisId, input.redisId))
				.returning()
				.then((res) => res[0]);

			if (!updatedRedis) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to move redis",
				});
			}

			await audit(ctx, {
				action: "move",
				resourceType: "service",
				resourceId: updatedRedis.redisId,
				resourceName: updatedRedis.appName,
			});
			return updatedRedis;
		}),
	rebuild: protectedProcedure
		.input(apiRebuildRedis)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.redisId, {
				deployment: ["create"],
			});

			await rebuildDatabase(input.redisId, "redis");
			await audit(ctx, {
				action: "rebuild",
				resourceType: "service",
				resourceId: input.redisId,
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
				baseConditions.push(eq(redisTable.environmentId, input.environmentId));
			}
			if (input.q?.trim()) {
				const term = `%${input.q.trim()}%`;
				baseConditions.push(
					or(
						ilike(redisTable.name, term),
						ilike(redisTable.appName, term),
						ilike(redisTable.description ?? "", term),
					)!,
				);
			}
			if (input.name?.trim()) {
				baseConditions.push(ilike(redisTable.name, `%${input.name.trim()}%`));
			}
			if (input.appName?.trim()) {
				baseConditions.push(
					ilike(redisTable.appName, `%${input.appName.trim()}%`),
				);
			}
			if (input.description?.trim()) {
				baseConditions.push(
					ilike(redisTable.description ?? "", `%${input.description.trim()}%`),
				);
			}
			const { accessedServices } = await findMemberByUserId(
				ctx.user.id,
				ctx.session.activeOrganizationId,
			);
			if (accessedServices.length === 0) return { items: [], total: 0 };
			baseConditions.push(
				sql`${redisTable.redisId} IN (${sql.join(
					accessedServices.map((id) => sql`${id}`),
					sql`, `,
				)})`,
			);

			const where = and(...baseConditions);
			const [items, countResult] = await Promise.all([
				db
					.select({
						redisId: redisTable.redisId,
						name: redisTable.name,
						appName: redisTable.appName,
						description: redisTable.description,
						environmentId: redisTable.environmentId,
						applicationStatus: redisTable.applicationStatus,
						createdAt: redisTable.createdAt,
					})
					.from(redisTable)
					.innerJoin(
						environments,
						eq(redisTable.environmentId, environments.environmentId),
					)
					.innerJoin(projects, eq(environments.projectId, projects.projectId))
					.where(where)
					.orderBy(desc(redisTable.createdAt))
					.limit(input.limit)
					.offset(input.offset),
				db
					.select({ count: sql<number>`count(*)::int` })
					.from(redisTable)
					.innerJoin(
						environments,
						eq(redisTable.environmentId, environments.environmentId),
					)
					.innerJoin(projects, eq(environments.projectId, projects.projectId))
					.where(where),
			]);
			return { items, total: countResult[0]?.count ?? 0 };
		}),
});
