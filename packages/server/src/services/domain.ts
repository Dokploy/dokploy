import dns from "node:dns";
import { promisify } from "node:util";
import { db } from "@dokploy/server/db";
import { getWebServerSettings } from "@dokploy/server/services/web-server-settings";
import { generateRandomDomain } from "@dokploy/server/templates";
import { manageDomain } from "@dokploy/server/utils/traefik/domain";
import { TRPCError } from "@trpc/server";
import * as bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { z } from "zod";
import { type apiCreateDomain, domains } from "../db/schema";
import type { DomainAccessRule } from "../db/validations/domain";
import { findApplicationById } from "./application";
import { detectCDNProvider } from "./cdn";
import { findServerById } from "./server";

export type Domain = typeof domains.$inferSelect;

const findDomainByIdRaw = async (domainId: string) => {
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

const prepareAccessRulesForStorage = async (
	rules: DomainAccessRule[] = [],
	currentRules: DomainAccessRule[] = [],
) => {
	const currentRulesMap = new Map(
		currentRules
			.filter((rule) => rule.ruleId)
			.map((rule) => [rule.ruleId as string, rule]),
	);

	return Promise.all(
		rules.map(async (rule) => {
			const username = rule.basicAuthUsername?.trim();
			const password = rule.basicAuthPassword?.trim();
			const ruleId = rule.ruleId || nanoid();
			const currentRule = currentRulesMap.get(ruleId);
			const hasBasicAuth =
				!!username ||
				!!password ||
				!!rule.basicAuthPasswordHash ||
				!!currentRule?.basicAuthPasswordHash;

			let passwordHash =
				rule.basicAuthPasswordHash?.trim() ||
				currentRule?.basicAuthPasswordHash?.trim();
			if (password) {
				passwordHash = await bcrypt.hash(password, 10);
			}

			return {
				...rule,
				ruleId,
				basicAuthUsername: username,
				basicAuthPassword: undefined,
				basicAuthPasswordHash: passwordHash,
				basicAuthConfigured: hasBasicAuth && !!username && !!passwordHash,
			};
		}),
	);
};

const sanitizeAccessRulesForOutput = (rules: DomainAccessRule[] = []) => {
	return rules.map((rule) => ({
		...rule,
		basicAuthPassword: undefined,
		basicAuthPasswordHash: undefined,
		basicAuthConfigured: !!rule.basicAuthConfigured,
	}));
};

export const createDomain = async (input: z.infer<typeof apiCreateDomain>) => {
	const result = await db.transaction(async (tx) => {
		const accessRules = await prepareAccessRulesForStorage(
			input.accessRules || [],
		);
		const domain = await tx
			.insert(domains)
			.values({
				...input,
				host: input.host?.trim(),
				accessRules,
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

		return {
			...domain,
			accessRules: sanitizeAccessRulesForOutput(domain.accessRules || []),
		};
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
	const domain = await findDomainByIdRaw(domainId);
	return {
		...domain,
		accessRules: sanitizeAccessRulesForOutput(domain.accessRules || []),
	};
};

export const findDomainsByApplicationId = async (applicationId: string) => {
	const domainsArray = await db.query.domains.findMany({
		where: eq(domains.applicationId, applicationId),
		with: {
			application: true,
		},
	});

	return domainsArray.map((domain) => ({
		...domain,
		accessRules: sanitizeAccessRulesForOutput(domain.accessRules || []),
	}));
};

export const findDomainsByComposeId = async (composeId: string) => {
	const domainsArray = await db.query.domains.findMany({
		where: eq(domains.composeId, composeId),
		with: {
			compose: true,
		},
	});

	return domainsArray.map((domain) => ({
		...domain,
		accessRules: sanitizeAccessRulesForOutput(domain.accessRules || []),
	}));
};

export const updateDomainById = async (
	domainId: string,
	domainData: Partial<Domain>,
) => {
	const accessRules = domainData.accessRules
		? await prepareAccessRulesForStorage(
				domainData.accessRules,
				(await findDomainByIdRaw(domainId)).accessRules || [],
			)
		: undefined;
	const domain = await db
		.update(domains)
		.set({
			...domainData,
			...(domainData.host && { host: domainData.host.trim() }),
			...(accessRules ? { accessRules } : {}),
		})
		.where(eq(domains.domainId, domainId))
		.returning();

	return domain[0]
		? {
				...domain[0],
				accessRules: sanitizeAccessRulesForOutput(domain[0].accessRules || []),
			}
		: undefined;
};

export { findDomainByIdRaw };

export const removeDomainById = async (domainId: string) => {
	await findDomainById(domainId);
	const result = await db
		.delete(domains)
		.where(eq(domains.domainId, domainId))
		.returning();

	return result[0]
		? {
				...result[0],
				accessRules: sanitizeAccessRulesForOutput(result[0].accessRules || []),
			}
		: undefined;
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
