import { resolve4, resolve6 } from "node:dns/promises";
import { isIP } from "node:net";
import { db } from "@dokploy/server/db";
import {
	type apiCreateDnsProvider,
	type DnsProviderConfig,
	dnsProvider,
} from "@dokploy/server/db/schema";
import type {
	DnsRecord,
	DnsRecordInput,
	DnsZone,
} from "@dokploy/server/utils/dns";
import { getDnsClient } from "@dokploy/server/utils/dns";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";

export type DnsProvider = typeof dnsProvider.$inferSelect;

export const DNS_SECRET_MASK = "********";

const SENSITIVE_FIELDS: Record<DnsProviderConfig["providerType"], string[]> = {
	cloudflare: ["apiToken"],
	route53: ["secretAccessKey"],
	autodns: ["password"],
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

const normalizeDnsName = (value: string) =>
	value.trim().toLowerCase().replace(/\.$/, "");

export const findDnsZoneForHost = (zones: DnsZone[], host: string) => {
	const normalizedHost = normalizeDnsName(host).replace(/^\*\./, "");
	return zones
		.filter((zone) => {
			const zoneName = normalizeDnsName(zone.name);
			return (
				normalizedHost === zoneName || normalizedHost.endsWith(`.${zoneName}`)
			);
		})
		.sort((a, b) => b.name.length - a.name.length)[0];
};

export const findDnsWildcardRecords = (records: DnsRecord[], host: string) => {
	const normalizedHost = normalizeDnsName(host);
	const matchingRecords = records.filter((record) => {
		const name = normalizeDnsName(record.name);
		return (
			["A", "AAAA", "CNAME"].includes(record.type.toUpperCase()) &&
			name.startsWith("*.") &&
			normalizedHost.endsWith(name.slice(1))
		);
	});
	const mostSpecificName = matchingRecords
		.map((record) => normalizeDnsName(record.name))
		.sort((a, b) => b.length - a.length)[0];
	return matchingRecords.filter(
		(record) => normalizeDnsName(record.name) === mostSpecificName,
	);
};

export const findDnsWildcardRecord = (records: DnsRecord[], host: string) =>
	findDnsWildcardRecords(records, host)[0];

const normalizeIpAddress = (value: string) => {
	const address = value.trim().toLowerCase();
	return isIP(address) === 6
		? new URL(`http://[${address}]/`).hostname.slice(1, -1)
		: address;
};

const DNS_LOOKUP_MISS_CODES = new Set([
	"ENODATA",
	"ENOTFOUND",
	"EREFUSED",
	"ESERVFAIL",
	"ETIMEOUT",
]);

const resolveWildcardTarget = async (target: string, type: "A" | "AAAA") => {
	try {
		return type === "A"
			? await resolve4(normalizeDnsName(target))
			: await resolve6(normalizeDnsName(target));
	} catch (error) {
		const code =
			error instanceof Error
				? (error as NodeJS.ErrnoException).code
				: undefined;
		if (code && DNS_LOOKUP_MISS_CODES.has(code)) return [];
		throw error;
	}
};

const wildcardCoversRecords = async (
	wildcards: DnsRecord[],
	records: { type: "A" | "AAAA"; content: string }[],
) => {
	const cnameTargets = wildcards
		.filter((record) => record.type.toUpperCase() === "CNAME")
		.map((record) => record.content);

	return (
		await Promise.all(
			records.map(async (record) => {
				const expected = normalizeIpAddress(record.content);
				if (
					wildcards.some(
						(wildcard) =>
							wildcard.type.toUpperCase() === record.type &&
							normalizeIpAddress(wildcard.content) === expected,
					)
				) {
					return true;
				}
				const resolved = (
					await Promise.all(
						cnameTargets.map((target) =>
							resolveWildcardTarget(target, record.type),
						),
					)
				).flat();
				return resolved.some(
					(address) => normalizeIpAddress(address) === expected,
				);
			}),
		)
	).every(Boolean);
};

export const getDnsProviderDomainInfo = async (
	config: DnsProviderConfig,
	host: string,
) => {
	const recordName = host.trim();
	const zone = findDnsZoneForHost(
		await listDnsProviderZones(config),
		recordName,
	);
	if (!zone) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `No DNS zone matching "${recordName}" was found in the selected provider`,
		});
	}

	const records = await listDnsProviderRecords(config, zone.id);
	const wildcards = findDnsWildcardRecords(records, recordName);
	const wildcard = wildcards[0];
	const exactRecords = records.filter(
		(record) =>
			normalizeDnsName(record.name) === normalizeDnsName(recordName) &&
			["A", "AAAA", "CNAME"].includes(record.type.toUpperCase()),
	);

	return { zone, wildcard, wildcards, exactRecords };
};

export const syncDnsProviderDomainRecords = async (
	config: DnsProviderConfig,
	host: string,
	addresses: { ipv4?: string | null; ipv6?: string | null },
) => {
	const recordName = host.trim();
	const records = [
		...(addresses.ipv4?.trim()
			? [{ type: "A" as const, content: addresses.ipv4.trim() }]
			: []),
		...(addresses.ipv6?.trim()
			? [{ type: "AAAA" as const, content: addresses.ipv6.trim() }]
			: []),
	];
	if (records.length === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "The selected server has no public IPv4 or IPv6 address",
		});
	}

	const info = await getDnsProviderDomainInfo(config, recordName);
	if (
		info.wildcards.length > 0 &&
		(await wildcardCoversRecords(info.wildcards, records))
	) {
		return {
			...info,
			recordTypes: [],
		};
	}

	for (const record of records) {
		await createDnsProviderRecord(config, {
			zoneId: info.zone.id,
			type: record.type,
			name: recordName,
			content: record.content,
		});
	}

	return {
		...info,
		recordTypes: records.map((record) => record.type),
	};
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
