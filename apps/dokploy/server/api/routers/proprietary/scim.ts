import { db } from "@dokploy/server/db";
import { scimProvider } from "@dokploy/server/db/schema";
import { requestToHeaders } from "@dokploy/server/index";
import { auth } from "@dokploy/server/lib/auth";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, enterpriseProcedure } from "@/server/api/trpc";

const providerIdSchema = z
	.string()
	.min(1)
	.max(64)
	.regex(
		/^[a-z0-9][a-z0-9-]*$/,
		"Provider ID must be lowercase alphanumeric with optional dashes",
	);

export const scimRouter = createTRPCRouter({
	listProviders: enterpriseProcedure.query(async ({ ctx }) => {
		const providers = await db.query.scimProvider.findMany({
			where: eq(scimProvider.organizationId, ctx.session.activeOrganizationId),
			columns: {
				id: true,
				providerId: true,
				organizationId: true,
			},
			orderBy: [asc(scimProvider.providerId)],
		});
		return providers;
	}),
	generateToken: enterpriseProcedure
		.input(z.object({ providerId: providerIdSchema }))
		.mutation(async ({ ctx, input }) => {
			const existing = await db.query.scimProvider.findFirst({
				where: eq(scimProvider.providerId, input.providerId),
				columns: { id: true, organizationId: true },
			});
			if (existing) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "A SCIM provider with this ID already exists",
				});
			}
			const result = await auth.generateSCIMToken({
				body: {
					providerId: input.providerId,
					organizationId: ctx.session.activeOrganizationId,
				},
				headers: requestToHeaders(ctx.req),
			});
			return { scimToken: result.scimToken, providerId: input.providerId };
		}),
	deleteProvider: enterpriseProcedure
		.input(z.object({ providerId: providerIdSchema }))
		.mutation(async ({ ctx, input }) => {
			const [deleted] = await db
				.delete(scimProvider)
				.where(
					and(
						eq(scimProvider.providerId, input.providerId),
						eq(
							scimProvider.organizationId,
							ctx.session.activeOrganizationId,
						),
					),
				)
				.returning({ id: scimProvider.id });
			if (!deleted) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message:
						"SCIM provider not found or you do not have permission to delete it",
				});
			}
			return { success: true };
		}),
});
