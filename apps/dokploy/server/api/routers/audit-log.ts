import { getAuditLogs } from "@dokploy/server/services/audit-log";
import { z } from "zod";
import { createTRPCRouter, withPermission } from "../trpc";

export const auditLogRouter = createTRPCRouter({
	all: withPermission("auditLog", "read")
		.input(
			z.object({
				userId: z.string().optional(),
				userEmail: z.string().optional(),
				resourceName: z.string().optional(),
				action: z
					.enum([
						"create",
						"update",
						"delete",
						"deploy",
						"cancel",
						"redeploy",
						"login",
						"logout",
					])
					.optional(),
				resourceType: z
					.enum([
						"project",
						"service",
						"environment",
						"deployment",
						"user",
						"customRole",
						"domain",
						"certificate",
						"registry",
						"server",
						"sshKey",
						"gitProvider",
						"notification",
						"settings",
						"session",
					])
					.optional(),
				from: z.date().optional(),
				to: z.date().optional(),
				limit: z.number().min(1).max(500).default(50),
				offset: z.number().min(0).default(0),
			}),
		)
		.query(async ({ ctx, input }) => {
			return getAuditLogs({
				organizationId: ctx.session.activeOrganizationId,
				...input,
			});
		}),
});
