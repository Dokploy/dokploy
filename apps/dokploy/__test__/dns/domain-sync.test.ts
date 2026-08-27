import { beforeEach, describe, expect, it, vi } from "vitest";

const { listZones, listRecords, upsertRecord, resolve4, resolve6 } = vi.hoisted(
	() => ({
		listZones: vi.fn(),
		listRecords: vi.fn(),
		upsertRecord: vi.fn(),
		resolve4: vi.fn(),
		resolve6: vi.fn(),
	}),
);

vi.mock("node:dns/promises", () => ({ resolve4, resolve6 }));

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
	resolve4.mockReset();
	resolve6.mockReset();
	listRecords.mockResolvedValue([]);
	upsertRecord.mockResolvedValue({ id: "record-id" });
	resolve4.mockResolvedValue([]);
	resolve6.mockResolvedValue([]);
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

	it("does not create host records when wildcard addresses match the server", async () => {
		listZones.mockResolvedValue([{ id: "zone", name: "example.com" }]);
		listRecords.mockResolvedValue([
			{
				id: "wildcard-a",
				type: "A",
				name: "*.example.com",
				content: "192.0.2.10",
				ttl: 300,
			},
			{
				id: "wildcard-aaaa",
				type: "AAAA",
				name: "*.example.com",
				content: "2001:db8::10",
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

	it("accepts a wildcard CNAME that resolves to both server addresses", async () => {
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
		resolve4.mockResolvedValue(["192.0.2.10"]);
		resolve6.mockResolvedValue(["2001:db8::10"]);

		await syncDnsProviderDomainRecords(config, "app.example.com", {
			ipv4: "192.0.2.10",
			ipv6: "2001:db8::10",
		});

		expect(upsertRecord).not.toHaveBeenCalled();
	});

	it("creates both exact records when a wildcard does not fully cover the server", async () => {
		listZones.mockResolvedValue([{ id: "zone", name: "example.com" }]);
		listRecords.mockResolvedValue([
			{
				id: "wildcard",
				type: "A",
				name: "*.example.com",
				content: "192.0.2.99",
				ttl: 300,
			},
		]);

		await expect(
			syncDnsProviderDomainRecords(config, "app.example.com", {
				ipv4: "192.0.2.10",
				ipv6: "2001:db8::10",
			}),
		).resolves.toMatchObject({ recordTypes: ["A", "AAAA"] });
		expect(upsertRecord).toHaveBeenCalledTimes(2);
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
