import { TRPCError } from "@trpc/server";
import type { domainProviders } from "../db/schema/domain-provider";

interface NamecheapDomainInfo {
	DomainName: string;
	DomainID: string;
	User: string;
	Created: string;
	Expires: string;
	IsExpired: boolean;
	IsLocked: boolean;
	AutoRenew: boolean;
	WhoisGuard: string;
	IsPremium: boolean;
	IsOurDNS: boolean;
}

interface NamecheapDnsRecord {
	HostId: number;
	HostName: string;
	RecordType: string;
	Address: string;
	MXPref: number;
	TTL: number;
	AssociatedAppTitle: string;
	IsSsl: boolean;
	IsActive: boolean;
}

interface NamecheapDomainPurchaseRequest {
	DomainName: string;
	Years: number;
	PromotionCode?: string;
	FirstName: string;
	LastName: string;
	Address1: string;
	City: string;
	StateProvince: string;
	PostalCode: string;
	Country: string;
	Phone: string;
	EmailAddress: string;
	AddFreeWhoisguard: boolean;
}

export const testConnection = async (provider: typeof domainProviders.$inferSelect) => {
	if (!provider.apiKey || !provider.apiUser || !provider.clientIp) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "API Key, API User, and Client IP are required for Namecheap",
		});
	}

	try {
		const baseUrl = "https://api.namecheap.com/xml.response";
		const params = new URLSearchParams({
			ApiUser: provider.apiUser,
			ApiKey: provider.apiKey,
			ClientIP: provider.clientIp,
			Command: "namecheap.users.getinfo",
		});

		const response = await fetch(`${baseUrl}?${params}`);

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const text = await response.text();

		// Parse XML response (simple check for success)
		if (text.includes('<Status>ERROR</Status>')) {
			const errorMatch = text.match(/<Error>(.*?)<\/Error>/);
			throw new Error(errorMatch?.[1] || "Unknown Namecheap API error");
		}

		if (!text.includes('<Status>OK</Status>')) {
			throw new Error("Invalid response from Namecheap API");
		}

		return {
			success: true,
			message: "Connection to Namecheap API successful",
		};
	} catch (error) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: error instanceof Error ? error.message : "Failed to connect to Namecheap API",
		});
	}
};

export const listDomains = async (provider: typeof domainProviders.$inferSelect) => {
	if (!provider.apiKey || !provider.apiUser || !provider.clientIp) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "API Key, API User, and Client IP are required for Namecheap",
		});
	}

	try {
		const baseUrl = "https://api.namecheap.com/xml.response";
		const params = new URLSearchParams({
			ApiUser: provider.apiUser,
			ApiKey: provider.apiKey,
			ClientIP: provider.clientIp,
			Command: "namecheap.domains.getList",
			ListType: "ALL",
		});

		const response = await fetch(`${baseUrl}?${params}`);

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const text = await response.text();

		if (text.includes('<Status>ERROR</Status>')) {
			const errorMatch = text.match(/<Error>(.*?)<\/Error>/);
			throw new Error(errorMatch?.[1] || "Unknown Namecheap API error");
		}

		// Parse domain list from XML
		const domainMatches = text.matchAll(/<Domain([^>]*)>(.*?)<\/Domain>/gs);
		const domains: NamecheapDomainInfo[] = [];

		for (const match of domainMatches) {
			const domainXml = match[0];
			const domainInfo: NamecheapDomainInfo = {
				DomainName: getXmlValue(domainXml, 'DomainName'),
				DomainID: getXmlValue(domainXml, 'DomainID'),
				User: getXmlValue(domainXml, 'User'),
				Created: getXmlValue(domainXml, 'Created'),
				Expires: getXmlValue(domainXml, 'Expires'),
				IsExpired: getXmlValue(domainXml, 'IsExpired') === 'true',
				IsLocked: getXmlValue(domainXml, 'IsLocked') === 'true',
				AutoRenew: getXmlValue(domainXml, 'AutoRenew') === 'true',
				WhoisGuard: getXmlValue(domainXml, 'WhoisGuard'),
				IsPremium: getXmlValue(domainXml, 'IsPremium') === 'true',
				IsOurDNS: getXmlValue(domainXml, 'IsOurDNS') === 'true',
			};
			domains.push(domainInfo);
		}

		return domains;
	} catch (error) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: error instanceof Error ? error.message : "Failed to list domains",
		});
	}
};

export const checkDomainAvailability = async (
	provider: typeof domainProviders.$inferSelect,
	domains: string[]
) => {
	if (!provider.apiKey || !provider.apiUser || !provider.clientIp) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "API Key, API User, and Client IP are required for Namecheap",
		});
	}

	try {
		const baseUrl = "https://api.namecheap.com/xml.response";
		const params = new URLSearchParams({
			ApiUser: provider.apiUser,
			ApiKey: provider.apiKey,
			ClientIP: provider.clientIp,
			Command: "namecheap.domains.check",
			DomainList: domains.join(','),
		});

		const response = await fetch(`${baseUrl}?${params}`);

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const text = await response.text();

		if (text.includes('<Status>ERROR</Status>')) {
			const errorMatch = text.match(/<Error>(.*?)<\/Error>/);
			throw new Error(errorMatch?.[1] || "Unknown Namecheap API error");
		}

		// Parse availability results
		const results: Record<string, { available: boolean; price?: string }> = {};
		const domainMatches = text.matchAll(/<Domain[^>]*DomainName="([^"]*)"[^>]*Available="([^"]*)"[^>]*>/gs);

		for (const match of domainMatches) {
			const domainName = match[1];
			if (!domainName) continue;
			const available = match[2] === 'true';
			results[domainName] = { available };
		}

		return results;
	} catch (error) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: error instanceof Error ? error.message : "Failed to check domain availability",
		});
	}
};

