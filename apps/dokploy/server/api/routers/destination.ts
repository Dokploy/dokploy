import {
	createDestintation,
	execAsync,
	execAsyncRemote,
	findDestinationById,
	IS_CLOUD,
	removeDestinationById,
	updateDestinationById,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateDestination,
	apiFindOneDestination,
	apiRemoveDestination,
	apiUpdateDestination,
	destinations,
	member,
} from "@/server/db/schema";

// Helper function to check destination access permissions
const checkDestinationPermission = async (
	userId: string,
	organizationId: string,
) => {
	const memberResult = await db.query.member.findFirst({
		where: and(
			eq(member.userId, userId),
			eq(member.organizationId, organizationId),
		),
	});

	return memberResult?.canAccessToDestinations || false;
};

export const destinationRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateDestination)
		.mutation(async ({ input, ctx }) => {
			// Check if user has permission to access destinations
			if (ctx.user.role !== "owner") {
				const hasPermission = await checkDestinationPermission(
					ctx.user.id,
					ctx.session.activeOrganizationId,
				);
				if (!hasPermission) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You don't have permission to access destinations",
					});
				}
			}

			try {
				return await createDestintation(
					input,
					ctx.session.activeOrganizationId,
				);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the destination",
					cause: error,
				});
			}
		}),
	testConnection: protectedProcedure
		.input(apiCreateDestination)
		.mutation(async ({ input, ctx }) => {
			// Check if user has permission to access destinations
			if (ctx.user.role !== "owner") {
				const hasPermission = await checkDestinationPermission(
					ctx.user.id,
					ctx.session.activeOrganizationId,
				);
				if (!hasPermission) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You don't have permission to access destinations",
					});
				}
			}
			const { secretAccessKey, bucket, region, endpoint, accessKey, provider } =
				input;
			try {
				const rcloneFlags = [
					`--s3-access-key-id=${accessKey}`,
					`--s3-secret-access-key=${secretAccessKey}`,
					`--s3-region=${region}`,
					`--s3-endpoint=${endpoint}`,
					"--s3-no-check-bucket",
					"--s3-force-path-style",
				];
				if (provider) {
					rcloneFlags.unshift(`--s3-provider=${provider}`);
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
	one: protectedProcedure
		.input(apiFindOneDestination)
		.query(async ({ input, ctx }) => {
			// Check if user has permission to access destinations
			if (ctx.user.role !== "owner") {
				const hasPermission = await checkDestinationPermission(
					ctx.user.id,
					ctx.session.activeOrganizationId,
				);
				if (!hasPermission) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You don't have permission to access destinations",
					});
				}
			}
			const destination = await findDestinationById(input.destinationId);
			if (destination.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this destination",
				});
			}
			return destination;
		}),
	all: protectedProcedure.query(async ({ ctx }) => {
		// Check if user has permission to access destinations
		if (ctx.user.role !== "owner") {
			const hasPermission = await checkDestinationPermission(
				ctx.user.id,
				ctx.session.activeOrganizationId,
			);
			if (!hasPermission) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You don't have permission to access destinations",
				});
			}
		}
		return await db.query.destinations.findMany({
			where: eq(destinations.organizationId, ctx.session.activeOrganizationId),
			orderBy: [desc(destinations.createdAt)],
		});
	}),
	remove: protectedProcedure
		.input(apiRemoveDestination)
		.mutation(async ({ input, ctx }) => {
			// Check if user has permission to access destinations
			if (ctx.user.role !== "owner") {
				const hasPermission = await checkDestinationPermission(
					ctx.user.id,
					ctx.session.activeOrganizationId,
				);
				if (!hasPermission) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You don't have permission to access destinations",
					});
				}
			}
			try {
				const destination = await findDestinationById(input.destinationId);

				if (destination.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to delete this destination",
					});
				}
				return await removeDestinationById(
					input.destinationId,
					ctx.session.activeOrganizationId,
				);
			} catch (error) {
				throw error;
			}
		}),
	update: protectedProcedure
		.input(apiUpdateDestination)
		.mutation(async ({ input, ctx }) => {
			// Check if user has permission to access destinations
			if (ctx.user.role !== "owner") {
				const hasPermission = await checkDestinationPermission(
					ctx.user.id,
					ctx.session.activeOrganizationId,
				);
				if (!hasPermission) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You don't have permission to access destinations",
					});
				}
			}
			try {
				const destination = await findDestinationById(input.destinationId);
				if (destination.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to update this destination",
					});
				}
				return await updateDestinationById(input.destinationId, {
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
			} catch (error) {
				throw error;
			}
		}),
});
