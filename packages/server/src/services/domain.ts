import dns from "node:dns";
import { promisify } from "node:util";
import { db } from "@dokploy/server/db";
import { getWebServerSettings } from "@dokploy/server/services/web-server-settings";
import { generateRandomDomain } from "@dokploy/server/templates";
import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";
import { manageDomain } from "@dokploy/server/utils/traefik/domain";
import { getPublicIpWithFallback } from "@dokploy/server/wss/utils";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { type apiCreateDomain, domains } from "../db/schema";
import { findApplicationById } from "./application";
import { detectCDNProvider } from "./cdn";
import { findServerById } from "./server";

export type Domain = typeof domains.$inferSelect;

export const createDomain = async (input: z.infer<typeof apiCreateDomain>) => {
	const result = await db.transaction(async (tx) => {
		const domain = await tx
			.insert(domains)
			.values({
				...input,
				host: input.host?.trim(),
			} as typeof domains.$inferInsert)
			.returning()
			.then((response) => response[0]);

		if (!domain) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error creating domain",
			});
		}

		if (domain.applicationId) {
			const application = await findApplicationById(domain.applicationId);
			await manageDomain(application, domain);
		}

		return domain;
	});

	return result;
};

export const generateTraefikMeDomain = async (
	appName: string,
	_userId: string,
	serverId?: string,
) => {
	if (serverId) {
		const server = await findServerById(serverId);
		return generateRandomDomain({
			serverIp: server.ipAddress,
			projectName: appName,
		});
	}

	if (process.env.NODE_ENV === "development") {
		return generateRandomDomain({
			serverIp: "",
			projectName: appName,
		});
	}
	const settings = await getWebServerSettings();
	return generateRandomDomain({
		serverIp: settings?.serverIp || "",
		projectName: appName,
	});
};

export const generateWildcardDomain = (
	appName: string,
	serverDomain: string,
) => {
	return `${appName}-${serverDomain}`;
};

export const findDomainById = async (domainId: string) => {
	const domain = await db.query.domains.findFirst({
		where: eq(domains.domainId, domainId),
		with: {
			application: {
				columns: { applicationId: true, appName: true, name: true },
			},
		},
	});
	if (!domain) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Domain not found",
		});
	}
	return domain;
};

export const findDomainsByApplicationId = async (applicationId: string) => {
	const domainsArray = await db.query.domains.findMany({
		where: eq(domains.applicationId, applicationId),
		with: {
			application: {
				columns: { applicationId: true, appName: true, name: true },
			},
		},
	});

	return domainsArray;
};

export const findDomainsByComposeId = async (composeId: string) => {
	const domainsArray = await db.query.domains.findMany({
		where: eq(domains.composeId, composeId),
		with: {
			compose: {
				columns: { composeId: true, appName: true, name: true },
			},
		},
	});

	return domainsArray;
};

export const updateDomainById = async (
	domainId: string,
	domainData: Partial<Domain>,
) => {
	const domain = await db
		.update(domains)
		.set({
			...domainData,
			...(domainData.host && { host: domainData.host.trim() }),
		})
		.where(eq(domains.domainId, domainId))
		.returning();

	return domain[0];
};

export const removeDomainById = async (domainId: string) => {
	await findDomainById(domainId);
	const result = await db
		.delete(domains)
		.where(eq(domains.domainId, domainId))
		.returning();

	return result[0];
};

export const getDomainHost = (domain: Domain) => {
	return `${domain.https ? "https" : "http"}://${domain.host}`;
};

const resolveDns = promisify(dns.resolve4);

export const validateDomain = async (
	domain: string,
	expectedIps?: string[],
): Promise<{
	isValid: boolean;
	resolvedIp?: string;
	error?: string;
	isCloudflare?: boolean;
	cdnProvider?: string;
}> => {
	try {
		// Remove protocol and path if present
		const cleanDomain = domain.replace(/^https?:\/\//, "").split("/")[0];

		// Resolve the domain to get its IP
		const ips = await resolveDns(cleanDomain || "");

		const resolvedIps = ips.map((ip) => ip.toString());

		// Check if any IP belongs to a CDN provider
		const cdnProvider = ips
			.map((ip) => detectCDNProvider(ip))
			.find((provider) => provider !== null);

		// If behind a CDN, we consider it valid but inform the user
		if (cdnProvider) {
			return {
				isValid: true,
				resolvedIp: resolvedIps.join(", "),
				cdnProvider: cdnProvider.displayName,
				error: cdnProvider.warningMessage,
			};
		}

		if (expectedIps && expectedIps.length > 0) {
			const isValid = resolvedIps.some((ip) => expectedIps.includes(ip));
			return {
				isValid,
				resolvedIp: resolvedIps.join(", "),
				error: !isValid
					? `Domain resolves to ${resolvedIps.join(", ")} but should point to ${expectedIps.join(" or ")}`
					: undefined,
			};
		}

		// If no expected IP, just return the resolved IP
		return {
			isValid: true,
			resolvedIp: resolvedIps.join(", "),
		};
	} catch (error) {
		return {
			isValid: false,
			error:
				error instanceof Error ? error.message : "Failed to resolve domain",
		};
	}
};

export const getServerIpCandidates = async (
	serverId?: string | null,
): Promise<string[]> => {
	const candidates = new Set<string>();

	if (serverId) {
		const server = await findServerById(serverId);
		if (server.ipAddress) {
			candidates.add(server.ipAddress);
		}

		const publicIp = await withTimeout(
			execAsyncRemote(
				serverId,
				"curl -s -m 5 https://ifconfig.me || curl -s -m 5 https://icanhazip.com",
			),
			7000,
		);
		const detectedIp = publicIp?.stdout?.trim();
		if (detectedIp) {
			candidates.add(detectedIp);
		}
	} else {
		const settings = await getWebServerSettings();
		if (settings?.serverIp) {
			candidates.add(settings.serverIp);
		}

		const publicIp = await withTimeout(getPublicIpWithFallback(), 7000);
		if (publicIp) {
			candidates.add(publicIp);
		}
	}

	return Array.from(candidates);
};

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | null> => {
	return Promise.race([
		promise,
		new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
	]).catch(() => null);
};
