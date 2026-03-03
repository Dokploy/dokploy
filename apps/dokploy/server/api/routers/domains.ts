import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, createTRPCRouter } from "../trpc";
import { getActiveDomainProviders, getDecryptedDomainProvider } from "@dokploy/server/services/domain-provider";
import { netlifyDnsService } from "@dokploy/server/services/netlify-dns";
import { namecheapService } from "@dokploy/server/services/namecheap";
import { eq } from "drizzle-orm";

export const domainsRouter = createTRPCRouter({
	getAll: protectedProcedure
		.input(
			z.object({
				providerId: z.string().optional(),
				search: z.string().optional(),
			})
		)
		.query(async ({ input, ctx }) => {
			const providers = await getActiveDomainProviders(ctx.session.activeOrganizationId);
			const allDomains = [];

			for (const provider of providers) {
				try {
					const decryptedProvider = await getDecryptedDomainProvider(provider.domainProviderId);

					if (input.providerId && provider.domainProviderId !== input.providerId) {
						continue;
					}

					let domains = [];

					if (provider.type === "netlify") {
						const netlifyService = await import("@dokploy/server/services/netlify-dns");
						const zones = await netlifyService.listDnsZones(decryptedProvider);
						domains = zones.map((zone: any) => ({
							id: zone.id,
							name: zone.name,
							provider: provider.name,
							providerType: provider.type as "netlify",
							status: "active" as const,
							records: zone.records?.length || 0,
							isManaged: true,
						}));
					} else if (provider.type === "namecheap") {
						const namecheapService = await import("@dokploy/server/services/namecheap");
						const namecheapDomains = await namecheapService.listDomains(decryptedProvider);
						domains = namecheapDomains.map((domain: any) => ({
							id: domain.DomainID,
							name: domain.DomainName,
							provider: provider.name,
							providerType: provider.type as "namecheap",
							status: domain.IsExpired ? "expired" : "active",
							expiresAt: domain.Expires,
							autoRenew: domain.AutoRenew,
							isManaged: domain.IsOurDNS,
						}));
					}

					// Apply search filter if provided
					if (input.search) {
						domains = domains.filter((domain: any) =>
							domain.name.toLowerCase().includes(input.search!.toLowerCase())
						);
					}

					allDomains.push(...domains);
				} catch (error) {
					// Log error but continue with other providers
					console.error(`Error fetching domains from ${provider.name}:`, error);
				}
			}

			return allDomains;
		}),

	// Netlify specific endpoints
	netlify: createTRPCRouter({
		getAll: protectedProcedure
			.query(async ({ ctx }) => {
				const providers = await getActiveDomainProviders(ctx.session.activeOrganizationId);
				const netlifyProvider = providers.find((p) => p.type === "netlify");

				if (!netlifyProvider) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "No active Netlify DNS provider found",
					});
				}

				const decryptedProvider = await getDecryptedDomainProvider(netlifyProvider.domainProviderId);
				const netlifyService = await import("@dokploy/server/services/netlify-dns");
				return await netlifyService.listDnsZones(decryptedProvider);
			}),

		getRecords: protectedProcedure
			.input(z.object({ zoneId: z.string() }))
			.query(async ({ input, ctx }) => {
				const providers = await getActiveDomainProviders(ctx.session.activeOrganizationId);
				const netlifyProvider = providers.find((p) => p.type === "netlify");

				if (!netlifyProvider) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "No active Netlify DNS provider found",
					});
				}

				const decryptedProvider = await getDecryptedDomainProvider(netlifyProvider.domainProviderId);
				const netlifyService = await import("@dokploy/server/services/netlify-dns");
				return await netlifyService.listDnsRecords(decryptedProvider, input.zoneId);
			}),
	}),

	// Namecheap specific endpoints
	namecheap: createTRPCRouter({
		getAll: protectedProcedure
			.query(async ({ ctx }) => {
				const providers = await getActiveDomainProviders(ctx.session.activeOrganizationId);
				const namecheapProvider = providers.find((p) => p.type === "namecheap");

				if (!namecheapProvider) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "No active Namecheap provider found",
					});
				}

				const decryptedProvider = await getDecryptedDomainProvider(namecheapProvider.domainProviderId);
				const namecheapService = await import("@dokploy/server/services/namecheap");
				return await namecheapService.listDomains(decryptedProvider);
			}),

		checkAvailability: protectedProcedure
			.input(z.object({ domains: z.array(z.string()) }))
			.query(async ({ input, ctx }) => {
				const providers = await getActiveDomainProviders(ctx.session.activeOrganizationId);
				const namecheapProvider = providers.find((p) => p.type === "namecheap");

				if (!namecheapProvider) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "No active Namecheap provider found",
					});
				}

				const decryptedProvider = await getDecryptedDomainProvider(namecheapProvider.domainProviderId);
				const namecheapService = await import("@dokploy/server/services/namecheap");
				return await namecheapService.checkDomainAvailability(decryptedProvider, input.domains);
			}),

		purchase: protectedProcedure
			.input(
				z.object({
					domainName: z.string(),
					years: z.number().min(1).max(10),
					promotionCode: z.string().optional(),
					firstName: z.string(),
					lastName: z.string(),
					address1: z.string(),
					city: z.string(),
					stateProvince: z.string(),
					postalCode: z.string(),
					country: z.string(),
					phone: z.string(),
					emailAddress: z.string().email(),
					addFreeWhoisguard: z.boolean(),
				})
			)
			.mutation(async ({ input, ctx }) => {
				const providers = await getActiveDomainProviders(ctx.session.activeOrganizationId);
				const namecheapProvider = providers.find((p) => p.type === "namecheap" && p.enablePurchase);

				if (!namecheapProvider) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "No active Namecheap provider with purchase enabled found",
					});
				}

				const decryptedProvider = await getDecryptedDomainProvider(namecheapProvider.domainProviderId);
				const namecheapService = await import("@dokploy/server/services/namecheap");
				return await namecheapService.purchaseDomain(decryptedProvider, input);
			}),

		getRecords: protectedProcedure
			.input(
				z.object({
					domain: z.string(), // Full domain name like "example.com"
				})
			)
			.query(async ({ input, ctx }) => {
				const providers = await getActiveDomainProviders(ctx.session.activeOrganizationId);
				const namecheapProvider = providers.find((p) => p.type === "namecheap");

				if (!namecheapProvider) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "No active Namecheap provider found",
					});
				}

				const decryptedProvider = await getDecryptedDomainProvider(namecheapProvider.domainProviderId);
				const namecheapService = await import("@dokploy/server/services/namecheap");

				// Parse domain into SLD and TLD
				const parts = input.domain.split('.');
				if (parts.length < 2) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Invalid domain format",
					});
				}

				const sld = parts[0];
				const tld = parts.slice(1).join('.');

				return await namecheapService.getDnsRecords(decryptedProvider, sld, tld);
			}),
	}),
});