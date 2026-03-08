import {
	addNewService,
	canAccessServer,
	checkPortInUse,
	checkServiceAccess,
	createMongo,
	createMount,
	deployMongo,
	findBackupsByDbId,
	findEnvironmentById,
	findMemberById,
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
import { TRPCError } from "@trpc/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
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
	mongo as mongoTable,
} from "@/server/db/schema";
import { environments, projects } from "@/server/db/schema";
import { cancelJobs } from "@/server/utils/backup";
export const mongoRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateMongo)
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

					const hasServerAccess = await canAccessServer(
						ctx.user.id,
						input.serverId ?? "local",
						ctx.session.activeOrganizationId,
					);
					if (!hasServerAccess) {
						throw new TRPCError({
							code: "FORBIDDEN",
							message: "You don't have access to the selected server",
						});
					}
				}

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
				if (ctx.user.role === "member") {
					await addNewService(
						ctx.user.id,
						newMongo.mongoId,
						project.organizationId,
					);
				}

				await createMount({
					serviceId: newMongo.mongoId,
					serviceType: "mongo",
					volumeName: `${newMongo.appName}-data`,
					mountPath: "/data/db",
					type: "volume",
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
			if (ctx.user.role === "member") {
				await checkServiceAccess(
					ctx.user.id,
					input.mongoId,
					ctx.session.activeOrganizationId,
					"access",
				);
			}

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
			const service = await findMongoById(input.mongoId);

			if (
				service.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to start this mongo",
				});
			}

			if (service.serverId) {
				await startServiceRemote(service.serverId, service.appName);
			} else {
				await startService(service.appName);
			}
			await updateMongoById(input.mongoId, {
				applicationStatus: "done",
			});

			return service;
		}),
	stop: protectedProcedure
		.input(apiFindOneMongo)
		.mutation(async ({ input, ctx }) => {
			const mongo = await findMongoById(input.mongoId);

			if (
				mongo.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to stop this mongo",
				});
			}

			if (mongo.serverId) {
				await stopServiceRemote(mongo.serverId, mongo.appName);
			} else {
				await stopService(mongo.appName);
			}
			await updateMongoById(input.mongoId, {
				applicationStatus: "idle",
			});

			return mongo;
		}),
	saveExternalPort: protectedProcedure
		.input(apiSaveExternalPortMongo)
		.mutation(async ({ input, ctx }) => {
			const mongo = await findMongoById(input.mongoId);
			if (
				mongo.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this external port",
				});
			}

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
			return mongo;
		}),
	deploy: protectedProcedure
		.input(apiDeployMongo)
		.mutation(async ({ input, ctx }) => {
			const mongo = await findMongoById(input.mongoId);
			if (
				mongo.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to deploy this mongo",
				});
			}
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
			const mongo = await findMongoById(input.mongoId);
			if (
				mongo.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to deploy this mongo",
				});
			}
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
			const mongo = await findMongoById(input.mongoId);
			if (
				mongo.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to change this mongo status",
				});
			}
			await updateMongoById(input.mongoId, {
				applicationStatus: input.applicationStatus,
			});
			return mongo;
		}),
	reload: protectedProcedure
		.input(apiResetMongo)
		.mutation(async ({ input, ctx }) => {
			const mongo = await findMongoById(input.mongoId);
			if (
				mongo.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to reload this mongo",
				});
			}
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
			return true;
		}),
	remove: protectedProcedure
		.input(apiFindOneMongo)
		.mutation(async ({ input, ctx }) => {
			if (ctx.user.role === "member") {
				await checkServiceAccess(
					ctx.user.id,
					input.mongoId,
					ctx.session.activeOrganizationId,
					"delete",
				);
			}

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
			const mongo = await findMongoById(input.mongoId);
			if (
				mongo.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this environment",
				});
			}
			const service = await updateMongoById(input.mongoId, {
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
	update: protectedProcedure
		.input(apiUpdateMongo)
		.mutation(async ({ input, ctx }) => {
			const { mongoId, ...rest } = input;
			const mongo = await findMongoById(mongoId);
			if (
				mongo.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to update this mongo",
				});
			}
			const service = await updateMongoById(mongoId, {
				...rest,
			});

			if (!service) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Update: Error updating Mongo",
				});
			}

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
			const mongo = await findMongoById(input.mongoId);
			if (
				mongo.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to move this mongo",
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

			// Update the mongo's projectId
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

			return updatedMongo;
		}),
	rebuild: protectedProcedure
		.input(apiRebuildMongo)
		.mutation(async ({ input, ctx }) => {
			const mongo = await findMongoById(input.mongoId);
			if (
				mongo.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to rebuild this MongoDB database",
				});
			}

			await rebuildDatabase(mongo.mongoId, "mongo");

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
			if (ctx.user.role === "member") {
				const { accessedServices } = await findMemberById(
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
			}
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
