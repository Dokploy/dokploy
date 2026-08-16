import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

import { cloudflareClient } from "@dokploy/server/utils/dns/cloudflare";

const jsonResponse = (body: unknown, ok = true, status = 200) =>
	({
		ok,
		status,
		json: async () => body,
	}) as Response;

const cfSuccess = (result: unknown) =>
	jsonResponse({ success: true, errors: [], result });

const cfError = (message: string, status = 400) =>
	jsonResponse(
		{ success: false, errors: [{ code: 1, message }] },
		false,
		status,
	);

const config = { providerType: "cloudflare" as const, apiToken: "cf-token" };

beforeEach(() => {
	mockFetch.mockReset();
});

describe("cloudflareClient.listZones", () => {
	it("returns a single page of zones", async () => {
		mockFetch.mockResolvedValue(cfSuccess([{ id: "z1", name: "example.com" }]));

		const zones = await cloudflareClient.listZones(config);

		expect(zones).toEqual([{ id: "z1", name: "example.com" }]);
		expect(mockFetch).toHaveBeenCalledTimes(1);
		const [url] = mockFetch.mock.calls[0] as [string];
		expect(url).toContain("/zones?per_page=50&page=1");
	});

	it("paginates until a short page is returned", async () => {
		const page = (count: number) =>
			cfSuccess(
				Array.from({ length: count }, (_, i) => ({
					id: `z${i}`,
					name: `zone${i}.com`,
				})),
			);
		mockFetch.mockResolvedValueOnce(page(50)).mockResolvedValueOnce(page(3));

		const zones = await cloudflareClient.listZones(config);

		expect(zones).toHaveLength(53);
		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(mockFetch.mock.calls[1]?.[0]).toContain("page=2");
	});
});

describe("cloudflareClient.listRecords", () => {
	it("lists records for a zone", async () => {
		mockFetch.mockResolvedValue(
			cfSuccess([
				{
					id: "r1",
					type: "A",
					name: "app.example.com",
					content: "1.2.3.4",
					ttl: 1,
				},
			]),
		);

		const records = await cloudflareClient.listRecords(config, "zone-1");

		expect(records).toEqual([
			{
				id: "r1",
				type: "A",
				name: "app.example.com",
				content: "1.2.3.4",
				ttl: 1,
			},
		]);
		expect(mockFetch.mock.calls[0]?.[0]).toContain("/zones/zone-1/dns_records");
	});
});

describe("cloudflareClient.upsertRecord", () => {
	it("creates a record when none exists for the name/type", async () => {
		mockFetch
			.mockResolvedValueOnce(cfSuccess([]))
			.mockResolvedValueOnce(cfSuccess({ id: "new-1" }));

		const result = await cloudflareClient.upsertRecord(config, {
			zoneId: "zone-1",
			type: "A",
			name: "app.example.com",
			content: "1.2.3.4",
		});

		expect(result).toEqual({ id: "new-1" });
		const [, createInit] = mockFetch.mock.calls[1] as [string, RequestInit];
		expect(createInit.method).toBe("POST");
	});

	it("updates the existing record instead of creating a duplicate", async () => {
		mockFetch
			.mockResolvedValueOnce(cfSuccess([{ id: "existing-1" }]))
			.mockResolvedValueOnce(cfSuccess({ id: "existing-1" }));

		const result = await cloudflareClient.upsertRecord(config, {
			zoneId: "zone-1",
			type: "A",
			name: "app.example.com",
			content: "5.6.7.8",
		});

		expect(result).toEqual({ id: "existing-1" });
		const [updateUrl, updateInit] = mockFetch.mock.calls[1] as [
			string,
			RequestInit,
		];
		expect(updateUrl).toContain("/dns_records/existing-1");
		expect(updateInit.method).toBe("PUT");
	});

	it("defaults ttl to 1 (automatic) when not provided", async () => {
		mockFetch
			.mockResolvedValueOnce(cfSuccess([]))
			.mockResolvedValueOnce(cfSuccess({ id: "new-1" }));

		await cloudflareClient.upsertRecord(config, {
			zoneId: "zone-1",
			type: "CNAME",
			name: "www.example.com",
			content: "example.com",
		});

		const [, createInit] = mockFetch.mock.calls[1] as [string, RequestInit];
		const body = JSON.parse(createInit.body as string);
		expect(body.ttl).toBe(1);
	});
});

describe("cloudflareClient.updateRecord", () => {
	it("PUTs directly to the given record id", async () => {
		mockFetch.mockResolvedValue(cfSuccess({ id: "r1" }));

		const result = await cloudflareClient.updateRecord(config, "zone-1", "r1", {
			type: "A",
			name: "app.example.com",
			content: "9.9.9.9",
			ttl: 300,
		});

		expect(result).toEqual({ id: "r1" });
		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/zones/zone-1/dns_records/r1");
		expect(init.method).toBe("PUT");
		expect(JSON.parse(init.body as string)).toEqual({
			type: "A",
			name: "app.example.com",
			content: "9.9.9.9",
			ttl: 300,
		});
	});
});

describe("cloudflareClient.deleteRecord", () => {
	it("DELETEs the given record id", async () => {
		mockFetch.mockResolvedValue(cfSuccess({}));

		await cloudflareClient.deleteRecord(config, "zone-1", "r1");

		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/zones/zone-1/dns_records/r1");
		expect(init.method).toBe("DELETE");
	});
});

describe("cloudflareClient.testConnection", () => {
	it("succeeds when the token can list zones", async () => {
		mockFetch.mockResolvedValue(cfSuccess([]));
		await expect(
			cloudflareClient.testConnection(config),
		).resolves.toBeUndefined();
	});

	it("surfaces Cloudflare's error message on an invalid token", async () => {
		mockFetch.mockResolvedValue(cfError("Invalid API Token"));

		await expect(cloudflareClient.testConnection(config)).rejects.toThrow(
			"Invalid API Token",
		);
	});
});

describe("cloudflareClient auth header", () => {
	it("trims whitespace pasted into the token", async () => {
		mockFetch.mockResolvedValue(cfSuccess([]));

		await cloudflareClient.testConnection({
			providerType: "cloudflare",
			apiToken: "  cf-token\n",
		});

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect((init.headers as Record<string, string>).Authorization).toBe(
			"Bearer cf-token",
		);
	});
});
