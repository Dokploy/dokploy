import { TRPCError } from "@trpc/server";
import { domainProviders } from "../db/schema/domain-provider";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { decryptToken } from "../providers/encryption";

interface NetlifyDnsRecord {
	id?: string;
	type: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "SRV" | "CAA";
	hostname: string;
	value: string;
	ttl?: number;
	priority?: number;
}

interface NetlifyDnsZone {
	id: string;
	name: string;
	dns_servers: string[];
	records: NetlifyDnsRecord[];
}

// OAuth helper functions
const getAccessToken = async (provider: typeof domainProviders.$inferSelect): Promise<string | null> => {
	try {
		// For direct auth method, use the API token directly
		if (provider.authMethod === "direct") {
			return decryptToken(provider.apiToken || "");
		}

		// For OAuth method, check if we have a valid, non-expired access token
		if (provider.accessToken && provider.tokenExpiresAt) {
			const expirationTime = new Date(provider.tokenExpiresAt);
			if (expirationTime > new Date()) {
				return decryptToken(provider.accessToken);
			}
		}

		// If no valid OAuth token, return null to indicate OAuth flow is needed
		return null;
	} catch (error) {
		console.error("Error getting access token:", error);
		return null;
	}
};

const refreshAccessToken = async (provider: typeof domainProviders.$inferSelect): Promise<string | null> => {
	if (!provider.refreshToken) {
		return null;
	}

	try {
		const clientId = provider.clientId ? decryptToken(provider.clientId) : null;
		const clientSecret = provider.clientSecret ? decryptToken(provider.clientSecret) : null;

		if (!clientId || !clientSecret) {
			return null;
		}

		const response = await fetch("https://api.netlify.com/oauth/token", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				grant_type: "refresh_token",
				refresh_token: decryptToken(provider.refreshToken),
				client_id: clientId,
				client_secret: clientSecret,
			}),
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const tokenData = await response.json();

		// Update provider with new token data
		await db
			.update(domainProviders)
			.set({
				accessToken: tokenData.access_token,
				refreshToken: tokenData.refresh_token || provider.refreshToken,
				tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
			})
			.where(eq(domainProviders.domainProviderId, provider.domainProviderId));

		return tokenData.access_token;
	} catch (error) {
		console.error("Error refreshing access token:", error);
		return null;
	}
};

export const testConnection = async (provider: typeof domainProviders.$inferSelect) => {
	try {
		let token = await getAccessToken(provider);

		// If no valid token and using OAuth, try to refresh
		if (!token && provider.authMethod === "oauth" && provider.refreshToken) {
			token = await refreshAccessToken(provider);
		}

		if (!token) {
			if (provider.authMethod === "oauth") {
				return {
					success: false,
					message: "OAuth authorization required. Please complete the OAuth flow to connect to Netlify.",
					requiresOAuth: true,
				};
			} else {
				throw new Error("No valid access token found. Please check your API token configuration.");
			}
		}

		const response = await fetch("https://api.netlify.com/api/v1/sites", {
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
		}

		const sites = await response.json();
		const authMethodLabel = provider.authMethod === "oauth" ? "OAuth" : "Direct Access Token";
		return {
			success: true,
			message: `Connection successful (${authMethodLabel}). Found ${sites.length} site(s) in account.`,
		};
	} catch (error) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: error instanceof Error ? error.message : "Failed to connect to Netlify API",
		});
	}
};

export const listDnsZones = async (provider: typeof domainProviders.$inferSelect) => {
	try {
		let token = await getAccessToken(provider);

		// If no valid token and using OAuth, try to refresh
		if (!token && provider.authMethod === "oauth" && provider.refreshToken) {
			token = await refreshAccessToken(provider);
		}

		if (!token) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: provider.authMethod === "oauth"
					? "OAuth authorization required. Please complete the OAuth flow to connect to Netlify."
					: "No valid access token found. Please check your API token configuration.",
			});
		}

		const response = await fetch("https://api.netlify.com/api/v1/dns_zones", {
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
		}

		const zones = await response.json();
		return zones.map((zone: any) => ({
			id: zone.id,
			name: zone.name,
			dns_servers: zone.dns_servers || [],
			records: zone.records || [],
		}));
	} catch (error) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: error instanceof Error ? error.message : "Failed to list DNS zones",
		});
	}
};

export const listDnsRecords = async (
	provider: typeof domainProviders.$inferSelect,
	zoneId: string
) => {
	if (!provider.apiToken) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "API Token is required for Netlify DNS",
		});
	}

	try {
		const response = await fetch(
			`https://api.netlify.com/api/v1/dns_zones/${zoneId}/records`,
			{
				headers: {
					Authorization: `Bearer ${provider.apiToken}`,
					"Content-Type": "application/json",
				},
			}
		);

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
		}

		const records = await response.json();
		return records.map((record: any) => ({
			id: record.id,
			type: record.type,
			hostname: record.hostname,
			value: record.value,
			ttl: record.ttl,
			priority: record.priority,
		}));
	} catch (error) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: error instanceof Error ? error.message : "Failed to list DNS records",
		});
	}
};

export const createDnsRecord = async (
	provider: typeof domainProviders.$inferSelect,
	zoneId: string,
	record: Omit<NetlifyDnsRecord, "id">
) => {
	if (!provider.apiToken) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "API Token is required for Netlify DNS",
		});
	}

	try {
		const response = await fetch(
			`https://api.netlify.com/api/v1/dns_zones/${zoneId}/records`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${provider.apiToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(record),
			}
		);

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
		}

		return await response.json();
	} catch (error) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: error instanceof Error ? error.message : "Failed to create DNS record",
		});
	}
};

export const deleteDnsRecord = async (
	provider: typeof domainProviders.$inferSelect,
	zoneId: string,
	recordId: string
) => {
	if (!provider.apiToken) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "API Token is required for Netlify DNS",
		});
	}

	try {
		const response = await fetch(
			`https://api.netlify.com/api/v1/dns_zones/${zoneId}/records/${recordId}`,
			{
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${provider.apiToken}`,
				},
			}
		);

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
		}

		return { success: true };
	} catch (error) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: error instanceof Error ? error.message : "Failed to delete DNS record",
		});
	}
};