import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

import { hetznerClient } from "@dokploy/server/utils/dns/hetzner";

const jsonResponse = (body: unknown, ok = true, status = 200) =>
	({
		ok,
		status,
		json: async () => body,
	}) as Response;

const hzPage = (key: string, items: unknown[], nextPage: number | null) =>
	jsonResponse({
		[key]: items,
		meta: { pagination: { page: 1, next_page: nextPage } },
	});

const hzError = (code: string, message: string, status: number) =>
	jsonResponse({ error: { code, message } }, false, status);

const actionResponse = () =>
	jsonResponse({ action: { id: 1, status: "running" } }, true, 201);

const config = {
	providerType: "hetzner" as const,
	apiToken: "hz_test_token",
};

const call = (index: number) =>
	mockFetch.mock.calls[index] as [string, RequestInit & { method?: string }];

const bodyOf = (index: number) => JSON.parse(call(index)[1].body as string);

beforeEach(() => {
	mockFetch.mockReset();
});

describe("hetznerClient.listZones", () => {
	it("lists primary zones keyed by name", async () => {
		mockFetch.mockResolvedValue(
			hzPage(
				"zones",
				[
					{ id: 1, name: "example.com", mode: "primary" },
					{ id: 2, name: "example.de", mode: "primary" },
				],
				null,
			),
		);

		const zones = await hetznerClient.listZones(config);

		expect(zones).toEqual([
			{ id: "example.com", name: "example.com" },
			{ id: "example.de", name: "example.de" },
		]);
		const [url, init] = call(0);
		expect(url).toContain("https://api.hetzner.cloud/v1/zones?mode=primary");
		expect(url).toContain("per_page=50");
		expect(init.headers).toMatchObject({
			Authorization: "Bearer hz_test_token",
		});
	});

	it("follows next_page until the last page", async () => {
		mockFetch
			.mockResolvedValueOnce(hzPage("zones", [{ id: 1, name: "a.com" }], 2))
			.mockResolvedValueOnce(hzPage("zones", [{ id: 2, name: "b.com" }], null));

		const zones = await hetznerClient.listZones(config);

		expect(zones.map((zone) => zone.name)).toEqual(["a.com", "b.com"]);
		expect(call(1)[0]).toContain("page=2");
	});

	it("surfaces the API error message", async () => {
		mockFetch.mockResolvedValue(
			hzError("unauthorized", "unable to authenticate", 401),
		);

		await expect(hetznerClient.listZones(config)).rejects.toThrow(
			"Hetzner: request to /zones?mode=primary&page=1&per_page=50 failed: unable to authenticate",
		);
	});
});

describe("hetznerClient.listRecords", () => {
	it("maps RRSets to FQDN records, joining values and unquoting TXT", async () => {
		mockFetch.mockResolvedValue(
			hzPage(
				"rrsets",
				[
					{
						id: "@/A",
						name: "@",
						type: "A",
						ttl: 600,
						records: [{ value: "1.1.1.1" }, { value: "2.2.2.2" }],
					},
					{
						id: "www/TXT",
						name: "www",
						type: "TXT",
						ttl: null,
						records: [{ value: '"hello \\"world\\"" " again"' }],
					},
				],
				null,
			),
		);

		const records = await hetznerClient.listRecords(config, "example.com");

		expect(records).toEqual([
			{
				id: "@/A",
				type: "A",
				name: "example.com",
				content: "1.1.1.1\n2.2.2.2",
				ttl: 600,
			},
			{
				id: "www/TXT",
				type: "TXT",
				name: "www.example.com",
				content: 'hello "world" again',
				ttl: 300,
			},
		]);
		expect(call(0)[0]).toContain("/zones/example.com/rrsets?page=1");
	});
});