export const purchaseDomain = async (
	provider: typeof domainProviders.$inferSelect,
	purchaseRequest: NamecheapDomainPurchaseRequest
) => {
	if (!provider.enablePurchase) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Domain purchases are not enabled for this provider",
		});
	}

	if (!provider.apiKey || !provider.apiUser || !provider.clientIp) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "API Key, API User, and Client IP are required for Namecheap",
		});
	}

	try {
		const baseUrl = "https://api.namecheap.com/xml.response";
		const params = new URLSearchParams({
			ApiUser: provider.apiUser,
			ApiKey: provider.apiKey,
			ClientIP: provider.clientIp,
			Command: "namecheap.domains.create",
			DomainName: purchaseRequest.DomainName,
			Years: purchaseRequest.Years.toString(),
			FirstName: purchaseRequest.FirstName,
			LastName: purchaseRequest.LastName,
			Address1: purchaseRequest.Address1,
			City: purchaseRequest.City,
			StateProvince: purchaseRequest.StateProvince,
			PostalCode: purchaseRequest.PostalCode,
			Country: purchaseRequest.Country,
			Phone: purchaseRequest.Phone,
			EmailAddress: purchaseRequest.EmailAddress,
			AddFreeWhoisguard: purchaseRequest.AddFreeWhoisguard ? 'yes' : 'no',
		});

		if (purchaseRequest.PromotionCode) {
			params.append('PromotionCode', purchaseRequest.PromotionCode);
		}

		const response = await fetch(`${baseUrl}?${params}`, {
			method: "POST",
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const text = await response.text();

		if (text.includes('<Status>ERROR</Status>')) {
			const errorMatch = text.match(/<Error>(.*?)<\/Error>/);
			throw new Error(errorMatch?.[1] || "Unknown Namecheap API error");
		}

		// Parse order details
		const orderMatch = text.match(/<Order[^>]*OrderID="([^"]*)"[^>]*>/);
		const orderId = orderMatch?.[1];

		return {
			success: true,
			orderId: orderId || 'unknown',
			message: `Domain ${purchaseRequest.DomainName} purchase initiated successfully`,
		};
	} catch (error) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: error instanceof Error ? error.message : "Failed to purchase domain",
		});
	}
};

export const getDnsRecords = async (
	provider: typeof domainProviders.$inferSelect,
	sld: string, // Second-level domain (e.g., "example" in "example.com")
	tld: string // Top-level domain (e.g., "com")
) => {
	if (!provider.apiKey || !provider.apiUser || !provider.clientIp) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "API Key, API User, and Client IP are required for Namecheap",
		});
	}

	try {
		const baseUrl = "https://api.namecheap.com/xml.response";
		const params = new URLSearchParams({
			ApiUser: provider.apiUser,
			ApiKey: provider.apiKey,
			ClientIP: provider.clientIp,
			Command: "namecheap.domains.dns.getHosts",
			SLD: sld,
			TLD: tld,
		});

		const response = await fetch(`${baseUrl}?${params}`);

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const text = await response.text();

		if (text.includes('<Status>ERROR</Status>')) {
			const errorMatch = text.match(/<Error>(.*?)<\/Error>/);
			throw new Error(errorMatch?.[1] || "Unknown Namecheap API error");
		}

		// Parse DNS records
		const recordMatches = text.matchAll(/<host[^>]*>(.*?)<\/host>/gs);
		const records: NamecheapDnsRecord[] = [];

		for (const match of recordMatches) {
			const hostXml = match[0];
			const record: NamecheapDnsRecord = {
				HostId: parseInt(getXmlAttribute(hostXml, 'HostId') || '0'),
				HostName: getXmlValue(hostXml, 'HostName'),
				RecordType: getXmlValue(hostXml, 'RecordType'),
				Address: getXmlValue(hostXml, 'Address'),
				MXPref: parseInt(getXmlValue(hostXml, 'MXPref') || '0'),
				TTL: parseInt(getXmlValue(hostXml, 'TTL') || '3600'),
				AssociatedAppTitle: getXmlValue(hostXml, 'AssociatedAppTitle'),
				IsSsl: getXmlValue(hostXml, 'IsSsl') === 'true',
				IsActive: getXmlValue(hostXml, 'IsActive') === 'true',
			};
			records.push(record);
		}

		return records;
	} catch (error) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: error instanceof Error ? error.message : "Failed to get DNS records",
		});
	}
};

// Helper functions for XML parsing
function getXmlValue(xml: string, tag: string): string {
	const match = xml.match(new RegExp(`<${tag}[^>]*>(.*?)<\/${tag}>`, 's'));
	return match?.[1]?.trim() ?? '';
}

function getXmlAttribute(xml: string, attribute: string): string | null {
	const match = xml.match(new RegExp(`${attribute}="([^"]*)"`, 'i'));
	return match?.[1] ?? null;
}