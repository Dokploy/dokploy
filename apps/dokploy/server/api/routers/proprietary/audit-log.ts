import { getAuditLogs } from "@dokploy/server/services/proprietary/audit-log";
import { hasValidLicense } from "@dokploy/server/services/proprietary/license-key";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, withPermission } from "../../trpc";

const MAX_EXPORT_ROWS = 10_000;

const auditLogFiltersSchema = z.object({
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
			"download",
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
});

const licensedAuditLogProcedure = withPermission("auditLog", "read").use(
	async ({ ctx, next }) => {
		const licensed = await hasValidLicense(ctx.session.activeOrganizationId);
		if (!licensed) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "Valid enterprise license required",
			});
		}
		return next();
	},
);

export const auditLogRouter = createTRPCRouter({
	all: licensedAuditLogProcedure
		.input(
			auditLogFiltersSchema.extend({
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
	export: licensedAuditLogProcedure
		.input(auditLogFiltersSchema)
		.query(async ({ ctx, input }) => {
			return getAuditLogs({
				organizationId: ctx.session.activeOrganizationId,
				...input,
				limit: MAX_EXPORT_ROWS,
			});
		}),
});
