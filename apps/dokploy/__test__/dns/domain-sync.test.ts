import { beforeEach, describe, expect, it, vi } from "vitest";

const listZones = vi.fn();
const listRecords = vi.fn();
const upsertRecord = vi.fn();

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: { dnsProvider: { findFirst: vi.fn(), findMany: vi.fn() } },
		insert: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
	},
}));

vi.mock("@dokploy/server/utils/dns", () => ({
	getDnsClient: () => ({
		listZones,
		listRecords,
		upsertRecord,
	}),
}));

import { syncDnsProviderDomainRecords } from "@dokploy/server/services/dns-provider";

const config = {
	providerType: "cloudflare" as const,
	apiToken: "token",
};

beforeEach(() => {
	listZones.mockReset();
	listRecords.mockReset();
	upsertRecord.mockReset();
	listRecords.mockResolvedValue([]);
	upsertRecord.mockResolvedValue({ id: "record-id" });
});

describe("syncDnsProviderDomainRecords", () => {
	it("upserts A and AAAA records into the most specific zone", async () => {
		listZones.mockResolvedValue([
			{ id: "parent", name: "example.com" },
			{ id: "apps", name: "apps.example.com" },
		]);

		await expect(
			syncDnsProviderDomainRecords(config, "api.apps.example.com", {
				ipv4: "192.0.2.10",
				ipv6: "2001:db8::10",
			}),
		).resolves.toMatchObject({ recordTypes: ["A", "AAAA"] });

		expect(upsertRecord).toHaveBeenNthCalledWith(1, config, {
			zoneId: "apps",
			type: "A",
			name: "api.apps.example.com",
			content: "192.0.2.10",
		});
		expect(upsertRecord).toHaveBeenNthCalledWith(2, config, {
			zoneId: "apps",
			type: "AAAA",
			name: "api.apps.example.com",
			content: "2001:db8::10",
		});
	});

	it("does not create host records when a matching wildcard exists", async () => {
		listZones.mockResolvedValue([{ id: "zone", name: "example.com" }]);
		listRecords.mockResolvedValue([
			{
				id: "wildcard",
				type: "CNAME",
				name: "*.example.com",
				content: "target.example.net",
				ttl: 300,
			},
		]);

		await expect(
			syncDnsProviderDomainRecords(config, "app.example.com", {
				ipv4: "192.0.2.10",
				ipv6: "2001:db8::10",
			}),
		).resolves.toMatchObject({
			recordTypes: [],
			wildcard: { name: "*.example.com" },
		});
		expect(upsertRecord).not.toHaveBeenCalled();
	});

	it("rejects a host that is not covered by the provider", async () => {
		listZones.mockResolvedValue([{ id: "zone", name: "example.com" }]);

		await expect(
			syncDnsProviderDomainRecords(config, "example.net", {
				ipv4: "192.0.2.10",
			}),
		).rejects.toThrow('No DNS zone matching "example.net"');
	});
});
