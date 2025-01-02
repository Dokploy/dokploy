import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	apiChangeMongoStatus,
	apiCreateMongo,
	apiDeployMongo,
	apiFindOneMongo,
	apiResetMongo,
	apiSaveEnvironmentVariablesMongo,
	apiSaveExternalPortMongo,
	apiUpdateMongo,
} from "@/server/db/schema";
import {
	IS_CLOUD,
	addNewService,
	checkServiceAccess,
	createMongo,
	createMount,
	deployMongo,
	findMongoById,
	findProjectById,
	removeMongoById,
	removeService,
	startService,
	startServiceRemote,
	stopService,
	stopServiceRemote,
	updateMongoById,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";

export const mongoRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateMongo)
		.mutation(async ({ input, ctx }) => {
			try {
				if (ctx.user.rol === "user") {
					await checkServiceAccess(ctx.user.authId, input.projectId, "create");
				}

				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You need to use a server to create a mongo",
					});
				}

				const project = await findProjectById(input.projectId);
				if (project.adminId !== ctx.user.adminId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this project",
					});
				}
				const newMongo = await createMongo(input);
				if (ctx.user.rol === "user") {
					await addNewService(ctx.user.authId, newMongo.mongoId);
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
			if (ctx.user.rol === "user") {
				await checkServiceAccess(ctx.user.authId, input.mongoId, "access");
			}

			const mongo = await findMongoById(input.mongoId);
			if (mongo.project.adminId !== ctx.user.adminId) {
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

			if (service.project.adminId !== ctx.user.adminId) {
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

			if (mongo.project.adminId !== ctx.user.adminId) {
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
			if (mongo.project.adminId !== ctx.user.adminId) {
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
			if (mongo.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to deploy this mongo",
				});
			}
			return deployMongo(input.mongoId);
		}),
	changeStatus: protectedProcedure
		.input(apiChangeMongoStatus)
		.mutation(async ({ input, ctx }) => {
			const mongo = await findMongoById(input.mongoId);
			if (mongo.project.adminId !== ctx.user.adminId) {
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
			if (mongo.project.adminId !== ctx.user.adminId) {
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
			if (ctx.user.rol === "user") {
				await checkServiceAccess(ctx.user.authId, input.mongoId, "delete");
			}

			const mongo = await findMongoById(input.mongoId);

			if (mongo.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to delete this mongo",
				});
			}

			const cleanupOperations = [
				async () => await removeService(mongo?.appName, mongo.serverId),
				async () => await removeMongoById(input.mongoId),
			];

			for (const operation of cleanupOperations) {
				try {
					await operation();
				} catch (error) {}
			}

			return mongo;
		}),
	saveEnvironment: protectedProcedure
		.input(apiSaveEnvironmentVariablesMongo)
		.mutation(async ({ input, ctx }) => {
			const mongo = await findMongoById(input.mongoId);
			if (mongo.project.adminId !== ctx.user.adminId) {
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
			if (mongo.project.adminId !== ctx.user.adminId) {
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
});
