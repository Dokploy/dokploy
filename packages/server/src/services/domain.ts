import dns from "node:dns";
import type { WriteStream } from "node:fs";
import { promisify } from "node:util";
import { db } from "@dokploy/server/db";
import { generateRandomDomain } from "@dokploy/server/templates";
import { manageDomain } from "@dokploy/server/utils/traefik/domain";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import {
	type apiCreateDomain,
	applications,
	compose,
	domains,
	previewDeployments,
	type server,
} from "../db/schema";
import { findUserById } from "./admin";
import { findApplicationById } from "./application";
import { detectCDNProvider } from "./cdn";
import { connectTraefikToResourceNetworks, findNetworkById } from "./network";
import { findServerById } from "./server";

export type Domain = typeof domains.$inferSelect;

export const ensureTraefikConnectedToDomainNetworks = async (
	applicationId: string,
	serverId: string | null | undefined,
	writeStream?: WriteStream,
): Promise<void> => {
	const domains = await findDomainsByApplicationId(applicationId);

	if (domains && domains.length > 0) {
		const domainNetworkIds = domains
			.map((d) => d.networkId)
			.filter((id): id is string => id !== null);

		if (domainNetworkIds.length > 0) {
			await connectTraefikToResourceNetworks(
				applicationId,
				"application",
				serverId,
				domainNetworkIds[0],
			);
			writeStream?.write("\n✅ Traefik connected to domain network");
		}
	}
};

