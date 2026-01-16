import { db } from "@dokploy/server/db";
import {
	type apiCreateProxy,
	type apiUpdateProxy,
	proxies,
} from "@dokploy/server/db/schema";
import { isWildcardDomain } from "@dokploy/server/utils/domain/wildcard";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { manageProxyDomain, removeProxyDomain } from "../utils/traefik/proxy";

export type Proxy = typeof proxies.$inferSelect;

export const findProxyById = async (proxyId: string) => {
	const proxy = await db.query.proxies.findFirst({
		where: eq(proxies.proxyId, proxyId),
	});

	if (!proxy) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Proxy not found",
		});
	}

	return proxy;
};

export const validateProxyConfig = (
	proxyData: z.infer<typeof apiCreateProxy> | z.infer<typeof apiUpdateProxy>,
): { isValid: boolean; errors: string[] } => {
	const errors: string[] = [];

	if (!proxyData.name || proxyData.name.trim().length === 0) {
		errors.push("Proxy name is required");
	}

	if (!proxyData.host || proxyData.host.trim().length === 0) {
		errors.push("Host is required");
	}

	// Validate target configuration based on targetType
	if (proxyData.targetType === "url") {
		if (!proxyData.targetUrl) {
			errors.push("Target URL is required when target type is URL");
		} else {
			try {
				new URL(proxyData.targetUrl);
			} catch {
				errors.push("Target URL must be a valid URL");
			}
		}
	} else {
		if (!proxyData.targetId) {
			errors.push("Target ID is required when linking to application/compose/service");
		}
	}

	// Validate certificate configuration
	if (proxyData.https) {
		if (!proxyData.certificateType || proxyData.certificateType === "none") {
			errors.push("Certificate type is required when HTTPS is enabled");
		}
		if (proxyData.certificateType === "custom" && !proxyData.customCertResolver) {
			errors.push("Custom certificate resolver is required when certificate type is custom");
		}
	}

	// Validate path configuration
	if (proxyData.stripPath && (!proxyData.path || proxyData.path === "/")) {
		errors.push("Strip path can only be enabled when a path other than '/' is specified");
	}

	if (
		proxyData.internalPath &&
		proxyData.internalPath !== "/" &&
		!proxyData.internalPath.startsWith("/")
	) {
		errors.push("Internal path must start with '/'");
	}

	// Validate port
	if (proxyData.port !== undefined) {
		if (proxyData.port < 1 || proxyData.port > 65535) {
			errors.push("Port must be between 1 and 65535");
		}
	}

	return {
		isValid: errors.length === 0,
		errors,
	};
};

export const createProxy = async (
	proxyData: z.infer<typeof apiCreateProxy>,
	organizationId: string,
) => {
	// Validate configuration
	const validation = validateProxyConfig(proxyData);
	if (!validation.isValid) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Proxy validation failed: ${validation.errors.join(", ")}`,
		});
	}

	// Determine if wildcard
	const isWildcard = isWildcardDomain(proxyData.host);

	// Create proxy
	const proxy = await db
		.insert(proxies)
		.values({
			...proxyData,
			organizationId,
			isWildcard,
			updatedAt: new Date().toISOString(),
		})
		.returning();

	if (!proxy || proxy[0] === undefined) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Failed to create the proxy",
		});
	}

	const createdProxy = proxy[0];

	// Create Traefik configuration
	await manageProxyDomain(createdProxy);

	return createdProxy;
};

export const updateProxy = async (
	proxyData: z.infer<typeof apiUpdateProxy>,
) => {
	const existing = await findProxyById(proxyData.proxyId);

	// Validate configuration
	const validation = validateProxyConfig(proxyData);
	if (!validation.isValid) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Proxy validation failed: ${validation.errors.join(", ")}`,
		});
	}

	// Determine if wildcard
	const isWildcard = proxyData.host
		? isWildcardDomain(proxyData.host)
		: existing.isWildcard;

	// Update proxy
	const updated = await db
		.update(proxies)
		.set({
			...proxyData,
			isWildcard,
			updatedAt: new Date().toISOString(),
		})
		.where(eq(proxies.proxyId, proxyData.proxyId))
		.returning();

	if (!updated || updated[0] === undefined) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Failed to update the proxy",
		});
	}

	const updatedProxy = updated[0];

	// Update Traefik configuration
	await manageProxyDomain(updatedProxy);

	return updatedProxy;
};

export const deleteProxy = async (proxyId: string) => {
	const proxy = await findProxyById(proxyId);

	// Remove Traefik configuration
	await removeProxyDomain(proxy);

	// Delete proxy
	const result = await db
		.delete(proxies)
		.where(eq(proxies.proxyId, proxyId))
		.returning();

	if (!result || result.length === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Failed to delete the proxy",
		});
	}

	return result[0];
};

export const listProxies = async (organizationId: string) => {
	return await db.query.proxies.findMany({
		where: eq(proxies.organizationId, organizationId),
		orderBy: (proxies, { desc }) => [desc(proxies.createdAt)],
	});
};

export const linkToService = async (
	proxyId: string,
	targetType: "application" | "compose" | "service",
	targetId: string,
) => {
	const proxy = await findProxyById(proxyId);

	const updated = await db
		.update(proxies)
		.set({
			targetType,
			targetId,
			updatedAt: new Date().toISOString(),
		})
		.where(eq(proxies.proxyId, proxyId))
		.returning();

	if (!updated || updated[0] === undefined) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Failed to link proxy to service",
		});
	}

	const updatedProxy = updated[0];

	// Update Traefik configuration
	await manageProxyDomain(updatedProxy);

	return updatedProxy;
};

export const unlinkFromService = async (proxyId: string) => {
	const proxy = await findProxyById(proxyId);

	const updated = await db
		.update(proxies)
		.set({
			targetType: "url",
			targetId: null,
			updatedAt: new Date().toISOString(),
		})
		.where(eq(proxies.proxyId, proxyId))
		.returning();

	if (!updated || updated[0] === undefined) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Failed to unlink proxy from service",
		});
	}

	const updatedProxy = updated[0];

	// Update Traefik configuration
	await manageProxyDomain(updatedProxy);

	return updatedProxy;
};

