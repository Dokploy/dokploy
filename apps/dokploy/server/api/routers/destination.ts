import {
	createDestination,
	execAsync,
	execAsyncRemote,
	findDestinationById,
	findServerById,
	getRclonePathAndFlags,
	IS_CLOUD,
	removeDestinationById,
	updateDestinationById,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { redactRcloneCredentials } from "@dokploy/server/utils/backups/redact";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { quote } from "shell-quote";
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
		.input(apiCreateDestination)
		.mutation(async ({ input, ctx }) => {
			try {
				const { flags, path } = await getRclonePathAndFlags(
					input as Parameters<typeof getRclonePathAndFlags>[0],
				);
				const rcloneFlags = [
					...flags,
					"--retries 1",
					"--low-level-retries 1",
					"--timeout 10s",
					"--contimeout 5s",
				];
				const rcloneCommand = `rclone lsd ${rcloneFlags.join(" ")} ${quote([path])}`;

				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Server not found",
					});
				}

				if (IS_CLOUD) {
					const server = await findServerById(input.serverId || "");
					if (server.organizationId !== ctx.session.activeOrganizationId) {
						throw new TRPCError({
							code: "UNAUTHORIZED",
							message: "You are not allowed to use this server",
						});
					}
					await execAsyncRemote(input.serverId || "", rcloneCommand);
				} else {
					await execAsync(rcloneCommand);
				}
			} catch (error) {
				const safeMessage =
					error instanceof Error
						? redactRcloneCredentials(error.message)
						: "Error connecting to destination";
				throw new TRPCError({
					code: error instanceof TRPCError ? error.code : "BAD_REQUEST",
					message: safeMessage,
					cause: new Error(safeMessage),
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
							? redactRcloneCredentials(error.message)
							: "Error updating destination",
					cause: error,
				});
			}
		}),
});
