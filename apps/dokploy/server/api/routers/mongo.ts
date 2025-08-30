import {
	addNewService,
	checkServiceAccess,
	createMongo,
	createMount,
	deployMongo,
	findBackupsByDbId,
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
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
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
import { cancelJobs } from "@/server/utils/backup";
export const mongoRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateMongo)
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
						message: "You need to use a server to create a mongo",
					});
				}

				const project = await findProjectById(input.projectId);
				if (project.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this project",
					});
				}
				const newMongo = await createMongo(input);
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

				return true;
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
			if (mongo.project.organizationId !== ctx.session.activeOrganizationId) {
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

			if (service.project.organizationId !== ctx.session.activeOrganizationId) {
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

			if (mongo.project.organizationId !== ctx.session.activeOrganizationId) {
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
			if (mongo.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this external port",
				});
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
			if (mongo.project.organizationId !== ctx.session.activeOrganizationId) {
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
		.subscription(async ({ input, ctx }) => {
			const mongo = await findMongoById(input.mongoId);
			if (mongo.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to deploy this mongo",
				});
			}
			return observable<string>((emit) => {
				deployMongo(input.mongoId, (log) => {
					emit.next(log);
				});
			});
		}),

	changeStatus: protectedProcedure
		.input(apiChangeMongoStatus)
		.mutation(async ({ input, ctx }) => {
			const mongo = await findMongoById(input.mongoId);
			if (mongo.project.organizationId !== ctx.session.activeOrganizationId) {
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
			if (mongo.project.organizationId !== ctx.session.activeOrganizationId) {
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

			if (mongo.project.organizationId !== ctx.session.activeOrganizationId) {
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
			if (mongo.project.organizationId !== ctx.session.activeOrganizationId) {
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
			if (mongo.project.organizationId !== ctx.session.activeOrganizationId) {
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
				targetProjectId: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const mongo = await findMongoById(input.mongoId);
			if (mongo.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to move this mongo",
				});
			}

			const targetProject = await findProjectById(input.targetProjectId);
			if (targetProject.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to move to this project",
				});
			}

			// Update the mongo's projectId
			const updatedMongo = await db
				.update(mongoTable)
				.set({
					projectId: input.targetProjectId,
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
			if (mongo.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to rebuild this MongoDB database",
				});
			}

			await rebuildDatabase(mongo.mongoId, "mongo");

			return true;
		}),
});
