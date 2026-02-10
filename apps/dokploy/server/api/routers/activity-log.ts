import {
	getActivityLogs,
	apiFindAllActivityLogsSchema,
	purgeActivityLogs,
	apiPurgeActivityLogsSchema,
} from "@dokploy/server";
import {
	createTRPCRouter,
	protectedProcedure,
	adminProcedure,
} from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";

export const activityLogRouter = createTRPCRouter({
	all: protectedProcedure
		.input(apiFindAllActivityLogsSchema)
		.query(async ({ input, ctx }) => {
			const organizationId = input.organizationId || ctx.session.activeOrganizationId;

			// Security check: ensure user is part of the organization
			if (organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this organization's logs",
				});
			}

			try {
				const logs = await getActivityLogs({
					...input,
					organizationId,
				});
				return logs;
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Error fetching activity logs",
					cause: error,
				});
			}
		}),
	purge: adminProcedure
		.input(apiPurgeActivityLogsSchema)
		.mutation(async ({ input, ctx }) => {
			const organizationId = input.organizationId || ctx.session.activeOrganizationId;

			try {
				const deletedCount = await purgeActivityLogs({
					...input,
					organizationId,
				});
				return { deletedCount };
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Error purging activity logs",
					cause: error,
				});
			}
		}),
});
