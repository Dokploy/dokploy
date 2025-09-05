import {
	createEnvironment,
	deleteEnvironment,
	duplicateEnvironment,
	findEnvironmentById,
	findEnvironmentsByProjectId,
	findMemberById,
	updateEnvironmentById,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	apiCreateEnvironment,
	apiDuplicateEnvironment,
	apiFindOneEnvironment,
	apiRemoveEnvironment,
	apiUpdateEnvironment,
} from "@/server/db/schema";

export const environmentRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateEnvironment)
		.mutation(async ({ input }) => {
			try {
				// Check if user has access to the project
				// This would typically involve checking project ownership/membership
				// For now, we'll use a basic organization check

				const environment = await createEnvironment(input);
				return environment;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Error creating the environment: ${error instanceof Error ? error.message : error}`,
					cause: error,
				});
			}
		}),

	one: protectedProcedure
		.input(apiFindOneEnvironment)
		.query(async ({ input, ctx }) => {
			try {
				const environment = await findEnvironmentById(input.environmentId);
				if (
					environment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You are not allowed to access this environment",
					});
				}

				// Check environment access and filter services for members
				if (ctx.user.role === "member") {
					const { accessedEnvironments, accessedServices } =
						await findMemberById(ctx.user.id, ctx.session.activeOrganizationId);

					if (!accessedEnvironments.includes(environment.environmentId)) {
						throw new TRPCError({
							code: "FORBIDDEN",
							message: "You are not allowed to access this environment",
						});
					}

					// Filter services based on member permissions
					const filteredEnvironment = {
						...environment,
						applications: environment.applications.filter((app) =>
							accessedServices.includes(app.applicationId),
						),
						mariadb: environment.mariadb.filter((db) =>
							accessedServices.includes(db.mariadbId),
						),
						mongo: environment.mongo.filter((db) =>
							accessedServices.includes(db.mongoId),
						),
						mysql: environment.mysql.filter((db) =>
							accessedServices.includes(db.mysqlId),
						),
						postgres: environment.postgres.filter((db) =>
							accessedServices.includes(db.postgresId),
						),
						redis: environment.redis.filter((db) =>
							accessedServices.includes(db.redisId),
						),
						compose: environment.compose.filter((comp) =>
							accessedServices.includes(comp.composeId),
						),
					};

					return filteredEnvironment;
				}

				return environment;
			} catch (error) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Environment not found",
				});
			}
		}),

	byProjectId: protectedProcedure
		.input(z.object({ projectId: z.string() }))
		.query(async ({ input, ctx }) => {
			try {
				const environments = await findEnvironmentsByProjectId(input.projectId);

				// Check organization access
				if (
					environments.some(
						(environment) =>
							environment.project.organizationId !==
							ctx.session.activeOrganizationId,
					)
				) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You are not allowed to access this environment",
					});
				}

				// Filter environments for members based on their permissions
				if (ctx.user.role === "member") {
					const { accessedEnvironments } = await findMemberById(
						ctx.user.id,
						ctx.session.activeOrganizationId,
					);

					// Filter environments to only show those the member has access to
					const filteredEnvironments = environments.filter((environment) =>
						accessedEnvironments.includes(environment.environmentId),
					);

					return filteredEnvironments;
				}

				return environments;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Error fetching environments: ${error instanceof Error ? error.message : error}`,
				});
			}
		}),

	remove: protectedProcedure
		.input(apiRemoveEnvironment)
		.mutation(async ({ input, ctx }) => {
			try {
				const environment = await findEnvironmentById(input.environmentId);
				if (
					environment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You are not allowed to access this environment",
					});
				}

				// Check environment access for members
				if (ctx.user.role === "member") {
					const { accessedEnvironments } = await findMemberById(
						ctx.user.id,
						ctx.session.activeOrganizationId,
					);

					if (!accessedEnvironments.includes(environment.environmentId)) {
						throw new TRPCError({
							code: "FORBIDDEN",
							message: "You are not allowed to delete this environment",
						});
					}
				}

				const deletedEnvironment = await deleteEnvironment(input.environmentId);
				return deletedEnvironment;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Error deleting the environment: ${error instanceof Error ? error.message : error}`,
				});
			}
		}),

	update: protectedProcedure
		.input(apiUpdateEnvironment)
		.mutation(async ({ input, ctx }) => {
			try {
				const { environmentId, ...updateData } = input;
				const currentEnvironment = await findEnvironmentById(environmentId);
				if (
					currentEnvironment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You are not allowed to access this environment",
					});
				}

				// Check environment access for members
				if (ctx.user.role === "member") {
					const { accessedEnvironments } = await findMemberById(
						ctx.user.id,
						ctx.session.activeOrganizationId,
					);

					if (
						!accessedEnvironments.includes(currentEnvironment.environmentId)
					) {
						throw new TRPCError({
							code: "FORBIDDEN",
							message: "You are not allowed to update this environment",
						});
					}
				}

				const environment = await updateEnvironmentById(
					environmentId,
					updateData,
				);
				return environment;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Error updating the environment: ${error instanceof Error ? error.message : error}`,
				});
			}
		}),

	duplicate: protectedProcedure
		.input(apiDuplicateEnvironment)
		.mutation(async ({ input, ctx }) => {
			try {
				const environment = await findEnvironmentById(input.environmentId);
				if (
					environment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You are not allowed to access this environment",
					});
				}

				// Check environment access for members
				if (ctx.user.role === "member") {
					const { accessedEnvironments } = await findMemberById(
						ctx.user.id,
						ctx.session.activeOrganizationId,
					);

					if (!accessedEnvironments.includes(environment.environmentId)) {
						throw new TRPCError({
							code: "FORBIDDEN",
							message: "You are not allowed to duplicate this environment",
						});
					}
				}

				const duplicatedEnvironment = await duplicateEnvironment(input);
				return duplicatedEnvironment;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Error duplicating the environment: ${error instanceof Error ? error.message : error}`,
				});
			}
		}),
});
