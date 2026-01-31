import { IS_CLOUD } from "@dokploy/server/constants";
import { member, ssoProvider } from "@dokploy/server/db/schema";
import { ssoProviderBodySchema } from "@dokploy/server/db/schema/sso";
import { auth } from "@dokploy/server/lib/auth";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import {
	createTRPCRouter,
	enterpriseProcedure,
	publicProcedure,
} from "@/server/api/trpc";
import { db } from "@/server/db";

function requestToHeaders(req: {
	headers?: Record<string, string | string[] | undefined>;
}): Headers {
	const headers = new Headers();
	if (req?.headers) {
		for (const [key, value] of Object.entries(req.headers)) {
			if (value !== undefined && key.toLowerCase() !== "host") {
				headers.set(key, Array.isArray(value) ? value.join(", ") : value);
			}
		}
	}
	return headers;
}

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
			where: eq(ssoProvider.organizationId, ctx.session.activeOrganizationId),
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
						eq(ssoProvider.organizationId, ctx.session.activeOrganizationId),
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
	register: enterpriseProcedure
		.input(ssoProviderBodySchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.activeOrganizationId;

			const result = await auth.registerSSOProvider({
				body: {
					...input,
					organizationId,
				},
				headers: requestToHeaders(ctx.req),
			});
			console.log(result);

			return { success: true };
		}),
});
