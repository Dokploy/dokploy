import dns from "node:dns";
import { promisify } from "node:util";
import { db } from "@dokploy/server/db";
import {
	getWebServerSettings,
	resolveWebServerProvider,
} from "@dokploy/server/services/web-server-settings";
import { generateRandomDomain } from "@dokploy/server/templates";
import {
	getCaddyComposeRouteTargetsForWebServer,
	writeCaddyComposeRoutesForTargets,
} from "@dokploy/server/utils/docker/domain";
import { manageWebServerDomain } from "@dokploy/server/utils/web-server/domain";
import type { WebServerProvider } from "@dokploy/server/utils/web-server/providers";
import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import { type apiCreateDomain, domains } from "../db/schema";
import { findApplicationById } from "./application";
import { detectCDNProvider } from "./cdn";
import type { Compose } from "./compose";
import { findServerById } from "./server";

export type Domain = typeof domains.$inferSelect;

const resolveApplicationDomainPort = async (
	input: z.infer<typeof apiCreateDomain>,
) => {
	if (
		input.port != null ||
		!input.applicationId ||
		input.composeId ||
		input.previewDeploymentId ||
		input.domainType === "compose" ||
		input.domainType === "preview"
	) {
		return input.port;
	}

	const applicationId = input.applicationId;
	const applicationDomains = await db.query.domains.findMany({
		where: eq(domains.applicationId, applicationId),
		orderBy: (domainFields, { asc }) => [asc(domainFields.uniqueConfigKey)],
	});

	return applicationDomains.find(
		(domain) => typeof domain.port === "number" && domain.port > 0,
	)?.port;
};

export const createDomain = async (input: z.infer<typeof apiCreateDomain>) => {
	const port = await resolveApplicationDomainPort(input);
	const domain = await db.transaction(async (tx) => {
		const domain = await tx
			.insert(domains)
			.values({
				...input,
				...(port != null && { port }),
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

		return domain;
	});

	if (domain.applicationId) {
		const application = await findApplicationById(domain.applicationId);
		try {
			await manageWebServerDomain(application, domain);
		} catch (error) {
			await removeDomainById(domain.domainId).catch(() => undefined);
			throw error;
		}
	}

	return domain;
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
			application: true,
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
			application: true,
		},
	});

	return domainsArray;
};

export const findDomainsByComposeId = async (composeId: string) => {
	const domainsArray = await db.query.domains.findMany({
		where: eq(domains.composeId, composeId),
		with: {
			compose: true,
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

export const refreshCaddyComposeRoutes = async (
	compose: Compose,
	domainsInput?: Domain[],
	provider?: WebServerProvider,
	organizationId?: string | null,
) => {
	const domainsArray =
		domainsInput ?? (await findDomainsByComposeId(compose.composeId));
	const routeTargets = await getCaddyComposeRouteTargetsForWebServer(
		compose,
		domainsArray,
		provider,
	);
	if (routeTargets) {
		await writeCaddyComposeRoutesForTargets(compose, routeTargets, {
			organizationId,
		});
	}
};

export const createComposeDomain = async (
	compose: Compose,
	input: z.infer<typeof apiCreateDomain>,
	provider?: WebServerProvider,
	organizationId?: string | null,
) => {
	const domain = await createDomain(input);
	try {
		await refreshCaddyComposeRoutes(
			compose,
			undefined,
			provider,
			organizationId,
		);
		return domain;
	} catch (error) {
		await removeDomainById(domain.domainId);
		await refreshCaddyComposeRoutes(
			compose,
			undefined,
			provider,
			organizationId,
		);
		throw error;
	}
};

export const removeComposeDomainsForWebServer = async (
	compose: Compose,
	domainsToRemove: Domain[],
	provider?: WebServerProvider,
	organizationId?: string | null,
) => {
	if (domainsToRemove.length === 0) {
		return [];
	}

	const resolvedProvider =
		provider ?? (await resolveWebServerProvider(compose.serverId));
	const currentDomains = await findDomainsByComposeId(compose.composeId);
	const domainIdsToRemove = new Set(
		domainsToRemove.map((domain) => domain.domainId),
	);
	const removableDomains = currentDomains.filter((domain) =>
		domainIdsToRemove.has(domain.domainId),
	);

	if (removableDomains.length === 0) {
		return [];
	}

	if (resolvedProvider !== "caddy") {
		return db.transaction(async (tx) =>
			tx
				.delete(domains)
				.where(
					inArray(
						domains.domainId,
						removableDomains.map((domain) => domain.domainId),
					),
				)
				.returning(),
		);
	}

	const remainingDomains = currentDomains.filter(
		(domain) => !domainIdsToRemove.has(domain.domainId),
	);

	await refreshCaddyComposeRoutes(
		compose,
		remainingDomains,
		resolvedProvider,
		organizationId,
	);

	try {
		return await db.transaction(async (tx) =>
			tx
				.delete(domains)
				.where(
					inArray(
						domains.domainId,
						removableDomains.map((domain) => domain.domainId),
					),
				)
				.returning(),
		);
	} catch (error) {
		await refreshCaddyComposeRoutes(
			compose,
			currentDomains,
			resolvedProvider,
			organizationId,
		);
		throw error;
	}
};

export const getDomainHost = (domain: Domain) => {
	return `${domain.https ? "https" : "http"}://${domain.host}`;
};

const resolveDns = promisify(dns.resolve4);

export const validateDomain = async (
	domain: string,
	expectedIp?: string,
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

		// If we have an expected IP, validate against it
		if (expectedIp) {
			return {
				isValid: resolvedIps.includes(expectedIp),
				resolvedIp: resolvedIps.join(", "),
				error: !resolvedIps.includes(expectedIp)
					? `Domain resolves to ${resolvedIps.join(", ")} but should point to ${expectedIp}`
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
