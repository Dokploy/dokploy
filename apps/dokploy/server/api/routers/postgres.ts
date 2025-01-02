import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	apiChangePostgresStatus,
	apiCreatePostgres,
	apiDeployPostgres,
	apiFindOnePostgres,
	apiResetPostgres,
	apiSaveEnvironmentVariablesPostgres,
	apiSaveExternalPortPostgres,
	apiUpdatePostgres,
} from "@/server/db/schema";
import {
	IS_CLOUD,
	addNewService,
	checkServiceAccess,
	createMount,
	createPostgres,
	deployPostgres,
	findPostgresById,
	findProjectById,
	removePostgresById,
	removeService,
	startService,
	startServiceRemote,
	stopService,
	stopServiceRemote,
	updatePostgresById,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";

export const postgresRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreatePostgres)
		.mutation(async ({ input, ctx }) => {
			try {
				if (ctx.user.rol === "user") {
					await checkServiceAccess(ctx.user.authId, input.projectId, "create");
				}

				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You need to use a server to create a Postgres",
					});
				}

				const project = await findProjectById(input.projectId);
				if (project.adminId !== ctx.user.adminId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this project",
					});
				}
				const newPostgres = await createPostgres(input);
				if (ctx.user.rol === "user") {
					await addNewService(ctx.user.authId, newPostgres.postgresId);
				}

				await createMount({
					serviceId: newPostgres.postgresId,
					serviceType: "postgres",
					volumeName: `${newPostgres.appName}-data`,
					mountPath: "/var/lib/postgresql/data",
					type: "volume",
				});

				return true;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error input: Inserting Postgres database",
					cause: error,
				});
			}
		}),
	one: protectedProcedure
		.input(apiFindOnePostgres)
		.query(async ({ input, ctx }) => {
			if (ctx.user.rol === "user") {
				await checkServiceAccess(ctx.user.authId, input.postgresId, "access");
			}

			const postgres = await findPostgresById(input.postgresId);
			if (postgres.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this Postgres",
				});
			}
			return postgres;
		}),

	start: protectedProcedure
		.input(apiFindOnePostgres)
		.mutation(async ({ input, ctx }) => {
			const service = await findPostgresById(input.postgresId);

			if (service.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to start this Postgres",
				});
			}

			if (service.serverId) {
				await startServiceRemote(service.serverId, service.appName);
			} else {
				await startService(service.appName);
			}
			await updatePostgresById(input.postgresId, {
				applicationStatus: "done",
			});

			return service;
		}),
	stop: protectedProcedure
		.input(apiFindOnePostgres)
		.mutation(async ({ input, ctx }) => {
			const postgres = await findPostgresById(input.postgresId);
			if (postgres.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to stop this Postgres",
				});
			}
			if (postgres.serverId) {
				await stopServiceRemote(postgres.serverId, postgres.appName);
			} else {
				await stopService(postgres.appName);
			}
			await updatePostgresById(input.postgresId, {
				applicationStatus: "idle",
			});

			return postgres;
		}),
	saveExternalPort: protectedProcedure
		.input(apiSaveExternalPortPostgres)
		.mutation(async ({ input, ctx }) => {
			const postgres = await findPostgresById(input.postgresId);

			if (postgres.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this external port",
				});
			}
			await updatePostgresById(input.postgresId, {
				externalPort: input.externalPort,
			});
			await deployPostgres(input.postgresId);
			return postgres;
		}),
	deploy: protectedProcedure
		.input(apiDeployPostgres)
		.mutation(async ({ input, ctx }) => {
			const postgres = await findPostgresById(input.postgresId);
			if (postgres.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to deploy this Postgres",
				});
			}
			return deployPostgres(input.postgresId);
		}),
	changeStatus: protectedProcedure
		.input(apiChangePostgresStatus)
		.mutation(async ({ input, ctx }) => {
			const postgres = await findPostgresById(input.postgresId);
			if (postgres.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to change this Postgres status",
				});
			}
			await updatePostgresById(input.postgresId, {
				applicationStatus: input.applicationStatus,
			});
			return postgres;
		}),
	remove: protectedProcedure
		.input(apiFindOnePostgres)
		.mutation(async ({ input, ctx }) => {
			if (ctx.user.rol === "user") {
				await checkServiceAccess(ctx.user.authId, input.postgresId, "delete");
			}
			const postgres = await findPostgresById(input.postgresId);

			if (postgres.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to delete this Postgres",
				});
			}

			const cleanupOperations = [
				removeService(postgres.appName, postgres.serverId),
				removePostgresById(input.postgresId),
			];

			await Promise.allSettled(cleanupOperations);

			return postgres;
		}),
	saveEnvironment: protectedProcedure
		.input(apiSaveEnvironmentVariablesPostgres)
		.mutation(async ({ input, ctx }) => {
			const postgres = await findPostgresById(input.postgresId);
			if (postgres.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this environment",
				});
			}
			const service = await updatePostgresById(input.postgresId, {
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
		.input(apiResetPostgres)
		.mutation(async ({ input, ctx }) => {
			const postgres = await findPostgresById(input.postgresId);
			if (postgres.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to reload this Postgres",
				});
			}
			if (postgres.serverId) {
				await stopServiceRemote(postgres.serverId, postgres.appName);
			} else {
				await stopService(postgres.appName);
			}
			await updatePostgresById(input.postgresId, {
				applicationStatus: "idle",
			});

			if (postgres.serverId) {
				await startServiceRemote(postgres.serverId, postgres.appName);
			} else {
				await startService(postgres.appName);
			}
			await updatePostgresById(input.postgresId, {
				applicationStatus: "done",
			});
			return true;
		}),
	update: protectedProcedure
		.input(apiUpdatePostgres)
		.mutation(async ({ input, ctx }) => {
			const { postgresId, ...rest } = input;
			const postgres = await findPostgresById(postgresId);
			if (postgres.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to update this Postgres",
				});
			}
			const service = await updatePostgresById(postgresId, {
				...rest,
			});

			if (!service) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating Postgres",
				});
			}

			return true;
		}),
});
