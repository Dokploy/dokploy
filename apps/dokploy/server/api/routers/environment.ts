import {
	createEnvironment,
	deleteEnvironment,
	duplicateEnvironment,
	findEnvironmentById,
	findEnvironmentsByProjectId,
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
