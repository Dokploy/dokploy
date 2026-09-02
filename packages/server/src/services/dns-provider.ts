import { db } from "@dokploy/server/db";
import {
	type apiCreateDnsProvider,
	type DnsProviderConfig,
	dnsProvider,
} from "@dokploy/server/db/schema";
import type { DnsRecordInput } from "@dokploy/server/utils/dns";
import { getDnsClient } from "@dokploy/server/utils/dns";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";

export type DnsProvider = typeof dnsProvider.$inferSelect;

export const DNS_SECRET_MASK = "********";

const SENSITIVE_FIELDS: Record<DnsProviderConfig["providerType"], string[]> = {
	cloudflare: ["apiToken"],
	route53: ["secretAccessKey"],
	porkbun: ["secretApiKey"],
};

export const maskDnsProviderConfig = (
	config: DnsProviderConfig,
): DnsProviderConfig => {
	const masked: Record<string, unknown> = { ...config };
	for (const field of SENSITIVE_FIELDS[config.providerType]) {
		if (masked[field]) {
			masked[field] = DNS_SECRET_MASK;
		}
	}
	return masked as DnsProviderConfig;
};

export const mergeDnsProviderConfig = (
	incoming: DnsProviderConfig,
	existing: DnsProviderConfig,
): DnsProviderConfig => {
	const merged: Record<string, unknown> = { ...incoming };
	for (const field of SENSITIVE_FIELDS[incoming.providerType]) {
		if (merged[field] === DNS_SECRET_MASK) {
			if (incoming.providerType !== existing.providerType) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Credentials must be re-entered when changing the provider type",
				});
			}
			merged[field] = (existing as Record<string, unknown>)[field];
		}
	}
	return merged as DnsProviderConfig;
};

const isUniqueNameViolation = (error: unknown) =>
	error instanceof Error && error.message.includes("dns_provider_org_name_idx");

export const createDnsProvider = async (
	input: z.infer<typeof apiCreateDnsProvider>,
	organizationId: string,
) => {
	try {
		const newProvider = await db
			.insert(dnsProvider)
			.values({
				name: input.name,
				providerType: input.config.providerType,
				config: input.config,
				organizationId,
			})
			.returning()
			.then((value) => value[0]);

		if (!newProvider) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error creating the DNS provider",
			});
		}
		return newProvider;
	} catch (error) {
		if (isUniqueNameViolation(error)) {
			throw new TRPCError({
				code: "CONFLICT",
				message: `A DNS provider named "${input.name}" already exists in this organization`,
			});
		}
		throw error;
	}
};

export const findDnsProviderById = async (dnsProviderId: string) => {
	const provider = await db.query.dnsProvider.findFirst({
		where: eq(dnsProvider.dnsProviderId, dnsProviderId),
	});
	if (!provider) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "DNS provider not found",
		});
	}
	return provider;
};

export const findDnsProviderInOrganization = async (
	dnsProviderId: string,
	organizationId: string,
) => {
	const provider = await findDnsProviderById(dnsProviderId);
	if (provider.organizationId !== organizationId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not allowed to access this DNS provider",
		});
	}
	return provider;
};

export const findDnsProvidersByOrganizationId = async (
	organizationId: string,
) => {
	return await db.query.dnsProvider.findMany({
		where: eq(dnsProvider.organizationId, organizationId),
		orderBy: (providers, { asc }) => [asc(providers.name)],
	});
};

export const updateDnsProvider = async (
	dnsProviderId: string,
	name: string,
	config: DnsProviderConfig,
) => {
	const existing = await findDnsProviderById(dnsProviderId);
	const mergedConfig = mergeDnsProviderConfig(config, existing.config);

	try {
		const updated = await db
			.update(dnsProvider)
			.set({
				name,
				providerType: mergedConfig.providerType,
				config: mergedConfig,
			})
			.where(eq(dnsProvider.dnsProviderId, dnsProviderId))
			.returning()
			.then((res) => res[0]);

		if (!updated) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error updating the DNS provider",
			});
		}
		return updated;
	} catch (error) {
		if (isUniqueNameViolation(error)) {
			throw new TRPCError({
				code: "CONFLICT",
				message: `A DNS provider named "${name}" already exists in this organization`,
			});
		}
		throw error;
	}
};

export const removeDnsProvider = async (dnsProviderId: string) => {
	const removed = await db
		.delete(dnsProvider)
		.where(eq(dnsProvider.dnsProviderId, dnsProviderId))
		.returning()
		.then((res) => res[0]);

	if (!removed) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "DNS provider not found",
		});
	}
	return removed;
};

export const testDnsProviderConnection = async (config: DnsProviderConfig) => {
	const client = getDnsClient(config.providerType);
	try {
		await client.testConnection(config);
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				error instanceof Error
					? error.message
					: "Error connecting to the DNS provider",
		});
	}
};

export const listDnsProviderZones = async (config: DnsProviderConfig) => {
	const client = getDnsClient(config.providerType);
	try {
		return await client.listZones(config);
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				error instanceof Error
					? error.message
					: "Error listing zones for this DNS provider",
		});
	}
};

export const listDnsProviderRecords = async (
	config: DnsProviderConfig,
	zoneId: string,
) => {
	const client = getDnsClient(config.providerType);
	try {
		return await client.listRecords(config, zoneId);
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				error instanceof Error
					? error.message
					: "Error listing records for this zone",
		});
	}
};

export const createDnsProviderRecord = async (
	config: DnsProviderConfig,
	record: DnsRecordInput,
) => {
	const client = getDnsClient(config.providerType);
	try {
		return await client.upsertRecord(config, record);
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				error instanceof Error ? error.message : "Error creating the record",
		});
	}
};

export const updateDnsProviderRecord = async (
	config: DnsProviderConfig,
	zoneId: string,
	recordId: string,
	record: Omit<DnsRecordInput, "zoneId">,
) => {
	const client = getDnsClient(config.providerType);
	try {
		return await client.updateRecord(config, zoneId, recordId, record);
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				error instanceof Error ? error.message : "Error updating the record",
		});
	}
};

export const deleteDnsProviderRecord = async (
	config: DnsProviderConfig,
	zoneId: string,
	recordId: string,
) => {
	const client = getDnsClient(config.providerType);
	try {
		await client.deleteRecord(config, zoneId, recordId);
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				error instanceof Error ? error.message : "Error deleting the record",
		});
	}
};
