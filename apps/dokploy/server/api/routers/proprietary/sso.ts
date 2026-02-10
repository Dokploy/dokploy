import { normalizeTrustedOrigin } from "@dokploy/server";
import { IS_CLOUD } from "@dokploy/server/constants";
import { member, ssoProvider, user } from "@dokploy/server/db/schema";
import { ssoProviderBodySchema } from "@dokploy/server/db/schema/sso";
import { requestToHeaders } from "@dokploy/server/index";
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
			where: and(
				eq(ssoProvider.organizationId, ctx.session.activeOrganizationId),
				eq(ssoProvider.userId, ctx.session.userId),
			),
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
			// Obtener el provider antes de eliminarlo para obtener sus dominios
			const providerToDelete = await db.query.ssoProvider.findFirst({
				where: and(
					eq(ssoProvider.providerId, input.providerId),
					eq(ssoProvider.organizationId, ctx.session.activeOrganizationId),
					eq(ssoProvider.userId, ctx.session.userId),
				),
				columns: {
					id: true,
					domain: true,
					issuer: true,
				},
			});

			if (!providerToDelete) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message:
						"SSO provider not found or you do not have permission to delete it",
				});
			}

			const [deleted] = await db
				.delete(ssoProvider)
				.where(
					and(
						eq(ssoProvider.providerId, input.providerId),
						eq(ssoProvider.organizationId, ctx.session.activeOrganizationId),
						eq(ssoProvider.userId, ctx.session.userId),
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

			const currentUser = await db.query.user.findFirst({
				where: eq(user.id, ctx.session.userId),
				columns: {
					trustedOrigins: true,
				},
			});

			if (currentUser?.trustedOrigins) {
				const issuerOrigin = normalizeTrustedOrigin(providerToDelete.issuer);
				const updatedOrigins = currentUser.trustedOrigins.filter(
					(origin) => origin.toLowerCase() !== issuerOrigin.toLowerCase(),
				);

				await db
					.update(user)
					.set({ trustedOrigins: updatedOrigins })
					.where(eq(user.id, ctx.session.userId));
			}
			return { success: true };
		}),
	register: enterpriseProcedure
		.input(ssoProviderBodySchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.activeOrganizationId;

			const providers = await db.query.ssoProvider.findMany({
				columns: {
					domain: true,
				},
			});

			for (const provider of providers) {
				const providerDomains = provider.domain
					.split(",")
					.map((d) => d.trim().toLowerCase());
				for (const domain of input.domains) {
					if (providerDomains.includes(domain)) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: `Domain ${domain} is already registered for another provider`,
						});
					}
				}
			}
			const domain = input.domains.join(",");
			const currentUser = await db.query.user.findFirst({
				where: eq(user.id, ctx.session.userId),
				columns: {
					trustedOrigins: true,
				},
			});

			const existingOrigins = currentUser?.trustedOrigins || [];

			const issuerOrigin = normalizeTrustedOrigin(input.issuer);

			const newOrigins = Array.from(
				new Set([...existingOrigins, issuerOrigin]),
			);

			await db
				.update(user)
				.set({ trustedOrigins: newOrigins })
				.where(eq(user.id, ctx.session.userId));

			await auth.registerSSOProvider({
				body: {
					...input,
					organizationId,
					domain,
				},
				headers: requestToHeaders(ctx.req),
			});
			return { success: true };
		}),
});
