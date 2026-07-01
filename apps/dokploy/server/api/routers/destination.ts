import {
	createDestination,
	execAsync,
	execAsyncRemote,
	findDestinationById,
	getAccessibleServerIds,
	IS_CLOUD,
	removeDestinationById,
	updateDestinationById,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import {
	buildRcloneS3Command,
	getRcloneS3Destination,
} from "@dokploy/server/utils/backups/utils";
import { assertDestinationEndpointAllowed } from "@dokploy/server/utils/destination/endpoint";
import {
	isRedactedSecretValue,
	redactSecretFields,
	redactSecretFieldsList,
} from "@dokploy/server/utils/security/redaction";
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

const assertDestinationServerAccess = async (
	ctx: { session: Parameters<typeof getAccessibleServerIds>[0] },
	serverId?: string,
) => {
	if (!serverId) {
		return;
	}

	const accessibleIds = await getAccessibleServerIds(ctx.session);
	if (!accessibleIds.has(serverId)) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this server",
		});
	}
};

const normalizeDestinationEndpointInput = async <
	T extends { endpoint: string },
>(
	input: T,
) => ({
	...input,
	endpoint: await assertDestinationEndpointAllowed(input.endpoint, {
		allowPrivateNetwork: !IS_CLOUD,
		fieldName: "S3 endpoint",
	}),
});

export const destinationRouter = createTRPCRouter({
	create: withPermission("destination", "create")
		.input(apiCreateDestination)
		.mutation(async ({ input, ctx }) => {
			try {
				const destinationInput = await normalizeDestinationEndpointInput(input);
				const result = await createDestination(
					destinationInput,
					ctx.session.activeOrganizationId,
				);
				await audit(ctx, {
					action: "create",
					resourceType: "destination",
					resourceId: result.destinationId,
					resourceName: input.name,
				});
				return redactSecretFields(result, ["secretAccessKey"]);
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
			if (IS_CLOUD && !input.serverId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Server not found",
				});
			}
			if (IS_CLOUD) {
				await assertDestinationServerAccess(ctx, input.serverId);
			}

			try {
				const destinationInput = await normalizeDestinationEndpointInput(input);
				const rcloneCommand = buildRcloneS3Command("ls", destinationInput, [
					"--retries",
					"1",
					"--low-level-retries",
					"1",
					"--timeout",
					"10s",
					"--contimeout",
					"5s",
					getRcloneS3Destination(destinationInput),
				]);

				if (IS_CLOUD) {
					await execAsyncRemote(destinationInput.serverId || "", rcloneCommand);
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
			return redactSecretFields(destination, ["secretAccessKey"]);
		}),
	all: withPermission("destination", "read").query(async ({ ctx }) => {
		const destinationList = await db.query.destinations.findMany({
			where: eq(destinations.organizationId, ctx.session.activeOrganizationId),
			orderBy: [desc(destinations.createdAt)],
		});
		return redactSecretFieldsList(destinationList, ["secretAccessKey"]);
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
				return redactSecretFields(result, ["secretAccessKey"]);
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
				const secretAccessKey = isRedactedSecretValue(input.secretAccessKey)
					? destination.secretAccessKey
					: input.secretAccessKey;
				const destinationInput = await normalizeDestinationEndpointInput(input);
				const result = await updateDestinationById(input.destinationId, {
					...destinationInput,
					secretAccessKey,
					organizationId: ctx.session.activeOrganizationId,
				});
				await audit(ctx, {
					action: "update",
					resourceType: "destination",
					resourceId: input.destinationId,
					resourceName: input.name,
				});
				return redactSecretFields(result, ["secretAccessKey"]);
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
