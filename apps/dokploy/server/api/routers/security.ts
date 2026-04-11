import {
	createSecurity,
	deleteSecurityById,
	findSecurityById,
	updateSecurityById,
} from "@dokploy/server";
import { checkServicePermissionAndAccess } from "@dokploy/server/services/permission";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateSecurity,
	apiFindOneSecurity,
	apiUpdateSecurity,
} from "@/server/db/schema";

export const securityRouter = createTRPCRouter({
	create: protectedProcedure
		.meta({
			openapi: {
				summary: "Create a security entry",
				description: "Creates a new HTTP basic auth security entry for an application with the provided username and password. Logs an audit entry.",
			},
		})
		.input(apiCreateSecurity)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				service: ["create"],
			});
			await createSecurity(input);
			await audit(ctx, {
				action: "create",
				resourceType: "security",
				resourceId: input.applicationId,
				resourceName: input.username,
			});
			return true;
		}),

	one: protectedProcedure
		.meta({
			openapi: {
				summary: "Get a security entry",
				description: "Returns a single HTTP basic auth security entry by its ID.",
			},
		})
		.input(apiFindOneSecurity)
		.query(async ({ input, ctx }) => {
			const security = await findSecurityById(input.securityId);
			await checkServicePermissionAndAccess(ctx, security.applicationId, {
				service: ["read"],
			});
			return security;
		}),

	delete: protectedProcedure
		.meta({
			openapi: {
				summary: "Delete a security entry",
				description: "Deletes an HTTP basic auth security entry by its ID and logs an audit entry.",
			},
		})
		.input(apiFindOneSecurity)
		.mutation(async ({ input, ctx }) => {
			const security = await findSecurityById(input.securityId);
			await checkServicePermissionAndAccess(ctx, security.applicationId, {
				service: ["delete"],
			});
			const result = await deleteSecurityById(input.securityId);
			await audit(ctx, {
				action: "delete",
				resourceType: "security",
				resourceId: input.securityId,
			});
			return result;
		}),

	update: protectedProcedure
		.meta({
			openapi: {
				summary: "Update a security entry",
				description: "Updates an existing HTTP basic auth security entry's configuration and logs an audit entry.",
			},
		})
		.input(apiUpdateSecurity)
		.mutation(async ({ input, ctx }) => {
			const security = await findSecurityById(input.securityId);
			await checkServicePermissionAndAccess(ctx, security.applicationId, {
				service: ["create"],
			});
			const result = await updateSecurityById(input.securityId, input);
			await audit(ctx, {
				action: "update",
				resourceType: "security",
				resourceId: input.securityId,
			});
			return result;
		}),
});
