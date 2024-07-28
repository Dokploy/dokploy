import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
	apiChangePostgresStatus,
	apiCreatePostgres,
	apiDeployPostgres,
	apiFindOnePostgres,
	apiResetPostgres,
	apiSaveEnvironmentVariablesPostgres,
	apiSaveExternalPortPostgres,
	apiUpdatePostgres,
} from "~/server/db/schema/postgres";
import {
	removeService,
	startService,
	stopService,
} from "~/server/utils/docker/utils";
import { createMount } from "../services/mount";
import {
	createPostgres,
	deployPostgres,
	findPostgresById,
	removePostgresById,
	updatePostgresById,
} from "../services/postgres";
import { addNewService, checkServiceAccess } from "../services/user";

export const postgresRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreatePostgres)
		.mutation(async ({ input, ctx }) => {
			try {
				if (ctx.user.rol === "user") {
					await checkServiceAccess(ctx.user.authId, input.projectId, "create");
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
					message: "Error input: Inserting postgresql database",
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

			return await findPostgresById(input.postgresId);
		}),

	start: protectedProcedure
		.input(apiFindOnePostgres)
		.mutation(async ({ input }) => {
			const service = await findPostgresById(input.postgresId);

			await startService(service.appName);
			await updatePostgresById(input.postgresId, {
				applicationStatus: "done",
			});

			return service;
		}),
	stop: protectedProcedure
		.input(apiFindOnePostgres)
		.mutation(async ({ input }) => {
			const postgres = await findPostgresById(input.postgresId);
			await stopService(postgres.appName);
			await updatePostgresById(input.postgresId, {
				applicationStatus: "idle",
			});

			return postgres;
		}),
	saveExternalPort: protectedProcedure
		.input(apiSaveExternalPortPostgres)
		.mutation(async ({ input }) => {
			const postgres = await findPostgresById(input.postgresId);
			await updatePostgresById(input.postgresId, {
				externalPort: input.externalPort,
			});
			await deployPostgres(input.postgresId);
			return postgres;
		}),
	deploy: protectedProcedure
		.input(apiDeployPostgres)
		.mutation(async ({ input }) => {
			return deployPostgres(input.postgresId);
		}),
	changeStatus: protectedProcedure
		.input(apiChangePostgresStatus)
		.mutation(async ({ input }) => {
			const postgres = await findPostgresById(input.postgresId);
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

			const cleanupOperations = [
				removeService(postgres.appName),
				removePostgresById(input.postgresId),
			];

			await Promise.allSettled(cleanupOperations);

			return postgres;
		}),
	saveEnvironment: protectedProcedure
		.input(apiSaveEnvironmentVariablesPostgres)
		.mutation(async ({ input }) => {
			const service = await updatePostgresById(input.postgresId, {
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
		.input(apiResetPostgres)
		.mutation(async ({ input }) => {
			await stopService(input.appName);
			await updatePostgresById(input.postgresId, {
				applicationStatus: "idle",
			});
			await startService(input.appName);
			await updatePostgresById(input.postgresId, {
				applicationStatus: "done",
			});
			return true;
		}),
	update: protectedProcedure
		.input(apiUpdatePostgres)
		.mutation(async ({ input }) => {
			const { postgresId, ...rest } = input;
			const service = await updatePostgresById(postgresId, {
				...rest,
			});

			if (!service) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Update: Error to update postgres",
				});
			}

			return true;
		}),
});
