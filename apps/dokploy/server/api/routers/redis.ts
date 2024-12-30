import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	apiChangeRedisStatus,
	apiCreateRedis,
	apiDeployRedis,
	apiFindOneRedis,
	apiResetRedis,
	apiSaveEnvironmentVariablesRedis,
	apiSaveExternalPortRedis,
	apiUpdateRedis,
} from "@/server/db/schema";

import { TRPCError } from "@trpc/server";

import {
	IS_CLOUD,
	addNewService,
	checkServiceAccess,
	createMount,
	createRedis,
	deployRedis,
	findProjectById,
	findRedisById,
	removeRedisById,
	removeService,
	startService,
	startServiceRemote,
	stopService,
	stopServiceRemote,
	updateRedisById,
} from "@dokploy/server";

export const redisRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateRedis)
		.mutation(async ({ input, ctx }) => {
			try {
				if (ctx.user.rol === "user") {
					await checkServiceAccess(ctx.user.authId, input.projectId, "create");
				}

				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You need to use a server to create a Redis",
					});
				}

				const project = await findProjectById(input.projectId);
				if (project.adminId !== ctx.user.adminId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this project",
					});
				}
				const newRedis = await createRedis(input);
				if (ctx.user.rol === "user") {
					await addNewService(ctx.user.authId, newRedis.redisId);
				}

				await createMount({
					serviceId: newRedis.redisId,
					serviceType: "redis",
					volumeName: `${newRedis.appName}-data`,
					mountPath: "/data",
					type: "volume",
				});

				return true;
			} catch (error) {
				throw error;
			}
		}),
	one: protectedProcedure
		.input(apiFindOneRedis)
		.query(async ({ input, ctx }) => {
			if (ctx.user.rol === "user") {
				await checkServiceAccess(ctx.user.authId, input.redisId, "access");
			}

			const redis = await findRedisById(input.redisId);
			if (redis.project.adminId !== ctx.user.adminId) {
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
			const redis = await findRedisById(input.redisId);
			if (redis.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to start this Redis",
				});
			}

			if (redis.serverId) {
				await startServiceRemote(redis.serverId, redis.appName);
			} else {
				await startService(redis.appName);
			}
			await updateRedisById(input.redisId, {
				applicationStatus: "done",
			});

			return redis;
		}),
	reload: protectedProcedure
		.input(apiResetRedis)
		.mutation(async ({ input, ctx }) => {
			const redis = await findRedisById(input.redisId);
			if (redis.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to reload this Redis",
				});
			}
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
			return true;
		}),

	stop: protectedProcedure
		.input(apiFindOneRedis)
		.mutation(async ({ input, ctx }) => {
			const redis = await findRedisById(input.redisId);
			if (redis.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to stop this Redis",
				});
			}
			if (redis.serverId) {
				await stopServiceRemote(redis.serverId, redis.appName);
			} else {
				await stopService(redis.appName);
			}
			await updateRedisById(input.redisId, {
				applicationStatus: "idle",
			});

			return redis;
		}),
	saveExternalPort: protectedProcedure
		.input(apiSaveExternalPortRedis)
		.mutation(async ({ input, ctx }) => {
			const mongo = await findRedisById(input.redisId);
			if (mongo.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this external port",
				});
			}
			await updateRedisById(input.redisId, {
				externalPort: input.externalPort,
			});
			await deployRedis(input.redisId);
			return mongo;
		}),
	deploy: protectedProcedure
		.input(apiDeployRedis)
		.mutation(async ({ input, ctx }) => {
			const redis = await findRedisById(input.redisId);
			if (redis.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to deploy this Redis",
				});
			}
			return deployRedis(input.redisId);
		}),
	changeStatus: protectedProcedure
		.input(apiChangeRedisStatus)
		.mutation(async ({ input, ctx }) => {
			const mongo = await findRedisById(input.redisId);
			if (mongo.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to change this Redis status",
				});
			}
			await updateRedisById(input.redisId, {
				applicationStatus: input.applicationStatus,
			});
			return mongo;
		}),
	remove: protectedProcedure
		.input(apiFindOneRedis)
		.mutation(async ({ input, ctx }) => {
			if (ctx.user.rol === "user") {
				await checkServiceAccess(ctx.user.authId, input.redisId, "delete");
			}

			const redis = await findRedisById(input.redisId);

			if (redis.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to delete this Redis",
				});
			}

			const cleanupOperations = [
				async () => await removeService(redis?.appName, redis.serverId),
				async () => await removeRedisById(input.redisId),
			];

			for (const operation of cleanupOperations) {
				try {
					await operation();
				} catch (error) {}
			}

			return redis;
		}),
	saveEnvironment: protectedProcedure
		.input(apiSaveEnvironmentVariablesRedis)
		.mutation(async ({ input, ctx }) => {
			const redis = await findRedisById(input.redisId);
			if (redis.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this environment",
				});
			}
			const updatedRedis = await updateRedisById(input.redisId, {
				env: input.env,
			});

			if (!updatedRedis) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error adding environment variables",
				});
			}

			return true;
		}),
	update: protectedProcedure
		.input(apiUpdateRedis)
		.mutation(async ({ input }) => {
			const { redisId, ...rest } = input;
			const redis = await updateRedisById(redisId, {
				...rest,
			});

			if (!redis) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating Redis",
				});
			}

			return true;
		}),
});
