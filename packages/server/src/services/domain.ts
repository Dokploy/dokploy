import dns from "node:dns";
import { promisify } from "node:util";
import { db } from "@dokploy/server/db";
import { getWebServerSettings } from "@dokploy/server/services/web-server-settings";
import { generateRandomDomain } from "@dokploy/server/templates";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { manageDomain } from "@dokploy/server/utils/traefik/domain";
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

export const getDomainHost = (domain: Domain) => {
	return `${domain.https ? "https" : "http"}://${domain.host}`;
};

const resolveDns = promisify(dns.resolve4);

const IPV4_REGEX = /^\d{1,3}(\.\d{1,3}){3}$/;

// Prints, one per line, every IPv4 the server is reachable at: all globally
// scoped interface addresses plus the public egress IP. `; true` keeps the exit
// code at 0 so a failing egress lookup (no outbound network) never throws.
const COLLECT_IPS_COMMAND = [
	"ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1",
	"curl -fsS4 --max-time 5 https://ifconfig.io 2>/dev/null; echo",
	"curl -fsS4 --max-time 5 https://icanhazip.com 2>/dev/null; echo",
	"true",
].join("; ");

const parseIps = (stdout: string): string[] =>
	stdout
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => IPV4_REGEX.test(line));

/**
 * Gathers every IP address the target server is actually reachable at, so a
 * domain pointing to any of them validates as correct. A server commonly has
 * more than one IP (an internal SSH address plus a separate public IP that DNS
 * points to), and the `server` table only stores the single SSH `ipAddress`.
 *
 * When `serverId` is provided the IPs are collected over SSH on that remote
 * server, otherwise they are collected locally for the Dokploy host. The stored
 * address is always included as a baseline, and any failure to reach the server
 * falls back to whatever addresses are already known (current behavior).
 */
export const getServerIps = async (serverId?: string): Promise<string[]> => {
	const ips = new Set<string>();

	try {
		if (serverId) {
			const server = await findServerById(serverId);
			if (server.ipAddress) {
				ips.add(server.ipAddress);
			}
			const { stdout } = await execAsyncRemote(serverId, COLLECT_IPS_COMMAND);
			for (const ip of parseIps(stdout)) {
				ips.add(ip);
			}
		} else {
			const settings = await getWebServerSettings();
			if (settings?.serverIp) {
				ips.add(settings.serverIp);
			}
			const { stdout } = await execAsync(COLLECT_IPS_COMMAND);
			for (const ip of parseIps(stdout)) {
				ips.add(ip);
			}
		}
	} catch (error) {
		console.error("Error collecting server IPs for domain validation", error);
	}

	return Array.from(ips);
};

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

		// If we know the server's IPs, the domain is valid when it resolves to any
		// of them (a server can legitimately have several addresses).
		const candidateIps = (expectedIps ?? []).filter(Boolean);
		if (candidateIps.length > 0) {
			const isValid = resolvedIps.some((ip) => candidateIps.includes(ip));
			return {
				isValid,
				resolvedIp: resolvedIps.join(", "),
				error: !isValid
					? `Domain resolves to ${resolvedIps.join(", ")} but should point to one of the server IPs: ${candidateIps.join(", ")}`
					: undefined,
			};
		}

		// If no expected IPs, just return the resolved IP
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

export type DomainValidationMode = "auto" | "proxy" | "skip";

/**
 * Resolves the expected IPs from the domain's validation mode and delegates to
 * `validateDomain`:
 * - auto: match against every IP the target server is reachable at.
 * - proxy: match against a user-provided IP (a reverse proxy or load balancer).
 * - skip: only confirm the domain resolves, without matching any IP.
 */
export const validateDomainForServer = async (params: {
	domain: string;
	validationMode?: DomainValidationMode;
	expectedIp?: string | null;
	serverId?: string;
	serverIp?: string;
}) => {
	const {
		domain,
		validationMode = "auto",
		expectedIp,
		serverId,
		serverIp,
	} = params;

	if (validationMode === "skip") {
		return validateDomain(domain);
	}

	if (validationMode === "proxy") {
		// Proxy mode must check against an explicit IP. Without one we would fall
		// through to a resolve-only "valid" result, silently behaving like skip.
		const trimmedExpectedIp = expectedIp?.trim();
		if (!trimmedExpectedIp) {
			return {
				isValid: false,
				error: "Proxy validation requires an expected IP address",
			};
		}
		return validateDomain(domain, [trimmedExpectedIp]);
	}

	const expectedIps = await getServerIps(serverId);
	if (serverIp) {
		expectedIps.push(serverIp);
	}
	return validateDomain(domain, Array.from(new Set(expectedIps)));
};