describe("hetznerClient.upsertRecord", () => {
	it("creates the RRSet through add_records when it does not exist", async () => {
		mockFetch
			.mockResolvedValueOnce(hzError("not_found", "rrset not found", 404))
			.mockResolvedValueOnce(actionResponse());

		const result = await hetznerClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "A",
			name: "app.example.com",
			content: "1.2.3.4",
			ttl: 120,
		});

		expect(result).toEqual({ id: "app/A" });
		expect(call(1)[0]).toBe(
			"https://api.hetzner.cloud/v1/zones/example.com/rrsets/app/A/actions/add_records",
		);
		expect(call(1)[1].method).toBe("POST");
		expect(bodyOf(1)).toEqual({ ttl: 120, records: [{ value: "1.2.3.4" }] });
	});

	it("maps the zone apex to @", async () => {
		mockFetch
			.mockResolvedValueOnce(hzError("not_found", "rrset not found", 404))
			.mockResolvedValueOnce(actionResponse());

		const result = await hetznerClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "TXT",
			name: "example.com",
			content: "v=spf1 -all",
		});

		expect(result).toEqual({ id: "@/TXT" });
		expect(call(1)[0]).toContain("/rrsets/%40/TXT/actions/add_records");
		expect(bodyOf(1)).toEqual({
			ttl: null,
			records: [{ value: '"v=spf1 -all"' }],
		});
	});

	it("escapes quotes and splits long TXT values into 255-character chunks", async () => {
		mockFetch
			.mockResolvedValueOnce(hzError("not_found", "rrset not found", 404))
			.mockResolvedValueOnce(actionResponse());
		const longValue = `say "hi" ${"a".repeat(300)}`;

		await hetznerClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "TXT",
			name: "example.com",
			content: longValue,
		});

		const escaped = longValue.replaceAll('"', '\\"');
		expect(bodyOf(1).records).toEqual([
			{ value: `"${escaped.slice(0, 255)}" "${escaped.slice(255)}"` },
		]);
	});

	it("only appends values the RRSet does not already have", async () => {
		mockFetch
			.mockResolvedValueOnce(
				jsonResponse({
					rrset: {
						id: "app/A",
						name: "app",
						type: "A",
						ttl: 300,
						records: [{ value: "1.2.3.4" }],
					},
				}),
			)
			.mockResolvedValueOnce(actionResponse());

		await hetznerClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "A",
			name: "app.example.com",
			content: "1.2.3.4\n5.6.7.8",
		});

		expect(bodyOf(1).records).toEqual([{ value: "5.6.7.8" }]);
	});

	it("skips the write when every value is already present", async () => {
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				rrset: {
					id: "app/A",
					name: "app",
					type: "A",
					ttl: 300,
					records: [{ value: "1.2.3.4" }],
				},
			}),
		);

		await hetznerClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "A",
			name: "app.example.com",
			content: "1.2.3.4",
		});

		expect(mockFetch).toHaveBeenCalledTimes(1);
	});
});

describe("hetznerClient.updateRecord", () => {
	it("overwrites values and TTL in place when name and type are unchanged", async () => {
		mockFetch
			.mockResolvedValueOnce(actionResponse())
			.mockResolvedValueOnce(actionResponse());

		const result = await hetznerClient.updateRecord(
			config,
			"example.com",
			"app/A",
			{ type: "A", name: "app.example.com", content: "9.9.9.9", ttl: 60 },
		);

		expect(result).toEqual({ id: "app/A" });
		expect(call(0)[0]).toContain("/rrsets/app/A/actions/set_records");
		expect(bodyOf(0)).toEqual({ records: [{ value: "9.9.9.9" }] });
		expect(call(1)[0]).toContain("/rrsets/app/A/actions/change_ttl");
		expect(bodyOf(1)).toEqual({ ttl: 60 });
	});

	it("recreates the RRSet when the name changes", async () => {
		mockFetch
			.mockResolvedValueOnce(jsonResponse({ rrset: {} }, true, 201))
			.mockResolvedValueOnce(actionResponse());

		const result = await hetznerClient.updateRecord(
			config,
			"example.com",
			"app/A",
			{ type: "A", name: "api.example.com", content: "9.9.9.9" },
		);

		expect(result).toEqual({ id: "api/A" });
		expect(call(0)[0]).toBe(
			"https://api.hetzner.cloud/v1/zones/example.com/rrsets",
		);
		expect(bodyOf(0)).toEqual({
			name: "api",
			type: "A",
			ttl: null,
			records: [{ value: "9.9.9.9" }],
		});
		expect(call(1)[0]).toContain("/rrsets/app/A");
		expect(call(1)[1].method).toBe("DELETE");
	});
});

describe("hetznerClient.deleteRecord", () => {
	it("deletes the RRSet identified by the record id", async () => {
		mockFetch.mockResolvedValueOnce(actionResponse());

		await hetznerClient.deleteRecord(config, "example.com", "*.app/CNAME");

		expect(call(0)[0]).toBe(
			"https://api.hetzner.cloud/v1/zones/example.com/rrsets/*.app/CNAME",
		);
		expect(call(0)[1].method).toBe("DELETE");
	});
});

describe("hetznerClient.testConnection", () => {
	it("calls the zones endpoint", async () => {
		mockFetch.mockResolvedValueOnce(hzPage("zones", [], null));

		await hetznerClient.testConnection(config);

		expect(call(0)[0]).toBe("https://api.hetzner.cloud/v1/zones?per_page=1");
	});
});
