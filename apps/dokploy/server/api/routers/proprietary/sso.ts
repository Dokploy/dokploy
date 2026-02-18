import { normalizeTrustedOrigin } from "@dokploy/server";
import { IS_CLOUD } from "@dokploy/server/constants";
import { member, ssoProvider, user } from "@dokploy/server/db/schema";
import { ssoProviderBodySchema } from "@dokploy/server/db/schema/sso";
import {
	getOrganizationOwnerId,
	requestToHeaders,
} from "@dokploy/server/index";
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
			orderBy: [asc(ssoProvider.createdAt)],
		});
		return providers;
	}),
	getTrustedOrigins: enterpriseProcedure.query(async ({ ctx }) => {
		const ownerId = await getOrganizationOwnerId(
			ctx.session.activeOrganizationId,
		);
		if (!ownerId) return [];
		const ownerUser = await db.query.user.findFirst({
			where: eq(user.id, ownerId),
			columns: { trustedOrigins: true },
		});
		return ownerUser?.trustedOrigins ?? [];
	}),
	one: enterpriseProcedure
		.input(z.object({ providerId: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			const provider = await db.query.ssoProvider.findFirst({
				where: and(
					eq(ssoProvider.providerId, input.providerId),
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
			if (!provider) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message:
						"SSO provider not found or you do not have permission to access it",
				});
			}
			return provider;
		}),
	update: enterpriseProcedure
		.input(ssoProviderBodySchema)
		.mutation(async ({ ctx, input }) => {
			const existing = await db.query.ssoProvider.findFirst({
				where: and(
					eq(ssoProvider.providerId, input.providerId),
					eq(ssoProvider.organizationId, ctx.session.activeOrganizationId),
					eq(ssoProvider.userId, ctx.session.userId),
				),
				columns: {
					id: true,
					issuer: true,
					domain: true,
				},
			});

			if (!existing) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message:
						"SSO provider not found or you do not have permission to update it",
				});
			}

			const providers = await db.query.ssoProvider.findMany({
				where: eq(ssoProvider.organizationId, ctx.session.activeOrganizationId),
				columns: { providerId: true, domain: true },
			});

			for (const provider of providers) {
				if (provider.providerId === input.providerId) continue;
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

			const issuerChanged =
				normalizeTrustedOrigin(existing.issuer) !==
				normalizeTrustedOrigin(input.issuer);
			if (issuerChanged) {
				const ownerId = await getOrganizationOwnerId(
					ctx.session.activeOrganizationId,
				);
				if (!ownerId) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Organization owner not found",
					});
				}
				const ownerUser = await db.query.user.findFirst({
					where: eq(user.id, ownerId),
					columns: { trustedOrigins: true },
				});
				const trustedOrigins = ownerUser?.trustedOrigins ?? [];
				const newOrigin = normalizeTrustedOrigin(input.issuer);
				const isInTrustedOrigins = trustedOrigins.some(
					(o) => o.toLowerCase() === newOrigin.toLowerCase(),
				);
				if (!isInTrustedOrigins) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							"The new Issuer URL is not in the organization's trusted origins list. Please add it in Manage origins before saving.",
					});
				}
			}

			const domain = input.domains.join(",");
			const updateBody: {
				issuer: string;
				domain: string;
				oidcConfig?: (typeof input)["oidcConfig"];
				samlConfig?: (typeof input)["samlConfig"];
			} = {
				issuer: input.issuer,
				domain,
			};
			if (input.oidcConfig != null) {
				updateBody.oidcConfig = input.oidcConfig;
			}
			if (input.samlConfig != null) {
				updateBody.samlConfig = input.samlConfig;
			}

			await auth.updateSSOProvider({
				params: { providerId: input.providerId },
				body: updateBody,
				headers: requestToHeaders(ctx.req),
			});
			return { success: true };
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
	addTrustedOrigin: enterpriseProcedure
		.input(z.object({ origin: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const ownerId = await getOrganizationOwnerId(
				ctx.session.activeOrganizationId,
			);
			if (!ownerId) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Organization owner not found",
				});
			}
			const normalized = normalizeTrustedOrigin(input.origin);
			const ownerUser = await db.query.user.findFirst({
				where: eq(user.id, ownerId),
				columns: { trustedOrigins: true },
			});
			const existing = ownerUser?.trustedOrigins || [];
			if (existing.some((o) => o.toLowerCase() === normalized.toLowerCase())) {
				return { success: true };
			}
			const next = Array.from(new Set([...existing, normalized]));
			await db
				.update(user)
				.set({ trustedOrigins: next })
				.where(eq(user.id, ownerId));
			return { success: true };
		}),
	removeTrustedOrigin: enterpriseProcedure
		.input(z.object({ origin: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const ownerId = await getOrganizationOwnerId(
				ctx.session.activeOrganizationId,
			);
			if (!ownerId) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Organization owner not found",
				});
			}
			const normalized = normalizeTrustedOrigin(input.origin);
			const ownerUser = await db.query.user.findFirst({
				where: eq(user.id, ownerId),
				columns: { trustedOrigins: true },
			});
			const existing = ownerUser?.trustedOrigins || [];
			const next = existing.filter(
				(o) => o.toLowerCase() !== normalized.toLowerCase(),
			);
			await db
				.update(user)
				.set({ trustedOrigins: next })
				.where(eq(user.id, ownerId));
			return { success: true };
		}),
	updateTrustedOrigin: enterpriseProcedure
		.input(
			z.object({
				oldOrigin: z.string().min(1),
				newOrigin: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const ownerId = await getOrganizationOwnerId(
				ctx.session.activeOrganizationId,
			);
			if (!ownerId) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Organization owner not found",
				});
			}
			const oldNorm = normalizeTrustedOrigin(input.oldOrigin);
			const newNorm = normalizeTrustedOrigin(input.newOrigin);
			const ownerUser = await db.query.user.findFirst({
				where: eq(user.id, ownerId),
				columns: { trustedOrigins: true },
			});
			const existing = ownerUser?.trustedOrigins || [];
			const next = existing.map((o) =>
				o.toLowerCase() === oldNorm.toLowerCase() ? newNorm : o,
			);
			await db
				.update(user)
				.set({ trustedOrigins: next })
				.where(eq(user.id, ownerId));
			return { success: true };
		}),
});
