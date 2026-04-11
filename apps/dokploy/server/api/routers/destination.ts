import {
	createDestination,
	execAsync,
	execAsyncRemote,
	findDestinationById,
	IS_CLOUD,
	removeDestinationById,
	updateDestinationById,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { createTRPCRouter, withPermission } from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateDestination,
	apiFindOneDestination,
	apiRemoveDestination,
	apiUpdateDestination,
	destinations,
} from "@/server/db/schema";

export const destinationRouter = createTRPCRouter({
	create: withPermission("destination", "create")
		.meta({
			openapi: {
				summary: "Create backup destination",
				description: "Creates a new S3-compatible backup destination for the current organization and logs an audit event.",
			},
		})
		.input(apiCreateDestination)
		.mutation(async ({ input, ctx }) => {
			try {
				const result = await createDestination(
					input,
					ctx.session.activeOrganizationId,
				);
				await audit(ctx, {
					action: "create",
					resourceType: "destination",
					resourceId: result.destinationId,
					resourceName: input.name,
				});
				return result;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the destination",
					cause: error,
				});
			}
		}),
	testConnection: withPermission("destination", "create")
		.meta({
			openapi: {
				summary: "Test backup destination connection",
				description: "Tests connectivity to an S3-compatible bucket using rclone. Runs locally or on a remote server depending on configuration.",
			},
		})
		.input(apiCreateDestination)
		.mutation(async ({ input }) => {
			const {
				secretAccessKey,
				bucket,
				region,
				endpoint,
				accessKey,
				provider,
				additionalFlags,
			} = input;
			try {
				const rcloneFlags = [
					`--s3-access-key-id="${accessKey}"`,
					`--s3-secret-access-key="${secretAccessKey}"`,
					`--s3-region="${region}"`,
					`--s3-endpoint="${endpoint}"`,
					"--s3-no-check-bucket",
					"--s3-force-path-style",
					"--retries 1",
					"--low-level-retries 1",
					"--timeout 10s",
					"--contimeout 5s",
				];
				if (provider) {
					rcloneFlags.unshift(`--s3-provider="${provider}"`);
				}
				if (additionalFlags?.length) {
					rcloneFlags.push(...additionalFlags);
				}
				const rcloneDestination = `:s3:${bucket}`;
				const rcloneCommand = `rclone ls ${rcloneFlags.join(" ")} "${rcloneDestination}"`;

				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Server not found",
					});
				}

				if (IS_CLOUD) {
					await execAsyncRemote(input.serverId || "", rcloneCommand);
				} else {
					await execAsync(rcloneCommand);
				}
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error?.message
							: "Error connecting to bucket",
					cause: error,
				});
			}
		}),
	one: withPermission("destination", "read")
		.meta({
			openapi: {
				summary: "Get backup destination",
				description: "Returns a single backup destination by ID. Verifies the caller belongs to the same organization.",
			},
		})
		.input(apiFindOneDestination)
		.query(async ({ input, ctx }) => {
			const destination = await findDestinationById(input.destinationId);
			if (destination.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this destination",
				});
			}
			return destination;
		}),
	all: withPermission("destination", "read")
		.meta({
			openapi: {
				summary: "List all backup destinations",
				description: "Returns all S3-compatible backup destinations for the current organization, ordered by creation date descending.",
			},
		})
		.query(async ({ ctx }) => {
		return await db.query.destinations.findMany({
			where: eq(destinations.organizationId, ctx.session.activeOrganizationId),
			orderBy: [desc(destinations.createdAt)],
		});
	}),
	remove: withPermission("destination", "delete")
		.meta({
			openapi: {
				summary: "Delete backup destination",
				description: "Removes a backup destination by ID. Verifies organization ownership and logs an audit event before deletion.",
			},
		})
		.input(apiRemoveDestination)
		.mutation(async ({ input, ctx }) => {
			try {
				const destination = await findDestinationById(input.destinationId);

				if (destination.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to delete this destination",
					});
				}
				const result = await removeDestinationById(
					input.destinationId,
					ctx.session.activeOrganizationId,
				);
				await audit(ctx, {
					action: "delete",
					resourceType: "destination",
					resourceId: input.destinationId,
					resourceName: destination.name,
				});
				return result;
			} catch (error) {
				throw error;
			}
		}),
	update: withPermission("destination", "create")
		.meta({
			openapi: {
				summary: "Update backup destination",
				description: "Updates an existing backup destination. Verifies organization ownership before applying changes and logs an audit event.",
			},
		})
		.input(apiUpdateDestination)
		.mutation(async ({ input, ctx }) => {
			try {
				const destination = await findDestinationById(input.destinationId);
				if (destination.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to update this destination",
					});
				}
				const result = await updateDestinationById(input.destinationId, {
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
				await audit(ctx, {
					action: "update",
					resourceType: "destination",
					resourceId: input.destinationId,
					resourceName: input.name,
				});
				return result;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error?.message
							: "Error connecting to bucket",
					cause: error,
				});
			}
		}),
});
