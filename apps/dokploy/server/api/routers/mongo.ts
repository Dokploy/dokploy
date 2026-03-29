import {
	checkPortInUse,
	createMongo,
	createMount,
	deployMongo,
	findBackupsByDbId,
	findEnvironmentById,
	findMongoById,
	findProjectById,
	IS_CLOUD,
	rebuildDatabase,
	removeMongoById,
	removeService,
	startService,
	startServiceRemote,
	stopService,
	stopServiceRemote,
	updateMongoById,
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
	apiChangeMongoStatus,
	apiCreateMongo,
	apiDeployMongo,
	apiFindOneMongo,
	apiRebuildMongo,
	apiResetMongo,
	apiSaveEnvironmentVariablesMongo,
	apiSaveExternalPortMongo,
	apiUpdateMongo,
	environments,
	mongo as mongoTable,
	projects,
} from "@/server/db/schema";
import { cancelJobs } from "@/server/utils/backup";
export const mongoRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateMongo)
		.mutation(async ({ input, ctx }) => {
			try {
				const environment = await findEnvironmentById(input.environmentId);
				const project = await findProjectById(environment.projectId);

				await checkServiceAccess(ctx, project.projectId, "create");

				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You need to use a server to create a mongo",
					});
				}

				if (project.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this project",
					});
				}
				const newMongo = await createMongo({
					...input,
				});
				await addNewService(ctx, newMongo.mongoId);

				await createMount({
					serviceId: newMongo.mongoId,
					serviceType: "mongo",
					volumeName: `${newMongo.appName}-data`,
					mountPath: "/data/db",
					type: "volume",
				});

				await audit(ctx, {
					action: "create",
					resourceType: "service",
					resourceId: newMongo.mongoId,
					resourceName: newMongo.appName,
				});
				return newMongo;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error input: Inserting mongo database",
					cause: error,
				});
			}
		}),
	one: protectedProcedure
		.input(apiFindOneMongo)
		.query(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.mongoId, "read");

			const mongo = await findMongoById(input.mongoId);
			if (
				mongo.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this mongo",
				});
			}
			return mongo;
		}),

	start: protectedProcedure
		.input(apiFindOneMongo)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mongoId, {
				deployment: ["create"],
			});
			const service = await findMongoById(input.mongoId);

			if (service.serverId) {
				await startServiceRemote(service.serverId, service.appName);
			} else {
				await startService(service.appName);
			}
			await updateMongoById(input.mongoId, {
				applicationStatus: "done",
			});

			await audit(ctx, {
				action: "start",
				resourceType: "service",
				resourceId: service.mongoId,
				resourceName: service.appName,
			});
			return service;
		}),
	stop: protectedProcedure
		.input(apiFindOneMongo)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mongoId, {
				deployment: ["create"],
			});
			const mongo = await findMongoById(input.mongoId);

			if (mongo.serverId) {
				await stopServiceRemote(mongo.serverId, mongo.appName);
			} else {
				await stopService(mongo.appName);
			}
			await updateMongoById(input.mongoId, {
				applicationStatus: "idle",
			});

			await audit(ctx, {
				action: "stop",
				resourceType: "service",
				resourceId: mongo.mongoId,
				resourceName: mongo.appName,
			});
			return mongo;
		}),
	saveExternalPort: protectedProcedure
		.input(apiSaveExternalPortMongo)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mongoId, {
				service: ["create"],
			});
			const mongo = await findMongoById(input.mongoId);

			if (input.externalPort) {
				const portCheck = await checkPortInUse(
					input.externalPort,
					mongo.serverId || undefined,
				);
				if (portCheck.isInUse) {
					throw new TRPCError({
						code: "CONFLICT",
						message: `Port ${input.externalPort} is already in use by ${portCheck.conflictingContainer}`,
					});
				}
			}

			await updateMongoById(input.mongoId, {
				externalPort: input.externalPort,
			});
			await deployMongo(input.mongoId);
			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: mongo.mongoId,
				resourceName: mongo.appName,
			});
			return mongo;
		}),
	deploy: protectedProcedure
		.input(apiDeployMongo)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mongoId, {
				deployment: ["create"],
			});
			const mongo = await findMongoById(input.mongoId);
			await audit(ctx, {
				action: "deploy",
				resourceType: "service",
				resourceId: mongo.mongoId,
				resourceName: mongo.appName,
			});
			return deployMongo(input.mongoId);
		}),
	deployWithLogs: protectedProcedure
		.meta({
			openapi: {
				path: "/deploy/mongo-with-logs",
				method: "POST",
				override: true,
				enabled: false,
			},
		})
		.input(apiDeployMongo)
		.subscription(async function* ({ input, ctx, signal }) {
			await checkServicePermissionAndAccess(ctx, input.mongoId, {
				deployment: ["create"],
			});
			const queue: string[] = [];
			const done = false;

			deployMongo(input.mongoId, (log) => {
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
		.input(apiChangeMongoStatus)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mongoId, {
				deployment: ["create"],
			});
			const mongo = await findMongoById(input.mongoId);
			await updateMongoById(input.mongoId, {
				applicationStatus: input.applicationStatus,
			});
			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: mongo.mongoId,
				resourceName: mongo.appName,
			});
			return mongo;
		}),
	reload: protectedProcedure
		.input(apiResetMongo)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mongoId, {
				deployment: ["create"],
			});
			const mongo = await findMongoById(input.mongoId);
			if (mongo.serverId) {
				await stopServiceRemote(mongo.serverId, mongo.appName);
			} else {
				await stopService(mongo.appName);
			}
			await updateMongoById(input.mongoId, {
				applicationStatus: "idle",
			});

			if (mongo.serverId) {
				await startServiceRemote(mongo.serverId, mongo.appName);
			} else {
				await startService(mongo.appName);
			}
			await updateMongoById(input.mongoId, {
				applicationStatus: "done",
			});
			await audit(ctx, {
				action: "reload",
				resourceType: "service",
				resourceId: mongo.mongoId,
				resourceName: mongo.appName,
			});
			return true;
		}),
	remove: protectedProcedure
		.input(apiFindOneMongo)
		.mutation(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.mongoId, "delete");

			const mongo = await findMongoById(input.mongoId);

			if (
				mongo.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to delete this mongo",
				});
			}
			await audit(ctx, {
				action: "delete",
				resourceType: "service",
				resourceId: mongo.mongoId,
				resourceName: mongo.appName,
			});
			const backups = await findBackupsByDbId(input.mongoId, "mongo");

			const cleanupOperations = [
				async () => await removeService(mongo?.appName, mongo.serverId),
				async () => await cancelJobs(backups),
				async () => await removeMongoById(input.mongoId),
			];

			for (const operation of cleanupOperations) {
				try {
					await operation();
				} catch (_) {}
			}

			return mongo;
		}),
	saveEnvironment: protectedProcedure
		.input(apiSaveEnvironmentVariablesMongo)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mongoId, {
				envVars: ["write"],
			});
			const service = await updateMongoById(input.mongoId, {
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
				resourceId: input.mongoId,
			});
			return true;
		}),
	update: protectedProcedure
		.input(apiUpdateMongo)
		.mutation(async ({ input, ctx }) => {
			const { mongoId, ...rest } = input;
			await checkServicePermissionAndAccess(ctx, mongoId, {
				service: ["create"],
			});
			const service = await updateMongoById(mongoId, {
				...rest,
			});

			if (!service) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Update: Error updating Mongo",
				});
			}

			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: mongoId,
				resourceName: service.appName,
			});
			return true;
		}),
	move: protectedProcedure
		.input(
			z.object({
				mongoId: z.string(),
				targetEnvironmentId: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mongoId, {
				service: ["create"],
			});

			const updatedMongo = await db
				.update(mongoTable)
				.set({
					environmentId: input.targetEnvironmentId,
				})
				.where(eq(mongoTable.mongoId, input.mongoId))
				.returning()
				.then((res) => res[0]);

			if (!updatedMongo) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to move mongo",
				});
			}

			await audit(ctx, {
				action: "move",
				resourceType: "service",
				resourceId: updatedMongo.mongoId,
				resourceName: updatedMongo.appName,
			});
			return updatedMongo;
		}),
	rebuild: protectedProcedure
		.input(apiRebuildMongo)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mongoId, {
				deployment: ["create"],
			});

			await rebuildDatabase(input.mongoId, "mongo");

			await audit(ctx, {
				action: "rebuild",
				resourceType: "service",
				resourceId: input.mongoId,
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
				baseConditions.push(eq(mongoTable.environmentId, input.environmentId));
			}
			if (input.q?.trim()) {
				const term = `%${input.q.trim()}%`;
				baseConditions.push(
					or(
						ilike(mongoTable.name, term),
						ilike(mongoTable.appName, term),
						ilike(mongoTable.description ?? "", term),
					)!,
				);
			}
			if (input.name?.trim()) {
				baseConditions.push(ilike(mongoTable.name, `%${input.name.trim()}%`));
			}
			if (input.appName?.trim()) {
				baseConditions.push(
					ilike(mongoTable.appName, `%${input.appName.trim()}%`),
				);
			}
			if (input.description?.trim()) {
				baseConditions.push(
					ilike(mongoTable.description ?? "", `%${input.description.trim()}%`),
				);
			}
			const { accessedServices } = await findMemberByUserId(
				ctx.user.id,
				ctx.session.activeOrganizationId,
			);
			if (accessedServices.length === 0) return { items: [], total: 0 };
			baseConditions.push(
				sql`${mongoTable.mongoId} IN (${sql.join(
					accessedServices.map((id) => sql`${id}`),
					sql`, `,
				)})`,
			);

			const where = and(...baseConditions);
			const [items, countResult] = await Promise.all([
				db
					.select({
						mongoId: mongoTable.mongoId,
						name: mongoTable.name,
						appName: mongoTable.appName,
						description: mongoTable.description,
						environmentId: mongoTable.environmentId,
						applicationStatus: mongoTable.applicationStatus,
						createdAt: mongoTable.createdAt,
					})
					.from(mongoTable)
					.innerJoin(
						environments,
						eq(mongoTable.environmentId, environments.environmentId),
					)
					.innerJoin(projects, eq(environments.projectId, projects.projectId))
					.where(where)
					.orderBy(desc(mongoTable.createdAt))
					.limit(input.limit)
					.offset(input.offset),
				db
					.select({ count: sql<number>`count(*)::int` })
					.from(mongoTable)
					.innerJoin(
						environments,
						eq(mongoTable.environmentId, environments.environmentId),
					)
					.innerJoin(projects, eq(environments.projectId, projects.projectId))
					.where(where),
			]);
			return { items, total: countResult[0]?.count ?? 0 };
		}),
});