const validateNetworkForDomain = async (
	networkId: string,
	resourceId: string,
	resourceType: "application" | "compose" | "preview",
	excludeDomainId?: string,
): Promise<void> => {
	const network = await findNetworkById(networkId);

	// Check if network is internal
	if (network.internal) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Cannot use an internal network for domain routing. Traefik cannot connect to internal networks. Please select a non-internal network or leave empty to use dokploy-network.",
		});
	}

	// Get resource to check server and network assignment
	let resource:
		| (typeof applications.$inferSelect & {
				server: typeof server.$inferSelect | null;
		  })
		| (typeof compose.$inferSelect & {
				server: typeof server.$inferSelect | null;
		  })
		| (typeof previewDeployments.$inferSelect & {
				application: typeof applications.$inferSelect & {
					server: typeof server.$inferSelect | null;
				};
		  })
		| undefined;

	if (resourceType === "application") {
		resource = await db.query.applications.findFirst({
			where: eq(applications.applicationId, resourceId),
			with: { server: true },
		});
	} else if (resourceType === "compose") {
		resource = await db.query.compose.findFirst({
			where: eq(compose.composeId, resourceId),
			with: { server: true },
		});
	} else {
		resource = await db.query.previewDeployments.findFirst({
			where: eq(previewDeployments.previewDeploymentId, resourceId),
			with: { application: { with: { server: true } } },
		});
	}

	if (!resource) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `${resourceType} not found`,
		});
	}

	// For previews, get serverId and networks from application
	const actualServerId =
		resourceType === "preview"
			? (resource as any).application?.serverId
			: (resource as any).serverId;
	const actualServer =
		resourceType === "preview"
			? (resource as any).application?.server
			: (resource as any).server;

	if (network.serverId !== actualServerId) {
		const networkLocation = network.serverId
			? `server "${network.server?.name || network.serverId}"`
			: "local server";
		const resourceLocation = actualServerId
			? `server "${actualServer?.name || actualServerId}"`
			: "local server";

		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Network is on ${networkLocation} but ${resourceType} is on ${resourceLocation}. Both must be on the same server.`,
		});
	}

	// For previews, check against application's previewNetworkIds
	const customNetworkIds =
		resourceType === "preview"
			? Array.from(
					(resource as any).application?.previewNetworkIds ||
						(resource as any).application?.customNetworkIds ||
						[],
				)
			: Array.from((resource as any).customNetworkIds || []);

	if (!customNetworkIds.includes(networkId)) {
		const message =
			resourceType === "preview"
				? `Network "${network.name}" is not allowed for preview deployments. Please configure preview networks in the application settings.`
				: `Network "${network.name}" is not assigned to this ${resourceType}. Please assign the network to the ${resourceType} first in the Networks tab.`;

		throw new TRPCError({
			code: "BAD_REQUEST",
			message,
		});
	}

	if (resourceType === "application") {
		const allDomains = await findDomainsByApplicationId(resourceId);
		const existingDomains = excludeDomainId
			? allDomains.filter((d) => d.domainId !== excludeDomainId)
			: allDomains;

		const hasConflict = existingDomains.some((d) => d.networkId !== networkId);

		if (hasConflict) {
			const conflictingDomain = existingDomains.find(
				(d) => d.networkId !== networkId,
			);

			if (conflictingDomain) {
				const conflictNetworkName = conflictingDomain.networkId
					? (await findNetworkById(conflictingDomain.networkId)).name
					: "Default (dokploy-network)";
				const newNetworkName = networkId
					? network.name
					: "Default (dokploy-network)";

				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `This application already has domain "${conflictingDomain.host}" using network "${conflictNetworkName}". All domains must use the same network due to Docker/Traefik limitations. Please use "${conflictNetworkName}" for all domains.`,
				});
			}
		}
	} else if (resourceType === "compose") {
		const allDomains = await findDomainsByComposeId(resourceId);
		const existingDomains = excludeDomainId
			? allDomains.filter((d) => d.domainId !== excludeDomainId)
			: allDomains;

		const hasConflict = existingDomains.some((d) => d.networkId !== networkId);

		if (hasConflict) {
			const conflictingDomain = existingDomains.find(
				(d) => d.networkId !== networkId,
			);

			if (conflictingDomain) {
				const conflictNetworkName = conflictingDomain.networkId
					? (await findNetworkById(conflictingDomain.networkId)).name
					: "Default (dokploy-network)";

				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `This compose already has domain "${conflictingDomain.host}" using network "${conflictNetworkName}". All domains must use the same network due to Docker/Traefik limitations. Please use "${conflictNetworkName}" for all domains.`,
				});
			}
		}
	} else if (resourceType === "preview") {
		const allDomains = await findDomainsByPreviewDeploymentId(resourceId);
		const existingDomains = excludeDomainId
			? allDomains.filter((d) => d.domainId !== excludeDomainId)
			: allDomains;

		const hasConflict = existingDomains.some((d) => d.networkId !== networkId);

		if (hasConflict) {
			const conflictingDomain = existingDomains.find(
				(d) => d.networkId !== networkId,
			);

			if (conflictingDomain) {
				const conflictNetworkName = conflictingDomain.networkId
					? (await findNetworkById(conflictingDomain.networkId)).name
					: "Default (dokploy-network)";

				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `This preview already has domain "${conflictingDomain.host}" using network "${conflictNetworkName}". All domains must use the same network due to Docker/Traefik limitations. Please use "${conflictNetworkName}" for all domains.`,
				});
			}
		}
	}
};

const validateDomainNetworkConsistency = async (
	networkId: string | null | undefined,
	resourceId: string,
	resourceType: "application" | "compose" | "preview",
	excludeDomainId?: string,
): Promise<void> => {
	const allDomains =
		resourceType === "application"
			? await findDomainsByApplicationId(resourceId)
			: resourceType === "compose"
				? await findDomainsByComposeId(resourceId)
				: await findDomainsByPreviewDeploymentId(resourceId);

	const existingDomains = excludeDomainId
		? allDomains.filter((d) => d.domainId !== excludeDomainId)
		: allDomains;

	if (existingDomains.length === 0) {
		return;
	}

	const normalizedNetworkId = networkId ?? null;
	const hasConflict = existingDomains.some(
		(d) => (d.networkId ?? null) !== normalizedNetworkId,
	);

	if (hasConflict) {
		const conflictingDomain = existingDomains.find(
			(d) => (d.networkId ?? null) !== normalizedNetworkId,
		);

		if (conflictingDomain) {
			const conflictNetworkName = conflictingDomain.networkId
				? (await findNetworkById(conflictingDomain.networkId)).name
				: "Default (dokploy-network)";
			const newNetworkName = normalizedNetworkId
				? (await findNetworkById(normalizedNetworkId)).name
				: "Default (dokploy-network)";

			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `This ${resourceType} already has domain "${conflictingDomain.host}" using network "${conflictNetworkName}". All domains must use the same network due to Docker/Traefik limitations. Please use "${conflictNetworkName}" for all domains.`,
			});
		}
	}
};

export const createDomain = async (input: typeof apiCreateDomain._type) => {
	if (input.applicationId) {
		await validateDomainNetworkConsistency(
			input.networkId,
			input.applicationId,
			"application",
		);
	} else if (input.composeId) {
		await validateDomainNetworkConsistency(
			input.networkId,
			input.composeId,
			"compose",
		);
	} else if (input.previewDeploymentId) {
		await validateDomainNetworkConsistency(
			input.networkId,
			input.previewDeploymentId,
			"preview",
		);
	}

	if (input.networkId) {
		if (input.applicationId) {
			await validateNetworkForDomain(
				input.networkId,
				input.applicationId,
				"application",
			);
		} else if (input.composeId) {
			await validateNetworkForDomain(
				input.networkId,
				input.composeId,
				"compose",
			);
		} else if (input.previewDeploymentId) {
			await validateNetworkForDomain(
				input.networkId,
				input.previewDeploymentId,
				"preview",
			);
		}
	}

	const result = await db.transaction(async (tx) => {
		const domain = await tx
			.insert(domains)
			.values({
				...input,
			})
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
			await connectTraefikToResourceNetworks(
				domain.applicationId,
				"application",
				application.serverId,
				domain.networkId,
			);
		}

		if (domain.composeId) {
			const compose = await db.query.compose.findFirst({
				where: (compose, { eq }) => eq(compose.composeId, domain.composeId!),
			});

			if (compose) {
				await connectTraefikToResourceNetworks(
					domain.composeId,
					"compose",
					compose.serverId,
					domain.networkId,
				);
			}
		}

		return domain;
	});

	return result;
};

export const generateTraefikMeDomain = async (
	appName: string,
	userId: string,
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
	const admin = await findUserById(userId);
	return generateRandomDomain({
		serverIp: admin?.serverIp || "",
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
			network: true,
		},
	});

	return domainsArray;
};

export const findDomainsByComposeId = async (composeId: string) => {
	const domainsArray = await db.query.domains.findMany({
		where: eq(domains.composeId, composeId),
		with: {
			compose: true,
			network: true,
		},
	});

	return domainsArray;
};

export const findDomainsByPreviewDeploymentId = async (
	previewDeploymentId: string,
) => {
	const domainsArray = await db.query.domains.findMany({
		where: eq(domains.previewDeploymentId, previewDeploymentId),
		with: {
			previewDeployment: true,
			network: true,
		},
	});

	return domainsArray;
};

const updateDomainById = async (
	domainId: string,
	domainData: Partial<Domain>,
) => {
	const domain = await db
		.update(domains)
		.set({
			...domainData,
		})
		.where(eq(domains.domainId, domainId))
		.returning();

	return domain[0];
};

export const updateDomain = async (
	domainId: string,
	domainData: Partial<Domain>,
) => {
	const existingDomain = await findDomainById(domainId);

	if (
		domainData.networkId !== undefined &&
		domainData.networkId !== existingDomain.networkId
	) {
		if (existingDomain.applicationId) {
			await validateDomainNetworkConsistency(
				domainData.networkId,
				existingDomain.applicationId,
				"application",
				domainId,
			);
		} else if (existingDomain.composeId) {
			await validateDomainNetworkConsistency(
				domainData.networkId,
				existingDomain.composeId,
				"compose",
				domainId,
			);
		}
	}

	if (
		domainData.networkId !== undefined &&
		domainData.networkId !== existingDomain.networkId
	) {
		if (domainData.networkId) {
			if (existingDomain.applicationId) {
				await validateNetworkForDomain(
					domainData.networkId,
					existingDomain.applicationId,
					"application",
					domainId,
				);
			} else if (existingDomain.composeId) {
				await validateNetworkForDomain(
					domainData.networkId,
					existingDomain.composeId,
					"compose",
					domainId,
				);
			} else if (existingDomain.previewDeploymentId) {
				await validateNetworkForDomain(
					domainData.networkId,
					existingDomain.previewDeploymentId,
					"preview",
					domainId,
				);
			}
		}
	}

	const updatedDomain = await updateDomainById(domainId, domainData);

	if (!updatedDomain) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to update domain",
		});
	}

	if (
		domainData.networkId !== undefined &&
		domainData.networkId !== existingDomain.networkId
	) {
		if (updatedDomain.applicationId) {
			const application = await findApplicationById(
				updatedDomain.applicationId,
			);
			await connectTraefikToResourceNetworks(
				updatedDomain.applicationId,
				"application",
				application.serverId,
				domainData.networkId,
			);
		} else if (updatedDomain.composeId) {
			const compose = await db.query.compose.findFirst({
				where: (compose, { eq }) =>
					eq(compose.composeId, updatedDomain.composeId!),
			});
			if (compose) {
				await connectTraefikToResourceNetworks(
					updatedDomain.composeId,
					"compose",
					compose.serverId,
					domainData.networkId,
				);
			}
		}
	}

	return updatedDomain;
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
