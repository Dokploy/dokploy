import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	apiChangeMongoStatus,
	apiCreateMongo,
	apiDeployMongo,
	apiFindOneMongo,
	apiResetMongo,
	apiSaveEnviromentVariablesMongo,
	apiSaveExternalPortMongo,
	apiUpdateMongo,
} from "@/server/db/schema/mongo";
import {
	removeService,
	startService,
	stopService,
} from "@/server/utils/docker/utils";
import { TRPCError } from "@trpc/server";
import {
	createMongo,
	deployMongo,
	findMongoById,
	removeMongoById,
	updateMongoById,
} from "../services/mongo";
import { addNewService, checkServiceAccess } from "../services/user";
import { createMount } from "../services/mount";

export const mongoRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateMongo)
		.mutation(async ({ input, ctx }) => {
			try {
				if (ctx.user.rol === "user") {
					await checkServiceAccess(ctx.user.authId, input.projectId, "create");
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

			return await findMongoById(input.mongoId);
		}),

	start: protectedProcedure
		.input(apiFindOneMongo)
		.mutation(async ({ input }) => {
			const service = await findMongoById(input.mongoId);

			await startService(service.appName);
			await updateMongoById(input.mongoId, {
				applicationStatus: "done",
			});

			return service;
		}),
	stop: protectedProcedure
		.input(apiFindOneMongo)
		.mutation(async ({ input }) => {
			const mongo = await findMongoById(input.mongoId);
			await stopService(mongo.appName);
			await updateMongoById(input.mongoId, {
				applicationStatus: "idle",
			});

			return mongo;
		}),
	saveExternalPort: protectedProcedure
		.input(apiSaveExternalPortMongo)
		.mutation(async ({ input }) => {
			const mongo = await findMongoById(input.mongoId);
			await updateMongoById(input.mongoId, {
				externalPort: input.externalPort,
			});
			await deployMongo(input.mongoId);
			return mongo;
		}),
	deploy: protectedProcedure
		.input(apiDeployMongo)
		.mutation(async ({ input }) => {
			return deployMongo(input.mongoId);
		}),
	changeStatus: protectedProcedure
		.input(apiChangeMongoStatus)
		.mutation(async ({ input }) => {
			const mongo = await findMongoById(input.mongoId);
			await updateMongoById(input.mongoId, {
				applicationStatus: input.applicationStatus,
			});
			return mongo;
		}),
	reload: protectedProcedure
		.input(apiResetMongo)
		.mutation(async ({ input }) => {
			await stopService(input.appName);
			await updateMongoById(input.mongoId, {
				applicationStatus: "idle",
			});
			await startService(input.appName);
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

			const cleanupOperations = [
				async () => await removeService(mongo?.appName),
				async () => await removeMongoById(input.mongoId),
			];

			for (const operation of cleanupOperations) {
				try {
					await operation();
				} catch (error) {}
			}

			return mongo;
		}),
	saveEnviroment: protectedProcedure
		.input(apiSaveEnviromentVariablesMongo)
		.mutation(async ({ input }) => {
			const service = await updateMongoById(input.mongoId, {
				env: input.env,
			});

			if (!service) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Update: Error to add enviroment variables",
				});
			}

			return true;
		}),
	update: protectedProcedure
		.input(apiUpdateMongo)
		.mutation(async ({ input }) => {
			const { mongoId, ...rest } = input;
			const service = await updateMongoById(mongoId, {
				...rest,
			});

			if (!service) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Update: Error to update mongo",
				});
			}

			return true;
		}),
});
