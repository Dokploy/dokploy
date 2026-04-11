import {
	createPort,
	finPortById,
	removePortById,
	updatePortById,
} from "@dokploy/server";
import { checkServicePermissionAndAccess } from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreatePort,
	apiFindOnePort,
	apiUpdatePort,
} from "@/server/db/schema";

export const portRouter = createTRPCRouter({
	create: protectedProcedure
		.meta({
			openapi: {
				summary: "Create a port",
				description: "Creates a new port mapping for an application, binding a published port to a target port. Logs an audit entry.",
			},
		})
		.input(apiCreatePort)
		.mutation(async ({ input, ctx }) => {
			try {
				await checkServicePermissionAndAccess(ctx, input.applicationId, {
					service: ["create"],
				});
				const port = await createPort(input);
				await audit(ctx, {
					action: "create",
					resourceType: "port",
					resourceId: port.portId,
					resourceName: `${port.publishedPort}:${port.targetPort}`,
				});
				return port;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error input: Inserting port",
					cause: error,
				});
			}
		}),
	one: protectedProcedure
		.meta({
			openapi: {
				summary: "Get a port",
				description: "Returns a single port mapping by its ID, including the associated application details.",
			},
		})
		.input(apiFindOnePort)
		.query(async ({ input, ctx }) => {
			try {
				const port = await finPortById(input.portId);
				await checkServicePermissionAndAccess(
					ctx,
					port.application.applicationId,
					{ service: ["read"] },
				);
				return port;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Port not found",
					cause: error,
				});
			}
		}),
	delete: protectedProcedure
		.meta({
			openapi: {
				summary: "Delete a port",
				description: "Deletes a port mapping by its ID and logs an audit entry with the published and target port details.",
			},
		})
		.input(apiFindOnePort)
		.mutation(async ({ input, ctx }) => {
			const port = await finPortById(input.portId);
			await checkServicePermissionAndAccess(
				ctx,
				port.application.applicationId,
				{ service: ["delete"] },
			);
			try {
				const result = await removePortById(input.portId);
				await audit(ctx, {
					action: "delete",
					resourceType: "port",
					resourceId: port.portId,
					resourceName: `${port.publishedPort}:${port.targetPort}`,
				});
				return result;
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Error input: Deleting port";
				throw new TRPCError({
					code: "BAD_REQUEST",
					message,
				});
			}
		}),
	update: protectedProcedure
		.meta({
			openapi: {
				summary: "Update a port",
				description: "Updates an existing port mapping's configuration and logs an audit entry.",
			},
		})
		.input(apiUpdatePort)
		.mutation(async ({ input, ctx }) => {
			const port = await finPortById(input.portId);
			await checkServicePermissionAndAccess(
				ctx,
				port.application.applicationId,
				{ service: ["create"] },
			);
			try {
				const result = await updatePortById(input.portId, input);
				await audit(ctx, {
					action: "update",
					resourceType: "port",
					resourceId: port.portId,
					resourceName: `${port.publishedPort}:${port.targetPort}`,
				});
				return result;
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Error updating the port";
				throw new TRPCError({
					code: "BAD_REQUEST",
					message,
				});
			}
		}),
});
