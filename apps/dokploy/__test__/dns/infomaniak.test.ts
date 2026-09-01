import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

import { infomaniakClient } from "@dokploy/server/utils/dns/infomaniak";

const jsonResponse = (body: unknown, ok = true, status = 200) =>
	({
		ok,
		status,
		json: async () => body,
	}) as Response;

const ikSuccess = (data: unknown) => jsonResponse({ result: "success", data });

const ikError = (description: string, status = 400) =>
	jsonResponse(
		{ result: "error", error: { code: "not_authorized", description } },
		false,
		status,
	);

const config = {
	providerType: "infomaniak" as const,
	apiToken: "ik_test_token",
};

const lastCall = () =>
	mockFetch.mock.calls.at(-1) as [string, RequestInit & { method?: string }];

const lastBody = () => JSON.parse(lastCall()[1].body as string);

beforeEach(() => {
	mockFetch.mockReset();
});

describe("infomaniakClient.listZones", () => {
	it("exposes each domain product as a zone keyed by its name", async () => {
		mockFetch.mockResolvedValue(
			ikSuccess([
				{ id: 1, customer_name: "example.com" },
				{ id: 2, customer_name: "example.ch" },
			]),
		);

		const zones = await infomaniakClient.listZones(config);

		expect(zones).toEqual([
			{ id: "example.com", name: "example.com" },
			{ id: "example.ch", name: "example.ch" },
		]);
		const [url, init] = lastCall();
		expect(url).toBe(
			"https://api.infomaniak.com/1/product?service_name=domain",
		);
		expect(init.headers).toMatchObject({
			Authorization: "Bearer ik_test_token",
		});
	});

	it("propagates the API error description", async () => {
		mockFetch.mockResolvedValue(ikError("Authorization required", 401));

		await expect(infomaniakClient.listZones(config)).rejects.toThrow(
			"Authorization required",
		);
	});
});

describe("infomaniakClient.listRecords", () => {
	it("rebuilds the fqdn from the relative source", async () => {
		mockFetch.mockResolvedValue(
			ikSuccess([
				{ id: 10, type: "A", source: "app", target: "1.2.3.4", ttl: 300 },
				{ id: 11, type: "A", source: "", target: "5.6.7.8", ttl: 600 },
			]),
		);

		const records = await infomaniakClient.listRecords(config, "example.com");

		expect(records).toEqual([
			{
				id: "10",
				type: "A",
				name: "app.example.com",
				content: "1.2.3.4",
				ttl: 300,
			},
			{
				id: "11",
				type: "A",
				name: "example.com",
				content: "5.6.7.8",
				ttl: 600,
			},
		]);
		expect(lastCall()[0]).toBe(
			"https://api.infomaniak.com/2/zones/example.com/records?with=records_description",
		);
	});

	it.each([".", "", "@"])("treats a %s source as the apex", async (source) => {
		mockFetch.mockResolvedValue(
			ikSuccess([{ id: 12, type: "A", source, target: "1.2.3.4", ttl: 300 }]),
		);

		const records = await infomaniakClient.listRecords(config, "example.com");

		expect(records[0]?.name).toBe("example.com");
	});

	it("unquotes TXT targets", async () => {
		mockFetch.mockResolvedValue(
			ikSuccess([
				{
					id: 13,
					type: "TXT",
					source: "_acme-challenge",
					target: '"token-value"',
					ttl: 300,
				},
			]),
		);

		const records = await infomaniakClient.listRecords(config, "example.com");

		expect(records[0]?.content).toBe("token-value");
	});

	it("leaves a CAA target untouched", async () => {
		mockFetch.mockResolvedValue(
			ikSuccess([
				{
					id: 14,
					type: "CAA",
					source: "",
					target: '0 issue "letsencrypt.org"',
					ttl: 300,
				},
			]),
		);

		const records = await infomaniakClient.listRecords(config, "example.com");

		expect(records[0]?.content).toBe('0 issue "letsencrypt.org"');
	});
});

