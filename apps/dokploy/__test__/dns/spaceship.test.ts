import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

import { spaceshipClient } from "@dokploy/server/utils/dns/spaceship";

const jsonResponse = (body: unknown, ok = true, status = 200) =>
	({
		ok,
		status,
		json: async () => body,
	}) as Response;

const noContent = () => ({ ok: true, status: 204 }) as Response;

const config = {
	providerType: "spaceship" as const,
	apiKey: "key",
	apiSecret: "secret",
};

const encodeId = (record: Record<string, unknown>) =>
	Buffer.from(
		JSON.stringify(
			Object.fromEntries(
				Object.entries(record).sort(([a], [b]) => a.localeCompare(b)),
			),
		),
	).toString("base64url");

const requestBody = (call: number) =>
	JSON.parse((mockFetch.mock.calls[call]?.[1] as RequestInit).body as string);

beforeEach(() => {
	mockFetch.mockReset();
});

describe("spaceshipClient.listZones", () => {
	it("pages through every domain and sends the API credentials", async () => {
		const firstPage = Array.from({ length: 100 }, (_, i) => ({
			name: `d${i}.com`,
		}));
		mockFetch
			.mockResolvedValueOnce(jsonResponse({ items: firstPage, total: 101 }))
			.mockResolvedValueOnce(
				jsonResponse({ items: [{ name: "last.com" }], total: 101 }),
			);

		const zones = await spaceshipClient.listZones(config);

		expect(zones).toHaveLength(101);
		expect(zones[100]).toEqual({ id: "last.com", name: "last.com" });
		const [firstUrl, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(firstUrl).toContain("/domains?take=100&skip=0");
		expect(mockFetch.mock.calls[1]?.[0]).toContain(
			"/domains?take=100&skip=100",
		);
		expect(init.headers).toMatchObject({
			"X-API-Key": "key",
			"X-API-Secret": "secret",
		});
	});
});

describe("spaceshipClient.listRecords", () => {
	it("maps type-specific fields to names and content", async () => {
		mockFetch.mockResolvedValue(
			jsonResponse({
				items: [
					{
						type: "A",
						name: "@",
						address: "1.2.3.4",
						ttl: 600,
						group: { type: "custom" },
					},
					{
						type: "MX",
						name: "@",
						exchange: "mail.example.com",
						preference: 10,
						ttl: 3600,
						group: { type: "custom" },
					},
					{
						type: "SRV",
						name: "app",
						service: "_sip",
						protocol: "_tcp",
						priority: 1,
						weight: 10,
						port: 5060,
						target: "sip.example.com",
						ttl: 3600,
						group: { type: "custom" },
					},
					{
						type: "CAA",
						name: "@",
						flag: 0,
						tag: "issue",
						value: "letsencrypt.org",
						ttl: 3600,
						group: { type: "custom" },
					},
				],
				total: 4,
			}),
		);

		const records = await spaceshipClient.listRecords(config, "example.com");

		expect(records.map(({ id: _, ...record }) => record)).toEqual([
			{ type: "A", name: "example.com", content: "1.2.3.4", ttl: 600 },
			{
				type: "MX",
				name: "example.com",
				content: "10 mail.example.com",
				ttl: 3600,
			},
			{
				type: "SRV",
				name: "_sip._tcp.app.example.com",
				content: "1 10 5060 sip.example.com",
				ttl: 3600,
			},
			{
				type: "CAA",
				name: "example.com",
				content: '0 issue "letsencrypt.org"',
				ttl: 3600,
			},
		]);
		expect(records[0]?.id).toBe(
			encodeId({ type: "A", name: "@", address: "1.2.3.4", ttl: 600 }),
		);
		expect(mockFetch.mock.calls[0]?.[0]).toContain(
			"/dns/records/example.com?take=500&skip=0",
		);
	});
});

describe("spaceshipClient.upsertRecord", () => {
	it("saves an A record under its relative name", async () => {
		mockFetch.mockResolvedValue(noContent());

		const result = await spaceshipClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "A",
			name: "app.example.com",
			content: "1.2.3.4",
		});

		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/dns/records/example.com");
		expect(init.method).toBe("PUT");
		expect(requestBody(0)).toEqual({
			items: [{ type: "A", name: "app", ttl: 3600, address: "1.2.3.4" }],
		});
		expect(result.id).toBe(
			encodeId({ type: "A", name: "app", ttl: 3600, address: "1.2.3.4" }),
		);
	});

	it("uses @ for the apex and strips trailing dots from targets", async () => {
		mockFetch.mockResolvedValue(noContent());

		await spaceshipClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "CNAME",
			name: "example.com",
			content: "target.example.net.",
			ttl: 300,
		});

		expect(requestBody(0).items[0]).toEqual({
			type: "CNAME",
			name: "@",
			ttl: 300,
			cname: "target.example.net",
		});
	});

	it("splits MX, SRV and CAA content into Spaceship fields", async () => {
		mockFetch.mockResolvedValue(noContent());

		await spaceshipClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "MX",
			name: "example.com",
			content: "20 mail.example.com",
		});
		await spaceshipClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "SRV",
			name: "_sip._tcp.example.com",
			content: "1 10 5060 sip.example.com",
		});
		await spaceshipClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "CAA",
			name: "example.com",
			content: '0 issue "letsencrypt.org"',
		});

		expect(requestBody(0).items[0]).toMatchObject({
			preference: 20,
			exchange: "mail.example.com",
		});
		expect(requestBody(1).items[0]).toMatchObject({
			name: "@",
			service: "_sip",
			protocol: "_tcp",
			priority: 1,
			weight: 10,
			port: 5060,
			target: "sip.example.com",
		});
		expect(requestBody(2).items[0]).toMatchObject({
			flag: 0,
			tag: "issue",
			value: "letsencrypt.org",
		});
	});

	it("rejects an MX record without a priority", async () => {
		await expect(
			spaceshipClient.upsertRecord(config, {
				zoneId: "example.com",
				type: "MX",
				name: "example.com",
				content: "mail.example.com",
			}),
		).rejects.toThrow("<priority> <mail server>");
		expect(mockFetch).not.toHaveBeenCalled();
	});
});

