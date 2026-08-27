import { describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: { dnsProvider: { findFirst: vi.fn(), findMany: vi.fn() } },
		insert: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
	},
}));

import {
	DNS_SECRET_MASK,
	findDnsZoneForHost,
	maskDnsProviderConfig,
	mergeDnsProviderConfig,
} from "@dokploy/server/services/dns-provider";

describe("findDnsZoneForHost", () => {
	const zones = [
		{ id: "example", name: "example.com" },
		{ id: "apps", name: "apps.example.com." },
	];

	it("selects the most specific matching zone", () => {
		expect(findDnsZoneForHost(zones, "api.apps.example.com")).toEqual(zones[1]);
	});

	it("matches wildcard hosts and ignores a trailing dot", () => {
		expect(findDnsZoneForHost(zones, "*.example.com.")).toEqual(zones[0]);
	});

	it("does not match a hostname with only a similar suffix", () => {
		expect(findDnsZoneForHost(zones, "notexample.com")).toBeUndefined();
	});
});

describe("maskDnsProviderConfig", () => {
	it("masks the apiToken for a cloudflare config", () => {
		const masked = maskDnsProviderConfig({
			providerType: "cloudflare",
			apiToken: "real-token",
		});

		expect(masked).toEqual({
			providerType: "cloudflare",
			apiToken: DNS_SECRET_MASK,
		});
	});

	it("masks only the secretAccessKey for a route53 config, keeping accessKeyId visible", () => {
		const masked = maskDnsProviderConfig({
			providerType: "route53",
			accessKeyId: "AKIA_VISIBLE",
			secretAccessKey: "shh",
		});

		expect(masked).toEqual({
			providerType: "route53",
			accessKeyId: "AKIA_VISIBLE",
			secretAccessKey: DNS_SECRET_MASK,
		});
	});

	it("leaves an empty sensitive field untouched instead of masking a blank value", () => {
		const masked = maskDnsProviderConfig({
			providerType: "cloudflare",
			apiToken: "",
		});

		expect(masked).toEqual({ providerType: "cloudflare", apiToken: "" });
	});

	it("masks only the AutoDNS password", () => {
		const masked = maskDnsProviderConfig({
			providerType: "autodns",
			user: "api-user",
			password: "secret",
			context: 92059,
		});

		expect(masked).toEqual({
			providerType: "autodns",
			user: "api-user",
			password: DNS_SECRET_MASK,
			context: 92059,
		});
	});
});

describe("mergeDnsProviderConfig", () => {
	it("restores the real secret when the incoming config still has the mask placeholder", () => {
		const existing = {
			providerType: "cloudflare" as const,
			apiToken: "real-token",
		};
		const incoming = {
			providerType: "cloudflare" as const,
			apiToken: DNS_SECRET_MASK,
		};

		expect(mergeDnsProviderConfig(incoming, existing)).toEqual(existing);
	});

	it("keeps a freshly entered secret instead of the stored one", () => {
		const existing = {
			providerType: "cloudflare" as const,
			apiToken: "old-token",
		};
		const incoming = {
			providerType: "cloudflare" as const,
			apiToken: "new-token",
		};

		expect(mergeDnsProviderConfig(incoming, existing)).toEqual(incoming);
	});

	it("throws when switching provider type while the field is still masked", () => {
		const existing = {
			providerType: "cloudflare" as const,
			apiToken: "real-token",
		};
		const incoming = {
			providerType: "route53" as const,
			accessKeyId: "AKIA",
			secretAccessKey: DNS_SECRET_MASK,
		};

		expect(() => mergeDnsProviderConfig(incoming, existing)).toThrow(
			"Credentials must be re-entered",
		);
	});

	it("does not require re-entry for fields that are not sensitive", () => {
		const existing = {
			providerType: "route53" as const,
			accessKeyId: "AKIA_OLD",
			secretAccessKey: "old-secret",
		};
		const incoming = {
			providerType: "route53" as const,
			accessKeyId: "AKIA_NEW",
			secretAccessKey: DNS_SECRET_MASK,
		};

		expect(mergeDnsProviderConfig(incoming, existing)).toEqual({
			providerType: "route53",
			accessKeyId: "AKIA_NEW",
			secretAccessKey: "old-secret",
		});
	});

	it("restores an AutoDNS password while allowing context changes", () => {
		const existing = {
			providerType: "autodns" as const,
			user: "api-user",
			password: "stored-secret",
			context: 4,
		};
		const incoming = {
			...existing,
			password: DNS_SECRET_MASK,
			context: 92059,
		};

		expect(mergeDnsProviderConfig(incoming, existing)).toEqual({
			...incoming,
			password: "stored-secret",
		});
	});
});