describe("infomaniakClient.upsertRecord", () => {
	it("creates the record when no matching source and type exists", async () => {
		mockFetch
			.mockResolvedValueOnce(ikSuccess([]))
			.mockResolvedValueOnce(ikSuccess({ id: 42 }));

		const result = await infomaniakClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "A",
			name: "app.example.com",
			content: "1.2.3.4",
			ttl: 600,
		});

		expect(result).toEqual({ id: "42" });
		const [url, init] = lastCall();
		expect(url).toBe("https://api.infomaniak.com/2/zones/example.com/records");
		expect(init.method).toBe("POST");
		expect(lastBody()).toEqual({
			type: "A",
			source: "app",
			target: "1.2.3.4",
			ttl: 600,
		});
	});

	it("updates the existing record instead of creating a duplicate", async () => {
		mockFetch
			.mockResolvedValueOnce(
				ikSuccess([
					{ id: 7, type: "A", source: "app", target: "1.1.1.1", ttl: 300 },
				]),
			)
			.mockResolvedValueOnce(ikSuccess({ id: 7 }));

		const result = await infomaniakClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "A",
			name: "app.example.com",
			content: "1.2.3.4",
		});

		expect(result).toEqual({ id: "7" });
		const [url, init] = lastCall();
		expect(url).toBe(
			"https://api.infomaniak.com/2/zones/example.com/records/7",
		);
		expect(init.method).toBe("PUT");
		expect(lastBody().ttl).toBe(300);
	});

	it("writes a root dot as the source for an apex record and strips the trailing dot", async () => {
		mockFetch
			.mockResolvedValueOnce(ikSuccess([]))
			.mockResolvedValueOnce(ikSuccess({ id: 43 }));

		await infomaniakClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "A",
			name: "example.com.",
			content: "1.2.3.4",
		});

		expect(lastBody().source).toBe(".");
	});

	it("matches the existing apex record instead of creating a duplicate", async () => {
		mockFetch
			.mockResolvedValueOnce(
				ikSuccess([
					{
						id: 8,
						type: "TXT",
						source: ".",
						target: '"v=spf1 -all"',
						ttl: 3600,
					},
				]),
			)
			.mockResolvedValueOnce(ikSuccess({ id: 8 }));

		const result = await infomaniakClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "TXT",
			name: "example.com",
			content: "v=spf1 -all",
		});

		expect(result).toEqual({ id: "8" });
		const [url, init] = lastCall();
		expect(init.method).toBe("PUT");
		expect(url).toBe(
			"https://api.infomaniak.com/2/zones/example.com/records/8",
		);
		expect(lastBody().target).toBe('"v=spf1 -all"');
	});

	it("quotes a TXT target on write", async () => {
		mockFetch
			.mockResolvedValueOnce(ikSuccess([]))
			.mockResolvedValueOnce(ikSuccess({ id: 44 }));

		await infomaniakClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "TXT",
			name: "_acme-challenge.example.com",
			content: "token-value",
		});

		expect(lastBody().target).toBe('"token-value"');
	});

	it("does not double-quote a TXT target that is already quoted", async () => {
		mockFetch
			.mockResolvedValueOnce(ikSuccess([]))
			.mockResolvedValueOnce(ikSuccess({ id: 45 }));

		await infomaniakClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "TXT",
			name: "_acme-challenge.example.com",
			content: '"token-value"',
		});

		expect(lastBody().target).toBe('"token-value"');
	});
});

describe("infomaniakClient.updateRecord", () => {
	it("updates the record and keeps its id", async () => {
		mockFetch.mockResolvedValue(ikSuccess({ id: 7 }));

		const result = await infomaniakClient.updateRecord(
			config,
			"example.com",
			"7",
			{
				type: "CNAME",
				name: "www.example.com",
				content: "example.com",
				ttl: 900,
			},
		);

		expect(result).toEqual({ id: "7" });
		const [url, init] = lastCall();
		expect(url).toBe(
			"https://api.infomaniak.com/2/zones/example.com/records/7",
		);
		expect(init.method).toBe("PUT");
		expect(lastBody()).toEqual({
			type: "CNAME",
			source: "www",
			target: "example.com",
			ttl: 900,
		});
	});

	it("falls back to the default ttl when none is provided", async () => {
		mockFetch.mockResolvedValue(ikSuccess({ id: 7 }));

		await infomaniakClient.updateRecord(config, "example.com", "7", {
			type: "A",
			name: "app.example.com",
			content: "1.2.3.4",
		});

		expect(lastBody().ttl).toBe(300);
	});
});

describe("infomaniakClient.deleteRecord", () => {
	it("deletes the record", async () => {
		mockFetch.mockResolvedValue(ikSuccess(null));

		await infomaniakClient.deleteRecord(config, "example.com", "7");

		const [url, init] = lastCall();
		expect(url).toBe(
			"https://api.infomaniak.com/2/zones/example.com/records/7",
		);
		expect(init.method).toBe("DELETE");
	});

	it("propagates a delete failure", async () => {
		mockFetch.mockResolvedValue(ikError("Record not found", 404));

		await expect(
			infomaniakClient.deleteRecord(config, "example.com", "7"),
		).rejects.toThrow("Record not found");
	});
});

describe("infomaniakClient.testConnection", () => {
	it("resolves when the domain listing succeeds", async () => {
		mockFetch.mockResolvedValue(ikSuccess([]));

		await expect(
			infomaniakClient.testConnection(config),
		).resolves.toBeUndefined();
	});

	it("rejects on an invalid token", async () => {
		mockFetch.mockResolvedValue(ikError("Authorization required", 401));

		await expect(infomaniakClient.testConnection(config)).rejects.toThrow(
			"Infomaniak: request to /1/product?service_name=domain failed: Authorization required",
		);
	});
});
