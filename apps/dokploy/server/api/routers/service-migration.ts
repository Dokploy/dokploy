import {
	checkServerResources,
	findApplicationById,
	createServiceMigration,
	failMigration,
	findMigrationsByServiceId,
	findServiceMigrationById,
	findServerById,
	getAccessibleServerIds,
	migrateApplication,
	updateServiceMigration,
	validateTargetServer,
} from "@dokploy/server";
import {
	checkServicePermissionAndAccess,
} from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const assertCanAccessServer = async (
	ctx: Parameters<typeof checkServicePermissionAndAccess>[0],
	serverId: string,
) => {
	const server = await findServerById(serverId);
	if (server.organizationId !== ctx.session.activeOrganizationId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this server",
		});
	}

	const accessibleIds = await getAccessibleServerIds(ctx.session);
	if (!accessibleIds.has(serverId)) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this server",
		});
	}
};

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

			await checkServicePermissionAndAccess(ctx, input.serviceId, {
				deployment: ["create"],
			});
			await assertCanAccessServer(ctx, input.targetServerId);

			const application = await findApplicationById(input.serviceId);
			if (application.serverId) {
				await assertCanAccessServer(ctx, application.serverId);
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
		.query(async ({ input, ctx }) => {
			const migration = await findServiceMigrationById(input.migrationId);
			await checkServicePermissionAndAccess(ctx, migration.serviceId, {
				deployment: ["create"],
			});
			return migration;
		}),

	// Get all migrations for a service
	byServiceId: protectedProcedure
		.input(
			z.object({
				serviceId: z.string(),
			}),
		)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.serviceId, {
				deployment: ["create"],
			});
			return await findMigrationsByServiceId(input.serviceId);
		}),

	// Validate target server
	validateServer: protectedProcedure
		.input(
			z.object({
				serverId: z.string(),
			}),
		)
		.query(async ({ input, ctx }) => {
			await assertCanAccessServer(ctx, input.serverId);
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
		.mutation(async ({ input, ctx }) => {
			const migration = await findServiceMigrationById(input.migrationId);
			await checkServicePermissionAndAccess(ctx, migration.serviceId, {
				deployment: ["create"],
			});

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
		.mutation(async ({ input, ctx }) => {
			const migration = await findServiceMigrationById(input.migrationId);
			await checkServicePermissionAndAccess(ctx, migration.serviceId, {
				deployment: ["create"],
			});

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
