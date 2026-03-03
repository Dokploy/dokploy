import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "../../db";
import {
	protectedProcedure,
	createTRPCRouter,
} from "../trpc";
import {
	domainProviders,
	apiCreateDomainProvider,
	apiUpdateDomainProvider,
} from "../../db/schema";
import { eq } from "drizzle-orm";
import { getDecryptedDomainProvider } from "@dokploy/server/services/domain-provider";

export const domainProviderRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateDomainProvider)
		.mutation(async ({ input, ctx }) => {
			const result = await db
				.insert(domainProviders)
				.values({
					...input,
					organizationId: ctx.session.activeOrganizationId,
				})
				.returning();
			return result[0];
		}),

	byOrganization: protectedProcedure.query(async ({ ctx }) => {
		return await db.select().from(domainProviders).where(
			eq(domainProviders.organizationId, ctx.session.activeOrganizationId)
		);
	}),

	one: protectedProcedure
		.input(z.object({ domainProviderId: z.string() }))
		.query(async ({ input, ctx }) => {
			const result = await db.select().from(domainProviders).where(
				eq(domainProviders.domainProviderId, input.domainProviderId)
			).limit(1);

			if (!result.length) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Domain provider not found",
				});
			}

			const provider = await getDecryptedDomainProvider(input.domainProviderId);

			if (provider.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Domain provider not found",
				});
			}

			return provider;
		}),

	update: protectedProcedure
		.input(apiUpdateDomainProvider)
		.mutation(async ({ input, ctx }) => {
			const { domainProviderId, ...updateData } = input;

			const existing = await db.select().from(domainProviders).where(
				eq(domainProviders.domainProviderId, domainProviderId)
			).limit(1);

			if (!existing.length || existing[0].organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Domain provider not found",
				});
			}

			const result = await db
				.update(domainProviders)
				.set(updateData)
				.where(eq(domainProviders.domainProviderId, domainProviderId))
				.returning();

			return result[0];
		}),

	delete: protectedProcedure
		.input(z.object({ domainProviderId: z.string() }))
		.mutation(async ({ input, ctx }) => {
			const existing = await db.select().from(domainProviders).where(
				eq(domainProviders.domainProviderId, input.domainProviderId)
			).limit(1);

			if (!existing.length || existing[0].organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Domain provider not found",
				});
			}

			return db
				.delete(domainProviders)
				.where(eq(domainProviders.domainProviderId, input.domainProviderId))
				.returning();
		}),

	toggleStatus: protectedProcedure
		.input(z.object({ domainProviderId: z.string() }))
		.mutation(async ({ input, ctx }) => {
			const provider = await db.select().from(domainProviders).where(
				eq(domainProviders.domainProviderId, input.domainProviderId)
			).limit(1);

			if (!provider.length || provider[0].organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Domain provider not found",
				});
			}

			const result = await db
				.update(domainProviders)
				.set({ active: !provider[0].active })
				.where(eq(domainProviders.domainProviderId, input.domainProviderId))
				.returning();

			return result[0];
		}),

	testConnection: protectedProcedure
		.input(z.object({ domainProviderId: z.string() }))
		.mutation(async ({ input, ctx }) => {
			const provider = await getDecryptedDomainProvider(input.domainProviderId);

			if (provider.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Domain provider not found",
				});
			}

			try {
				// Test connection based on provider type
				if (provider.type === "netlify") {
					const netlifyService = await import("@dokploy/server/services/netlify");
					return await netlifyService.testConnection(provider);
				} else if (provider.type === "namecheap") {
					const namecheapService = await import("@dokploy/server/services/namecheap");
					return await namecheapService.testConnection(provider);
				}

				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unknown provider type",
				});
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: error instanceof Error ? error.message : "Connection test failed",
				});
			}
		}),
});