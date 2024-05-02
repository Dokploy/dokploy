import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	apiChangeMySqlStatus,
	apiCreateMySql,
	apiDeployMySql,
	apiFindOneMySql,
	apiResetMysql,
	apiSaveEnvironmentVariablesMySql,
	apiSaveExternalPortMySql,
	apiUpdateMySql,
} from "@/server/db/schema/mysql";
import {
	removeService,
	startService,
	stopService,
} from "@/server/utils/docker/utils";
import { TRPCError } from "@trpc/server";
import {
	createMysql,
	deployMySql,
	findMySqlById,
	removeMySqlById,
	updateMySqlById,
} from "../services/mysql";
import { addNewService, checkServiceAccess } from "../services/user";
import { createMount } from "../services/mount";
import { z } from "zod";

export const mysqlRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateMySql)
		.mutation(async ({ input, ctx }) => {
			try {
				if (ctx.user.rol === "user") {
					await checkServiceAccess(ctx.user.authId, input.projectId, "create");
				}

				const newMysql = await createMysql(input);
				if (ctx.user.rol === "user") {
					await addNewService(ctx.user.authId, newMysql.mysqlId);
				}

				await createMount({
					serviceId: newMysql.mysqlId,
					serviceType: "mysql",
					volumeName: `${newMysql.appName}-data`,
					mountPath: "/var/lib/mysql",
					type: "volume",
				});

				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error input: Inserting mysql database",
					cause: error,
				});
			}
		}),
	one: protectedProcedure
		.input(apiFindOneMySql)
		.query(async ({ input, ctx }) => {
			if (ctx.user.rol === "user") {
				await checkServiceAccess(ctx.user.authId, input.mysqlId, "access");
			}
			return await findMySqlById(input.mysqlId);
		}),

	start: protectedProcedure
		.input(apiFindOneMySql)
		.mutation(async ({ input }) => {
			const service = await findMySqlById(input.mysqlId);

			await startService(service.appName);
			await updateMySqlById(input.mysqlId, {
				applicationStatus: "done",
			});

			return service;
		}),
	stop: protectedProcedure
		.input(apiFindOneMySql)
		.mutation(async ({ input }) => {
			const mongo = await findMySqlById(input.mysqlId);
			await stopService(mongo.appName);
			await updateMySqlById(input.mysqlId, {
				applicationStatus: "idle",
			});

			return mongo;
		}),
	saveExternalPort: protectedProcedure
		.input(apiSaveExternalPortMySql)
		.mutation(async ({ input }) => {
			const mongo = await findMySqlById(input.mysqlId);
			await updateMySqlById(input.mysqlId, {
				externalPort: input.externalPort,
			});
			await deployMySql(input.mysqlId);
			return mongo;
		}),
	deploy: protectedProcedure
		.input(apiDeployMySql)
		.mutation(async ({ input }) => {
			return deployMySql(input.mysqlId);
		}),
	changeStatus: protectedProcedure
		.input(apiChangeMySqlStatus)
		.mutation(async ({ input }) => {
			const mongo = await findMySqlById(input.mysqlId);
			await updateMySqlById(input.mysqlId, {
				applicationStatus: input.applicationStatus,
			});
			return mongo;
		}),
	reload: protectedProcedure
		.input(apiResetMysql)
		.mutation(async ({ input }) => {
			await stopService(input.appName);
			await updateMySqlById(input.mysqlId, {
				applicationStatus: "idle",
			});
			await startService(input.appName);
			await updateMySqlById(input.mysqlId, {
				applicationStatus: "done",
			});
			return true;
		}),
	remove: protectedProcedure
		.input(apiFindOneMySql)
		.mutation(async ({ input, ctx }) => {
			if (ctx.user.rol === "user") {
				await checkServiceAccess(ctx.user.authId, input.mysqlId, "delete");
			}
			const mongo = await findMySqlById(input.mysqlId);

			const cleanupOperations = [
				async () => await removeService(mongo?.appName),
				async () => await removeMySqlById(input.mysqlId),
			];

			for (const operation of cleanupOperations) {
				try {
					await operation();
				} catch (error) {}
			}

			return mongo;
		}),
	saveEnvironment: protectedProcedure
		.input(apiSaveEnvironmentVariablesMySql)
		.mutation(async ({ input }) => {
			const service = await updateMySqlById(input.mysqlId, {
				env: input.env,
			});

			if (!service) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Update: Error to add environment variables",
				});
			}

			return true;
		}),
	update: protectedProcedure
		.input(apiUpdateMySql)
		.mutation(async ({ input }) => {
			const { mysqlId, ...rest } = input;
			const service = await updateMySqlById(mysqlId, {
				...rest,
			});

			if (!service) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Update: Error to update mysql",
				});
			}

			return true;
		}),
});
