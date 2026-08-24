import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

import { autodnsClient } from "@dokploy/server/utils/dns/autodns";

const response = (body: unknown, ok = true, status = 200) =>
	({
		ok,
		status,
		text: async () => (body === undefined ? "" : JSON.stringify(body)),
	}) as Response;

const success = (data?: unknown, summary?: number) =>
	response({
		status: { type: "SUCCESS", code: "S0304" },
		...(data === undefined ? {} : { data }),
		...(summary === undefined ? {} : { object: { summary } }),
	});

const config = {
	providerType: "autodns" as const,
	user: " api-user ",
	password: " secret ",
	context: 92059,
};

const zone = {
	origin: "example.com",
	virtualNameServer: "ns1.example.net",
	resourceRecords: [
		{ name: "", type: "A", value: "192.0.2.10", ttl: 300 },
		{
			name: "app",
			type: "AAAA",
			value: "2001:db8::10",
			ttl: 600,
		},
	],
};

beforeEach(() => {
	mockFetch.mockReset();
});

describe("autodnsClient.listZones", () => {
	it("lists zones and sends Basic auth plus the Domainrobot context", async () => {
		mockFetch.mockResolvedValue(success([zone], 1));

		const zones = await autodnsClient.listZones(config);

		expect(zones).toHaveLength(1);
		expect(zones[0]?.name).toBe("example.com");
		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(
			"https://api.autodns.com/v1/zone/_search?keys[]=virtualNameServer",
		);
		expect(init.method).toBe("POST");
		expect(init.headers).toMatchObject({
			Authorization: `Basic ${Buffer.from("api-user:secret").toString("base64")}`,
			"X-Domainrobot-Context": "92059",
		});
	});
});

describe("autodnsClient records", () => {
	it("maps apex and AAAA records to absolute names", async () => {
		mockFetch.mockResolvedValueOnce(success([zone]));
		const zones = await autodnsClient.listZones(config);
		const zoneId = zones[0]!.id;
		mockFetch.mockResolvedValueOnce(success(zone));

		const records = await autodnsClient.listRecords(config, zoneId!);

		expect(records).toMatchObject([
			{
				type: "A",
				name: "example.com",
				content: "192.0.2.10",
				ttl: 300,
			},
			{
				type: "AAAA",
				name: "app.example.com",
				content: "2001:db8::10",
				ttl: 600,
			},
		]);
		expect(mockFetch.mock.calls[1]?.[0]).toContain(
			"/zone/example.com/ns1.example.net",
		);
	});

	it("atomically replaces an existing record via the stream endpoint", async () => {
		mockFetch.mockResolvedValueOnce(success([zone]));
		const zones = await autodnsClient.listZones(config);
		const zoneId = zones[0]!.id;
		mockFetch.mockResolvedValueOnce(success(zone));
		mockFetch.mockResolvedValueOnce(success());

		await autodnsClient.upsertRecord(config, {
			zoneId: zoneId!,
			type: "AAAA",
			name: "app.example.com",
			content: "2001:db8::20",
			ttl: 900,
		});

		const [url, init] = mockFetch.mock.calls[2] as [string, RequestInit];
		expect(url).toContain("/zone/example.com/ns1.example.net/_stream");
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body as string)).toEqual({
			adds: [
				{
					name: "app",
					ttl: 900,
					type: "AAAA",
					value: "2001:db8::20",
				},
			],
			rems: [zone.resourceRecords[1]],
		});
	});

	it("does not write when the desired record is unchanged", async () => {
		mockFetch.mockResolvedValueOnce(success([zone]));
		const zones = await autodnsClient.listZones(config);
		const zoneId = zones[0]!.id;
		mockFetch.mockResolvedValueOnce(success(zone));

		await autodnsClient.upsertRecord(config, {
			zoneId: zoneId!,
			type: "A",
			name: "example.com",
			content: "192.0.2.10",
			ttl: 300,
		});

		expect(mockFetch).toHaveBeenCalledTimes(2);
	});
});

describe("autodnsClient.testConnection", () => {
	it("surfaces an AutoDNS error message", async () => {
		mockFetch.mockResolvedValue(
			response(
				{
					status: { type: "ERROR" },
					messages: [
						{
							status: "ERROR",
							code: "EF13012",
							text: "This subuser is not available in this system.",
						},
					],
				},
				false,
				404,
			),
		);

		await expect(autodnsClient.testConnection(config)).rejects.toThrow(
			"EF13012: This subuser is not available in this system.",
		);
	});
});
