import { IS_CLOUD } from "@dokploy/server/constants";
import { member, ssoProvider } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import {
	createTRPCRouter,
	enterpriseProcedure,
	publicProcedure,
} from "@/server/api/trpc";
import { db } from "@/server/db";

export const ssoRouter = createTRPCRouter({
	showSignInWithSSO: publicProcedure.query(async () => {
		if (IS_CLOUD) {
			return true;
		}
		const owner = await db.query.member.findFirst({
			where: eq(member.role, "owner"),
			with: {
				user: {
					columns: {
						enableEnterpriseFeatures: true,
						isValidEnterpriseLicense: true,
					},
				},
			},
			orderBy: [asc(member.createdAt)],
		});

		if (!owner) {
			return false;
		}

		return (
			owner.user.enableEnterpriseFeatures && owner.user.isValidEnterpriseLicense
		);
	}),
	listProviders: enterpriseProcedure.query(async ({ ctx }) => {
		const providers = await db.query.ssoProvider.findMany({
			where: eq(ssoProvider.userId, ctx.user.id),
			columns: {
				id: true,
				providerId: true,
				issuer: true,
				domain: true,
				oidcConfig: true,
				samlConfig: true,
				organizationId: true,
			},
		});
		return providers;
	}),
	deleteProvider: enterpriseProcedure
		.input(z.object({ providerId: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const [deleted] = await db
				.delete(ssoProvider)
				.where(
					and(
						eq(ssoProvider.providerId, input.providerId),
						eq(ssoProvider.userId, ctx.user.id),
					),
				)
				.returning({ id: ssoProvider.id });

			if (!deleted) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message:
						"SSO provider not found or you do not have permission to delete it",
				});
			}

			return { success: true };
		}),
});