describe("spaceshipClient.updateRecord", () => {
	const existing = { type: "A", name: "app", address: "1.1.1.1", ttl: 600 };

	it("only saves when the value is unchanged (TTL update)", async () => {
		mockFetch.mockResolvedValue(noContent());

		await spaceshipClient.updateRecord(
			config,
			"example.com",
			encodeId(existing),
			{
				type: "A",
				name: "app.example.com",
				content: "1.1.1.1",
				ttl: 1200,
			},
		);

		expect(mockFetch).toHaveBeenCalledTimes(1);
		expect((mockFetch.mock.calls[0]?.[1] as RequestInit).method).toBe("PUT");
	});

	it("deletes the old record then saves the new one", async () => {
		mockFetch.mockResolvedValue(noContent());

		await spaceshipClient.updateRecord(
			config,
			"example.com",
			encodeId(existing),
			{
				type: "A",
				name: "app.example.com",
				content: "2.2.2.2",
			},
		);

		expect((mockFetch.mock.calls[0]?.[1] as RequestInit).method).toBe("DELETE");
		expect(requestBody(0)).toEqual([
			{ address: "1.1.1.1", name: "app", type: "A" },
		]);
		expect((mockFetch.mock.calls[1]?.[1] as RequestInit).method).toBe("PUT");
		expect(requestBody(1).items[0]).toMatchObject({ address: "2.2.2.2" });
	});

	it("restores the original record when saving the new one fails", async () => {
		mockFetch
			.mockResolvedValueOnce(noContent())
			.mockResolvedValueOnce(jsonResponse({ detail: "Conflict" }, false, 422))
			.mockResolvedValueOnce(noContent());

		await expect(
			spaceshipClient.updateRecord(config, "example.com", encodeId(existing), {
				type: "A",
				name: "app.example.com",
				content: "2.2.2.2",
			}),
		).rejects.toThrow("Conflict");

		expect((mockFetch.mock.calls[2]?.[1] as RequestInit).method).toBe("PUT");
		expect(requestBody(2).items[0]).toEqual(
			Object.fromEntries(
				Object.entries(existing).sort(([a], [b]) => a.localeCompare(b)),
			),
		);
	});
});

describe("spaceshipClient.deleteRecord", () => {
	it("sends the record decoded from the id without its TTL", async () => {
		mockFetch.mockResolvedValue(noContent());

		await spaceshipClient.deleteRecord(
			config,
			"example.com",
			encodeId({ type: "TXT", name: "@", value: "hello", ttl: 3600 }),
		);

		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/dns/records/example.com");
		expect(init.method).toBe("DELETE");
		expect(requestBody(0)).toEqual([
			{ name: "@", type: "TXT", value: "hello" },
		]);
	});

	it("rejects an id that is not an encoded record", async () => {
		await expect(
			spaceshipClient.deleteRecord(config, "example.com", "not-an-id"),
		).rejects.toThrow("invalid record id");
	});
});

describe("spaceshipClient.testConnection", () => {
	it("succeeds when the credentials can list domains", async () => {
		mockFetch.mockResolvedValue(jsonResponse({ items: [], total: 0 }));
		await expect(
			spaceshipClient.testConnection(config),
		).resolves.toBeUndefined();
	});

	it("surfaces Spaceship's error detail on invalid credentials", async () => {
		mockFetch.mockResolvedValue(
			jsonResponse({ detail: "Invalid API key" }, false, 401),
		);
		await expect(spaceshipClient.testConnection(config)).rejects.toThrow(
			"Invalid API key",
		);
	});
});
