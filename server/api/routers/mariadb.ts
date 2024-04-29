import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	apiChangeMariaDBStatus,
	apiCreateMariaDB,
	apiDeployMariaDB,
	apiFindOneMariaDB,
	apiResetMariadb,
	apiSaveEnviromentVariablesMariaDB,
	apiSaveExternalPortMariaDB,
	apiUpdateMariaDB,
} from "@/server/db/schema/mariadb";
import {
	removeService,
	startService,
	stopService,
} from "@/server/utils/docker/utils";
import { TRPCError } from "@trpc/server";
import {
	createMariadb,
	deployMariadb,
	findMariadbById,
	removeMariadbById,
	updateMariadbById,
} from "../services/mariadb";
import { addNewService, checkServiceAccess } from "../services/user";
import { createMount } from "../services/mount";

export const mariadbRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateMariaDB)
		.mutation(async ({ input, ctx }) => {
			try {
				if (ctx.user.rol === "user") {
					await checkServiceAccess(ctx.user.authId, input.projectId, "create");
				}

				const newMariadb = await createMariadb(input);
				if (ctx.user.rol === "user") {
					await addNewService(ctx.user.authId, newMariadb.mariadbId);
				}

				await createMount({
					serviceId: newMariadb.mariadbId,
					serviceType: "mariadb",
					volumeName: `${newMariadb.appName}-data`,
					mountPath: "/var/lib/mysql",
					type: "volume",
				});

				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error input: Inserting mariadb database",
					cause: error,
				});
			}
		}),
	one: protectedProcedure
		.input(apiFindOneMariaDB)
		.query(async ({ input, ctx }) => {
			if (ctx.user.rol === "user") {
				await checkServiceAccess(ctx.user.authId, input.mariadbId, "access");
			}
			return await findMariadbById(input.mariadbId);
		}),

	start: protectedProcedure
		.input(apiFindOneMariaDB)
		.mutation(async ({ input }) => {
			const service = await findMariadbById(input.mariadbId);

			await startService(service.appName);
			await updateMariadbById(input.mariadbId, {
				applicationStatus: "done",
			});

			return service;
		}),
	stop: protectedProcedure
		.input(apiFindOneMariaDB)
		.mutation(async ({ input }) => {
			const mongo = await findMariadbById(input.mariadbId);
			await stopService(mongo.appName);
			await updateMariadbById(input.mariadbId, {
				applicationStatus: "idle",
			});

			return mongo;
		}),
	saveExternalPort: protectedProcedure
		.input(apiSaveExternalPortMariaDB)
		.mutation(async ({ input }) => {
			const mongo = await findMariadbById(input.mariadbId);
			await updateMariadbById(input.mariadbId, {
				externalPort: input.externalPort,
			});
			await deployMariadb(input.mariadbId);
			return mongo;
		}),
	deploy: protectedProcedure
		.input(apiDeployMariaDB)
		.mutation(async ({ input }) => {
			return deployMariadb(input.mariadbId);
		}),
	changeStatus: protectedProcedure
		.input(apiChangeMariaDBStatus)
		.mutation(async ({ input }) => {
			const mongo = await findMariadbById(input.mariadbId);
			await updateMariadbById(input.mariadbId, {
				applicationStatus: input.applicationStatus,
			});
			return mongo;
		}),
	remove: protectedProcedure
		.input(apiFindOneMariaDB)
		.mutation(async ({ input, ctx }) => {
			if (ctx.user.rol === "user") {
				await checkServiceAccess(ctx.user.authId, input.mariadbId, "delete");
			}

			const mongo = await findMariadbById(input.mariadbId);

			const cleanupOperations = [
				async () => await removeService(mongo?.appName),
				async () => await removeMariadbById(input.mariadbId),
			];

			for (const operation of cleanupOperations) {
				try {
					await operation();
				} catch (error) {}
			}

			return mongo;
		}),
	saveEnviroment: protectedProcedure
		.input(apiSaveEnviromentVariablesMariaDB)
		.mutation(async ({ input }) => {
			const service = await updateMariadbById(input.mariadbId, {
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
	reload: protectedProcedure
		.input(apiResetMariadb)
		.mutation(async ({ input }) => {
			await stopService(input.appName);
			await updateMariadbById(input.mariadbId, {
				applicationStatus: "idle",
			});
			await startService(input.appName);
			await updateMariadbById(input.mariadbId, {
				applicationStatus: "done",
			});
			return true;
		}),
	update: protectedProcedure
		.input(apiUpdateMariaDB)
		.mutation(async ({ input }) => {
			const { mariadbId, ...rest } = input;
			const service = await updateMariadbById(mariadbId, {
				...rest,
			});

			if (!service) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Update: Error to update mariadb",
				});
			}

			return true;
		}),
});
