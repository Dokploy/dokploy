import {
	createDestination,
	execAsync,
	execAsyncRemote,
	findDestinationById,
	getDestinationAdapter,
	IS_CLOUD,
	removeDestinationById,
	updateDestinationById,
	apiCreateAnyDestination,
	apiUpdateAnyDestination,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { createTRPCRouter, withPermission } from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiFindOneDestination,
	apiRemoveDestination,
	destinations,
} from "@/server/db/schema";

export const destinationRouter = createTRPCRouter({
	create: withPermission("destination", "create")
		.input(apiCreateAnyDestination)
		.mutation(async ({ input, ctx }) => {
			try {
				const adapter = getDestinationAdapter(input.type);
				const credentials = adapter.extractCredentials(input as never);
				const result = await createDestination(
					{
						...input,
						credentials,
					},
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
		.input(apiCreateAnyDestination)
		.mutation(async ({ input }) => {
			try {
				const adapter = getDestinationAdapter(input.type);
				const rcloneCommand = adapter.testCommand(input as never);

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
	all: withPermission("destination", "read").query(async ({ ctx }) => {
		return await db.query.destinations.findMany({
			where: eq(destinations.organizationId, ctx.session.activeOrganizationId),
			orderBy: [desc(destinations.createdAt)],
		});
	}),
	remove: withPermission("destination", "delete")
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
		.input(apiUpdateAnyDestination)
		.mutation(async ({ input, ctx }) => {
			try {
				const destination = await findDestinationById(input.destinationId);
				if (destination.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to update this destination",
					});
				}
				
				if (destination.type !== input.type) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Destination type cannot be changed",
					});
				}

				const adapter = getDestinationAdapter(destination.type);
				const credentials = adapter.extractCredentials(input as never);
				const existingCredentials =
					typeof destination.credentials === "object" && destination.credentials
						? destination.credentials
						: {};
				
				const result = await updateDestinationById(input.destinationId, {
					...input,
					credentials: {
						...existingCredentials,
						...credentials,
					},
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
