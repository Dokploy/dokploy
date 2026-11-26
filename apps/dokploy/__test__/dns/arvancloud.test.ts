import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

import { arvancloudClient } from "@dokploy/server/utils/dns/arvancloud";

const jsonResponse = (body: unknown, ok = true, status = 200) =>
	({
		ok,
		status,
		json: async () => body,
	}) as Response;

const arvanPage = (data: unknown, lastPage = 1) =>
	jsonResponse({ data, meta: { current_page: 1, last_page: lastPage } });

const arvanError = (message: string, status = 400) =>
	jsonResponse({ message }, false, status);

const config = { providerType: "arvancloud" as const, apiKey: "arvan-key" };

beforeEach(() => {
	mockFetch.mockReset();
});

describe("arvancloudClient.listZones", () => {
	it("returns zones using the domain name as the id", async () => {
		mockFetch.mockResolvedValue(
			arvanPage([{ name: "example.com" }, { name: "foo.ir" }]),
		);

		const zones = await arvancloudClient.listZones(config);

		expect(zones).toEqual([
			{ id: "example.com", name: "example.com" },
			{ id: "foo.ir", name: "foo.ir" },
		]);
		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/domains?per_page=100&page=1");
		expect((init.headers as Record<string, string>).Authorization).toBe(
			"Apikey arvan-key",
		);
	});

	it("paginates until the last page is reached", async () => {
		mockFetch
			.mockResolvedValueOnce(
				arvanPage([{ name: "a.com" }, { name: "b.com" }], 2),
			)
			.mockResolvedValueOnce(arvanPage([{ name: "c.com" }], 2));

		const zones = await arvancloudClient.listZones(config);

		expect(zones).toHaveLength(3);
		expect(mockFetch.mock.calls[1]?.[0]).toContain("page=2");
	});
});

describe("arvancloudClient.listRecords", () => {
	it("lists records and maps value back to content", async () => {
		mockFetch.mockResolvedValue(
			arvanPage([
				{ id: "r1", type: "a", name: "app.example.com", value: [{ ip: "1.2.3.4" }], ttl: 120 },
			]),
		);

		const records = await arvancloudClient.listRecords(config, "example.com");

		expect(records[0]).toEqual({
			id: "r1",
			type: "A",
			name: "app.example.com",
			content: "1.2.3.4",
			ttl: 120,
			proxied: undefined,
		});
		expect(mockFetch.mock.calls[0]?.[0]).toContain(
			"/domains/example.com/dns-records",
		);
	});

	it("inlines MX priority into the content", async () => {
		mockFetch.mockResolvedValue(
			arvanPage([
				{ id: "mx1", type: "mx", name: "example.com", value: [{ host: "mail.example.com", priority: 20 }] },
			]),
		);

		const records = await arvancloudClient.listRecords(config, "example.com");

		expect(records[0]?.content).toBe("20 mail.example.com");
	});
});

describe("arvancloudClient.upsertRecord", () => {
	it("creates a record when none exists for the name/type", async () => {
		mockFetch
			.mockResolvedValueOnce(arvanPage([]))
			.mockResolvedValueOnce(
				jsonResponse({ data: { id: "new-1" }, message: "ok" }, true, 201),
			);

		const result = await arvancloudClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "A",
			name: "app.example.com",
			content: "1.2.3.4",
		});

		expect(result).toEqual({ id: "new-1" });
		const [, createInit] = mockFetch.mock.calls[1] as [string, RequestInit];
		expect(createInit.method).toBe("POST");
		expect(JSON.parse(createInit.body as string)).toMatchObject({
			type: "a",
			name: "app.example.com",
			value: [{ ip: "1.2.3.4" }],
		});
	});

	it("updates the existing record when content matches", async () => {
		mockFetch
			.mockResolvedValueOnce(
				arvanPage([
					{ id: "existing-1", type: "a", name: "app.example.com", value: [{ ip: "5.6.7.8" }] },
				]),
			)
			.mockResolvedValueOnce(
				jsonResponse({ data: { id: "existing-1" }, message: "ok" }),
			);

		const result = await arvancloudClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "A",
			name: "app.example.com",
			content: "5.6.7.8",
		});

		expect(result).toEqual({ id: "existing-1" });
		const [, updateInit] = mockFetch.mock.calls[1] as [string, RequestInit];
		expect(updateInit.method).toBe("PUT");
		expect(String(updateInit.body)).toContain("5.6.7.8");
	});

	it("sends MX priority as structured data", async () => {
		mockFetch
			.mockResolvedValueOnce(arvanPage([]))
			.mockResolvedValueOnce(
				jsonResponse({ data: { id: "mx1" }, message: "ok" }, true, 201),
			);

		await arvancloudClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "MX",
			name: "example.com",
			content: "20 mail.example.com",
		});

		const [, createInit] = mockFetch.mock.calls[1] as [string, RequestInit];
		expect(JSON.parse(createInit.body as string).value).toEqual([
			{ host: "mail.example.com", priority: 20 },
		]);
	});

	it("sends CAA as the tag/value pair ArvanCloud expects", async () => {
		mockFetch
			.mockResolvedValueOnce(arvanPage([]))
			.mockResolvedValueOnce(
				jsonResponse({ data: { id: "caa1" }, message: "ok" }, true, 201),
			);

		await arvancloudClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "CAA",
			name: "example.com",
			content: '0 issue "letsencrypt.org"',
		});

		const [, createInit] = mockFetch.mock.calls[1] as [string, RequestInit];
		expect(JSON.parse(createInit.body as string).value).toEqual([
			{ tag: "issue", value: "letsencrypt.org" },
		]);
	});
});

describe("arvancloudClient.updateRecord", () => {
	it("PUTs directly to the given record id", async () => {
		mockFetch.mockResolvedValue(
			jsonResponse({ data: { id: "r1" }, message: "ok" }),
		);

		const result = await arvancloudClient.updateRecord(config, "example.com", "r1", {
			type: "TXT",
			name: "_acme-challenge.example.com",
			content: "abc123",
		});

		expect(result).toEqual({ id: "r1" });
		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/domains/example.com/dns-records/r1");
		expect(init.method).toBe("PUT");
		expect(JSON.parse(init.body as string)).toMatchObject({
			type: "txt",
			value: [{ text: "abc123" }],
		});
	});
});

describe("arvancloudClient.deleteRecord", () => {
	it("DELETEs the given record id", async () => {
		mockFetch.mockResolvedValue(jsonResponse({ message: "ok" }));

		await arvancloudClient.deleteRecord(config, "example.com", "r1");

		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/domains/example.com/dns-records/r1");
		expect(init.method).toBe("DELETE");
	});
});

describe("arvancloudClient.testConnection", () => {
	it("succeeds when the token can list domains", async () => {
		mockFetch.mockResolvedValue(arvanPage([]));
		await expect(arvancloudClient.testConnection(config)).resolves.toBeUndefined();
	});

	it("surfaces ArvanCloud's error message on an invalid key", async () => {
		mockFetch.mockResolvedValue(arvanError("Access token is missing or invalid", 401));

		await expect(arvancloudClient.testConnection(config)).rejects.toThrow(
			"Access token is missing or invalid",
		);
	});
});

describe("arvancloudClient auth header", () => {
	it("trims whitespace and sends the Apikey prefix", async () => {
		mockFetch.mockResolvedValue(arvanPage([]));

		await arvancloudClient.testConnection({
			providerType: "arvancloud",
			apiKey: "  arvan-key\n",
		});

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect((init.headers as Record<string, string>).Authorization).toBe(
			"Apikey arvan-key",
		);
	});
});