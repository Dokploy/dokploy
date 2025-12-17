import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "../../db";
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
} from "../trpc";
import {
	dnsProviders,
	apiCreateDnsProvider,
	apiUpdateDnsProvider,
} from "../../db/schema";
import { eq } from "drizzle-orm";

// DNS Provider Service Functions
const findDnsProvidersByOrganization = (organizationId: string) => {
	return db.query.dnsProviders.findMany({
		where: eq(dnsProviders.organizationId, organizationId),
		orderBy: dnsProviders.createdAt,
	});
};

const findDnsProviderById = (dnsProviderId: string) => {
	return db.query.dnsProviders.findFirst({
		where: eq(dnsProviders.dnsProviderId, dnsProviderId),
	});
};

const createDnsProvider = async (
	organizationId: string,
	data: Omit<typeof apiCreateDnsProvider._type, "organizationId">,
) => {
	const result = await db
		.insert(dnsProviders)
		.values({
			...data,
			organizationId,
		})
		.returning();

	return result[0];
};

const updateDnsProvider = async (
	dnsProviderId: string,
	data: Partial<typeof apiUpdateDnsProvider._type>,
) => {
	const result = await db
		.update(dnsProviders)
		.set(data)
		.where(eq(dnsProviders.dnsProviderId, dnsProviderId))
		.returning();

	return result[0];
};

const deleteDnsProvider = async (dnsProviderId: string) => {
	const result = await db
		.delete(dnsProviders)
		.where(eq(dnsProviders.dnsProviderId, dnsProviderId))
		.returning();

	return result[0];
};

const findActiveDnsProvidersByOrganization = (organizationId: string) => {
	return db.query.dnsProviders.findMany({
		where: eq(dnsProviders.organizationId, organizationId) && eq(dnsProviders.active, true),
		orderBy: dnsProviders.createdAt,
	});
};

const toggleDnsProviderStatus = async (dnsProviderId: string) => {
	const provider = await findDnsProviderById(dnsProviderId);
	if (!provider) {
		throw new Error("DNS Provider not found");
	}

	const result = await db
		.update(dnsProviders)
		.set({ active: !provider.active })
		.where(eq(dnsProviders.dnsProviderId, dnsProviderId))
		.returning();

	return result[0];
};

// Helper function to get DNS providers for Traefik configuration
const getDnsProvidersForTraefik = async (organizationId: string) => {
	const providers = await findActiveDnsProvidersByOrganization(organizationId);

	return providers.map((provider, index) => ({
		type: provider.type,
		apiToken: provider.apiToken,
		secretAccessKey: provider.secretAccessKey,
		accessKeyId: provider.accessKeyId,
		region: provider.region,
		ttl: provider.ttl,
		index,
		name: provider.name,
	}));
};

export const dnsProviderRouter = createTRPCRouter({
	create: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1, "Name is required"),
				type: z.enum([
					"cloudflare",
					"route53",
					"digitalocean",
					"namecheap",
					"gandi",
					"azure",
					"google",
				]),
				apiToken: z.string().optional(),
				secretAccessKey: z.string().optional(),
				accessKeyId: z.string().optional(),
				region: z.string().optional(),
				ttl: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const organizationId = ctx.session.activeOrganizationId;

			try {
				const dnsProvider = await createDnsProvider(organizationId, input);
				return dnsProvider;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Failed to create DNS provider",
				});
			}
		}),

	byOrganization: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = ctx.session.activeOrganizationId;

		try {
			const providers = await findDnsProvidersByOrganization(organizationId);
			return providers;
		} catch (error) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch DNS providers",
			});
		}
	}),

	byOrganizationActive: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = ctx.session.activeOrganizationId;

		try {
			const providers = await findActiveDnsProvidersByOrganization(organizationId);
			return providers;
		} catch (error) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch active DNS providers",
			});
		}
	}),

	one: protectedProcedure
		.input(
			z.object({
				dnsProviderId: z.string(),
			}),
		)
		.query(async ({ input, ctx }) => {
			const { dnsProviderId } = input;

			try {
				const provider = await findDnsProviderById(dnsProviderId);
				if (!provider) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "DNS provider not found",
					});
				}

				// Check if user has access to this DNS provider's organization
				if (provider.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You don't have access to this DNS provider",
					});
				}

				return provider;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch DNS provider",
				});
			}
		}),

	update: protectedProcedure
		.input(
			z.object({
				dnsProviderId: z.string(),
				name: z.string().min(1, "Name is required").optional(),
				type: z
					.enum([
						"cloudflare",
						"route53",
						"digitalocean",
						"namecheap",
						"gandi",
						"azure",
						"google",
					])
					.optional(),
				apiToken: z.string().optional(),
				secretAccessKey: z.string().optional(),
				accessKeyId: z.string().optional(),
				region: z.string().optional(),
				ttl: z.string().optional(),
				active: z.boolean().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const { dnsProviderId, ...updateData } = input;

			try {
				const existingProvider = await findDnsProviderById(dnsProviderId);
				if (!existingProvider) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "DNS provider not found",
					});
				}

				// Check if user has access to this DNS provider's organization
				if (existingProvider.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You don't have access to this DNS provider",
					});
				}

				const updatedProvider = await updateDnsProvider(dnsProviderId, updateData);
				return updatedProvider;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to update DNS provider",
				});
			}
		}),

	delete: protectedProcedure
		.input(
			z.object({
				dnsProviderId: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const { dnsProviderId } = input;

			try {
				const existingProvider = await findDnsProviderById(dnsProviderId);
				if (!existingProvider) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "DNS provider not found",
					});
				}

				// Check if user has access to this DNS provider's organization
				if (existingProvider.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You don't have access to this DNS provider",
					});
				}

				const deletedProvider = await deleteDnsProvider(dnsProviderId);
				return deletedProvider;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to delete DNS provider",
				});
			}
		}),

	toggleStatus: protectedProcedure
		.input(
			z.object({
				dnsProviderId: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const { dnsProviderId } = input;

			try {
				const existingProvider = await findDnsProviderById(dnsProviderId);
				if (!existingProvider) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "DNS provider not found",
					});
				}

				// Check if user has access to this DNS provider's organization
				if (existingProvider.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You don't have access to this DNS provider",
					});
				}

				const updatedProvider = await toggleDnsProviderStatus(dnsProviderId);
				return updatedProvider;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to toggle DNS provider status",
				});
			}
		}),

	// Admin-only endpoint to get DNS providers for Traefik configuration
	forTraefik: adminProcedure
		.input(
			z.object({
				organizationId: z.string(),
			}),
		)
		.query(async ({ input }) => {
			const { organizationId } = input;

			try {
				const providers = await getDnsProvidersForTraefik(organizationId);
				return providers;
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get DNS providers for Traefik",
				});
			}
		}),
});