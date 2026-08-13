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
	maskDnsProviderConfig,
	mergeDnsProviderConfig,
} from "@dokploy/server/services/dns-provider";

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
});
