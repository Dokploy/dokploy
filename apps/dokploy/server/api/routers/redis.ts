import { createTRPCRouter, protectedProcedure } from "@dokploy/server/api/trpc";
import {
	apiChangeRedisStatus,
	apiCreateRedis,
	apiDeployRedis,
	apiFindOneRedis,
	apiResetRedis,
	apiSaveEnvironmentVariablesRedis,
	apiSaveExternalPortRedis,
	apiUpdateRedis,
} from "@dokploy/server/db/schema/redis";
import {
	removeService,
	startService,
	stopService,
} from "@dokploy/server/utils/docker/utils";
import { TRPCError } from "@trpc/server";
import { createMount } from "../services/mount";
import {
	createRedis,
	deployRedis,
	findRedisById,
	removeRedisById,
	updateRedisById,
} from "../services/redis";
import { addNewService, checkServiceAccess } from "../services/user";

export const redisRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateRedis)
		.mutation(async ({ input, ctx }) => {
			try {
				if (ctx.user.rol === "user") {
					await checkServiceAccess(ctx.user.authId, input.projectId, "create");
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
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error input: Inserting redis database",
					cause: error,
				});
			}
		}),
	one: protectedProcedure
		.input(apiFindOneRedis)
		.query(async ({ input, ctx }) => {
			if (ctx.user.rol === "user") {
				await checkServiceAccess(ctx.user.authId, input.redisId, "access");
			}
			return await findRedisById(input.redisId);
		}),

	start: protectedProcedure
		.input(apiFindOneRedis)
		.mutation(async ({ input }) => {
			const redis = await findRedisById(input.redisId);
			await startService(redis.appName);
			await updateRedisById(input.redisId, {
				applicationStatus: "done",
			});

			return redis;
		}),
	reload: protectedProcedure
		.input(apiResetRedis)
		.mutation(async ({ input }) => {
			await stopService(input.appName);
			await updateRedisById(input.redisId, {
				applicationStatus: "idle",
			});
			await startService(input.appName);
			await updateRedisById(input.redisId, {
				applicationStatus: "done",
			});
			return true;
		}),

	stop: protectedProcedure
		.input(apiFindOneRedis)
		.mutation(async ({ input }) => {
			const mongo = await findRedisById(input.redisId);
			await stopService(mongo.appName);
			await updateRedisById(input.redisId, {
				applicationStatus: "idle",
			});

			return mongo;
		}),
	saveExternalPort: protectedProcedure
		.input(apiSaveExternalPortRedis)
		.mutation(async ({ input }) => {
			const mongo = await findRedisById(input.redisId);
			await updateRedisById(input.redisId, {
				externalPort: input.externalPort,
			});
			await deployRedis(input.redisId);
			return mongo;
		}),
	deploy: protectedProcedure
		.input(apiDeployRedis)
		.mutation(async ({ input }) => {
			return deployRedis(input.redisId);
		}),
	changeStatus: protectedProcedure
		.input(apiChangeRedisStatus)
		.mutation(async ({ input }) => {
			const mongo = await findRedisById(input.redisId);
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

			const cleanupOperations = [
				async () => await removeService(redis?.appName),
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
		.mutation(async ({ input }) => {
			const redis = await updateRedisById(input.redisId, {
				env: input.env,
			});

			if (!redis) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Update: Error to add environment variables",
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
					message: "Update: Error to update redis",
				});
			}

			return true;
		}),
});
