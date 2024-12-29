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
import {
	IS_CLOUD,
	addNewService,
	checkServiceAccess,
	createMariadb,
	createMount,
	deployMariadb,
	findMariadbById,
	findProjectById,
	findServerById,
	removeMariadbById,
	removeService,
	startService,
	startServiceRemote,
	stopService,
	stopServiceRemote,
	updateMariadbById,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";

export const mariadbRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateMariaDB)
		.mutation(async ({ input, ctx }) => {
			try {
				if (ctx.user.rol === "user") {
					await checkServiceAccess(ctx.user.authId, input.projectId, "create");
				}

				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You need to use a server to create a Mariadb",
					});
				}

				const project = await findProjectById(input.projectId);
				if (project.adminId !== ctx.user.adminId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this project",
					});
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
				throw error;
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
					message: "You are not authorized to access this Mariadb",
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
					message: "You are not authorized to start this Mariadb",
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
					message: "You are not authorized to deploy this Mariadb",
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
					message: "You are not authorized to change this Mariadb status",
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
					message: "You are not authorized to delete this Mariadb",
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
					message: "Error adding environment variables",
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
					message: "You are not authorized to reload this Mariadb",
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
					message: "You are not authorized to update this Mariadb",
				});
			}
			const service = await updateMariadbById(mariadbId, {
				...rest,
			});

			if (!service) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Update: Error updating Mariadb",
				});
			}

			return true;
		}),
});
