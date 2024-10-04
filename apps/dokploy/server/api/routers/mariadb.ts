import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	apiChangeMariaDBStatus,
	apiCreateMariaDB,
	apiDeployMariaDB,
	apiFindOneMariaDB,
	apiResetMariadb,
	apiSaveEnvironmentVariablesMariaDB,
	apiSaveExternalPortMariaDB,
	apiUpdateMariaDB,
} from "@/server/db/schema";
import { TRPCError } from "@trpc/server";
import {
	removeService,
	startService,
	startServiceRemote,
	stopService,
	stopServiceRemote,
	createMariadb,
	deployMariadb,
	findMariadbById,
	removeMariadbById,
	updateMariadbById,
	addNewService,
	checkServiceAccess,
	createMount,
} from "@dokploy/builders";

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
				if (error instanceof TRPCError) {
					throw error;
				}
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
			const mariadb = await findMariadbById(input.mariadbId);
			if (mariadb.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this mariadb",
				});
			}
			return mariadb;
		}),

	start: protectedProcedure
		.input(apiFindOneMariaDB)
		.mutation(async ({ input, ctx }) => {
			const service = await findMariadbById(input.mariadbId);
			if (service.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to start this mariadb",
				});
			}
			if (service.serverId) {
				await startServiceRemote(service.serverId, service.appName);
			} else {
				await startService(service.appName);
			}
			await updateMariadbById(input.mariadbId, {
				applicationStatus: "done",
			});

			return service;
		}),
	stop: protectedProcedure
		.input(apiFindOneMariaDB)
		.mutation(async ({ input }) => {
			const mariadb = await findMariadbById(input.mariadbId);

			if (mariadb.serverId) {
				await stopServiceRemote(mariadb.serverId, mariadb.appName);
			} else {
				await stopService(mariadb.appName);
			}
			await updateMariadbById(input.mariadbId, {
				applicationStatus: "idle",
			});

			return mariadb;
		}),
	saveExternalPort: protectedProcedure
		.input(apiSaveExternalPortMariaDB)
		.mutation(async ({ input, ctx }) => {
			const mongo = await findMariadbById(input.mariadbId);
			if (mongo.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this external port",
				});
			}
			await updateMariadbById(input.mariadbId, {
				externalPort: input.externalPort,
			});
			await deployMariadb(input.mariadbId);
			return mongo;
		}),
	deploy: protectedProcedure
		.input(apiDeployMariaDB)
		.mutation(async ({ input, ctx }) => {
			const mariadb = await findMariadbById(input.mariadbId);
			if (mariadb.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to deploy this mariadb",
				});
			}
			return deployMariadb(input.mariadbId);
		}),
	changeStatus: protectedProcedure
		.input(apiChangeMariaDBStatus)
		.mutation(async ({ input, ctx }) => {
			const mongo = await findMariadbById(input.mariadbId);
			if (mongo.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to change this mariadb status",
				});
			}
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
			if (mongo.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to delete this mariadb",
				});
			}

			const cleanupOperations = [
				async () => await removeService(mongo?.appName, mongo.serverId),
				async () => await removeMariadbById(input.mariadbId),
			];

			for (const operation of cleanupOperations) {
				try {
					await operation();
				} catch (error) {}
			}

			return mongo;
		}),
	saveEnvironment: protectedProcedure
		.input(apiSaveEnvironmentVariablesMariaDB)
		.mutation(async ({ input, ctx }) => {
			const mariadb = await findMariadbById(input.mariadbId);
			if (mariadb.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this environment",
				});
			}
			const service = await updateMariadbById(input.mariadbId, {
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
	reload: protectedProcedure
		.input(apiResetMariadb)
		.mutation(async ({ input, ctx }) => {
			const mariadb = await findMariadbById(input.mariadbId);
			if (mariadb.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to reload this mariadb",
				});
			}
			if (mariadb.serverId) {
				await stopServiceRemote(mariadb.serverId, mariadb.appName);
			} else {
				await stopService(mariadb.appName);
			}
			await updateMariadbById(input.mariadbId, {
				applicationStatus: "idle",
			});

			if (mariadb.serverId) {
				await startServiceRemote(mariadb.serverId, mariadb.appName);
			} else {
				await startService(mariadb.appName);
			}
			await updateMariadbById(input.mariadbId, {
				applicationStatus: "done",
			});
			return true;
		}),
	update: protectedProcedure
		.input(apiUpdateMariaDB)
		.mutation(async ({ input, ctx }) => {
			const { mariadbId, ...rest } = input;
			const mariadb = await findMariadbById(mariadbId);
			if (mariadb.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to update this mariadb",
				});
			}
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
