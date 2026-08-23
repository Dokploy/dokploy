import {
	checkServerResources,
	completeMigration,
	createServiceMigration,
	failMigration,
	findMigrationsByServiceId,
	findServiceMigrationById,
	migrateApplication,
	updateServiceMigration,
	validateTargetServer,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const serviceMigrationRouter = createTRPCRouter({
	// Create a new migration job
	create: protectedProcedure
		.input(
			z.object({
				serviceId: z.string(),
				serviceType: z.enum([
					"application",
					"postgres",
					"mysql",
					"mariadb",
					"mongo",
					"redis",
					"compose",
				]),
				serviceName: z.string(),
				targetServerId: z.string(),
				initiatedBy: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			// For now, only support application migrations
			if (input.serviceType !== "application") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Only application migrations are currently supported",
				});
			}

			const migration = await createServiceMigration({
				...input,
				initiatedBy: input.initiatedBy || ctx.user.id,
			});

			// Start migration asynchronously
			migrateApplication(
				input.serviceId,
				input.targetServerId,
				migration.migrationId,
			).catch((error) => {
				console.error("Migration failed:", error);
			});

			return migration;
		}),

	// Get migration by ID
	one: protectedProcedure
		.input(
			z.object({
				migrationId: z.string(),
			}),
		)
		.query(async ({ input }) => {
			return await findServiceMigrationById(input.migrationId);
		}),

	// Get all migrations for a service
	byServiceId: protectedProcedure
		.input(
			z.object({
				serviceId: z.string(),
			}),
		)
		.query(async ({ input }) => {
			return await findMigrationsByServiceId(input.serviceId);
		}),

	// Validate target server
	validateServer: protectedProcedure
		.input(
			z.object({
				serverId: z.string(),
			}),
		)
		.query(async ({ input }) => {
			const validation = await validateTargetServer(input.serverId);
			const resources = validation.valid
				? await checkServerResources(input.serverId)
				: null;

			return {
				...validation,
				resources,
			};
		}),

	// Cancel a migration
	cancel: protectedProcedure
		.input(
			z.object({
				migrationId: z.string(),
			}),
		)
		.mutation(async ({ input }) => {
			const migration = await findServiceMigrationById(input.migrationId);

			if (migration.status === "completed" || migration.status === "failed") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Cannot cancel a completed or failed migration",
				});
			}

			await failMigration(input.migrationId, "Cancelled by user");

			return { success: true };
		}),

	// Retry a failed migration
	retry: protectedProcedure
		.input(
			z.object({
				migrationId: z.string(),
			}),
		)
		.mutation(async ({ input }) => {
			const migration = await findServiceMigrationById(input.migrationId);

			if (migration.status !== "failed") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Can only retry failed migrations",
				});
			}

			// Reset migration status
			await updateServiceMigration(input.migrationId, {
				status: "pending",
				errorMessage: null,
				completedAt: null,
			});

			// Restart migration
			migrateApplication(
				migration.serviceId,
				migration.targetServerId,
				migration.migrationId,
			).catch((error) => {
				console.error("Migration retry failed:", error);
			});

			return { success: true };
		}),
});
