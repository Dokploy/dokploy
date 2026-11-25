import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

import { digitaloceanClient } from "@dokploy/server/utils/dns/digitalocean";

const textResponse = (text: string, ok = true, status = 200) =>
	({
		ok,
		status,
		text: async () => text,
	}) as Response;

const jsonResponse = (body: unknown, ok = true, status = 200) =>
	textResponse(JSON.stringify(body), ok, status);

const noContent = () => textResponse("", true, 204);

const doError = (message: string, status = 401) =>
	jsonResponse({ id: "unauthorized", message }, false, status);

const record = (overrides: Record<string, unknown>) => ({
	id: 1,
	type: "A",
	name: "@",
	data: "1.2.3.4",
	priority: null,
	port: null,
	ttl: 1800,
	weight: null,
	flags: null,
	tag: null,
	...overrides,
});

const config = {
	providerType: "digitalocean" as const,
	apiToken: "do-token",
};

type Call = [string, RequestInit & { method?: string }];

const call = (index: number) => mockFetch.mock.calls[index] as Call;

const bodyOf = (index: number) => JSON.parse(call(index)[1].body as string);

beforeEach(() => {
	mockFetch.mockReset();
});

describe("digitaloceanClient.listZones", () => {
	it("returns each domain as a zone keyed by its name", async () => {
		mockFetch.mockResolvedValue(
			jsonResponse({
				domains: [{ name: "example.com" }, { name: "example.org" }],
				links: {},
			}),
		);

		const zones = await digitaloceanClient.listZones(config);

		expect(zones).toEqual([
			{ id: "example.com", name: "example.com" },
			{ id: "example.org", name: "example.org" },
		]);
		const [url, init] = call(0);
		expect(url).toBe(
			"https://api.digitalocean.com/v2/domains?per_page=200&page=1",
		);
		expect(init.headers).toMatchObject({ Authorization: "Bearer do-token" });
	});

	it("follows the next link until the last page", async () => {
		mockFetch
			.mockResolvedValueOnce(
				jsonResponse({
					domains: [{ name: "a.com" }],
					links: { pages: { next: "https://api.digitalocean.com/..." } },
				}),
			)
			.mockResolvedValueOnce(
				jsonResponse({ domains: [{ name: "b.com" }], links: {} }),
			);

		const zones = await digitaloceanClient.listZones(config);

		expect(zones.map((zone) => zone.name)).toEqual(["a.com", "b.com"]);
		expect(call(1)[0]).toContain("page=2");
	});

	it("surfaces the API error message", async () => {
		mockFetch.mockResolvedValue(doError("Unable to authenticate you"));

		await expect(digitaloceanClient.listZones(config)).rejects.toThrow(
			"DigitalOcean: request to /domains?per_page=200&page=1 failed: Unable to authenticate you",
		);
	});
});

describe("digitaloceanClient.listRecords", () => {
	it("converts relative names and structured values to Dokploy's format", async () => {
		mockFetch.mockResolvedValue(
			jsonResponse({
				domain_records: [
					record({ id: 1, type: "A", name: "app", data: "1.2.3.4" }),
					record({ id: 2, type: "CNAME", name: "www", data: "@" }),
					record({
						id: 3,
						type: "CNAME",
						name: "docs",
						data: "pages.example.net",
					}),
					record({
						id: 4,
						type: "MX",
						name: "@",
						data: "mail.example.com",
						priority: 10,
					}),
					record({
						id: 5,
						type: "SRV",
						name: "_sip._udp",
						data: "sip.example.com",
						priority: 1,
						weight: 10,
						port: 5060,
					}),
					record({
						id: 6,
						type: "CAA",
						name: "@",
						data: "letsencrypt.org",
						flags: 0,
						tag: "issue",
					}),
					record({
						id: 7,
						type: "CAA",
						name: "@",
						data: "mailto:security@example.com",
						flags: 0,
						tag: "iodef",
					}),
					record({ id: 8, type: "TXT", name: "@", data: "v=spf1 -all" }),
				],
				links: {},
			}),
		);

		const records = await digitaloceanClient.listRecords(config, "example.com");

		expect(call(0)[0]).toBe(
			"https://api.digitalocean.com/v2/domains/example.com/records?per_page=200&page=1",
		);
		expect(records.map(({ name, content }) => ({ name, content }))).toEqual([
			{ name: "app.example.com", content: "1.2.3.4" },
			{ name: "www.example.com", content: "example.com" },
			{ name: "docs.example.com", content: "pages.example.net" },
			{ name: "example.com", content: "10 mail.example.com" },
			{ name: "_sip._udp.example.com", content: "1 10 5060 sip.example.com" },
			{ name: "example.com", content: '0 issue "letsencrypt.org"' },
			{ name: "example.com", content: '0 iodef "mailto:security@example.com"' },
			{ name: "example.com", content: "v=spf1 -all" },
		]);
		expect(records[0]).toEqual({
			id: "1",
			type: "A",
			name: "app.example.com",
			content: "1.2.3.4",
			ttl: 1800,
		});
	});

	it("follows the next link so large zones keep all their records", async () => {
		mockFetch
			.mockResolvedValueOnce(
				jsonResponse({
					domain_records: [record({ id: 1, name: "a" })],
					links: { pages: { next: "https://api.digitalocean.com/..." } },
				}),
			)
			.mockResolvedValueOnce(
				jsonResponse({
					domain_records: [record({ id: 2, name: "b" })],
					links: {},
				}),
			);

		const records = await digitaloceanClient.listRecords(config, "example.com");

		expect(records.map((r) => r.name)).toEqual([
			"a.example.com",
			"b.example.com",
		]);
		expect(call(1)[0]).toContain("/records?per_page=200&page=2");
	});
});

describe("digitaloceanClient.upsertRecord", () => {
	it("creates a record with a relative name when no match exists", async () => {
		mockFetch
			.mockResolvedValueOnce(jsonResponse({ domain_records: [], links: {} }))
			.mockResolvedValueOnce(
				jsonResponse({ domain_record: record({ id: 42 }) }, true, 201),
			);

		const result = await digitaloceanClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "A",
			name: "app.example.com",
			content: "1.2.3.4",
			ttl: 300,
		});

		expect(result).toEqual({ id: "42" });
		// The name filter only matches fully-qualified names.
		expect(call(0)[0]).toBe(
			"https://api.digitalocean.com/v2/domains/example.com/records?type=A&name=app.example.com&per_page=200&page=1",
		);
		expect(call(1)[0]).toBe(
			"https://api.digitalocean.com/v2/domains/example.com/records",
		);
		expect(call(1)[1].method).toBe("POST");
		expect(bodyOf(1)).toEqual({
			type: "A",
			name: "app",
			data: "1.2.3.4",
			ttl: 300,
		});
	});

	it("uses @ for the apex and leaves the ttl to DigitalOcean when unset", async () => {
		mockFetch
			.mockResolvedValueOnce(jsonResponse({ domain_records: [], links: {} }))
			.mockResolvedValueOnce(jsonResponse({ domain_record: record({}) }));

		await digitaloceanClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "A",
			name: "example.com",
			content: "1.2.3.4",
		});

		expect(call(0)[0]).toContain("name=example.com&");
		expect(bodyOf(1)).toEqual({ type: "A", name: "@", data: "1.2.3.4" });
	});

	it("sends hostname values with a trailing dot so they are not made relative", async () => {
		mockFetch.mockImplementation(async (_url: string, init: RequestInit) =>
			init.method === "POST"
				? jsonResponse({ domain_record: record({}) })
				: jsonResponse({ domain_records: [], links: {} }),
		);

		const upsert = (type: "CNAME" | "MX" | "SRV" | "CAA", content: string) =>
			digitaloceanClient.upsertRecord(config, {
				zoneId: "example.com",
				type,
				name: "app.example.com",
				content,
			});

		await upsert("CNAME", "target.example.net");
		await upsert("MX", "20 mail.example.com");
		await upsert("SRV", "1 10 5060 sip.example.com");
		await upsert("CAA", '0 issue "letsencrypt.org"');

		expect(bodyOf(1)).toMatchObject({
			type: "CNAME",
			data: "target.example.net.",
		});
		expect(bodyOf(3)).toMatchObject({
			type: "MX",
			priority: 20,
			data: "mail.example.com.",
		});
		expect(bodyOf(5)).toMatchObject({
			type: "SRV",
			priority: 1,
			weight: 10,
			port: 5060,
			data: "sip.example.com.",
		});
		expect(bodyOf(7)).toMatchObject({
			type: "CAA",
			flags: 0,
			tag: "issue",
			data: "letsencrypt.org.",
		});
	});

	it("keeps iodef CAA values as written", async () => {
		mockFetch
			.mockResolvedValueOnce(jsonResponse({ domain_records: [], links: {} }))
			.mockResolvedValueOnce(jsonResponse({ domain_record: record({}) }));

		await digitaloceanClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "CAA",
			name: "example.com",
			content: '0 iodef "mailto:security@example.com"',
		});

		expect(bodyOf(1)).toMatchObject({
			tag: "iodef",
			data: "mailto:security@example.com",
		});
	});

	it("updates the record whose value matches instead of creating a duplicate", async () => {
		mockFetch
			.mockResolvedValueOnce(
				jsonResponse({
					domain_records: [
						record({
							id: 7,
							type: "MX",
							data: "backup.example.com",
							priority: 20,
						}),
						record({
							id: 8,
							type: "MX",
							data: "mail.example.com",
							priority: 10,
						}),
					],
					links: {},
				}),
			)
			.mockResolvedValueOnce(
				jsonResponse({ domain_record: record({ id: 8 }) }),
			);

		const result = await digitaloceanClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "MX",
			name: "example.com",
			content: "10 mail.example.com",
			ttl: 600,
		});

		expect(result).toEqual({ id: "8" });
		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(call(1)[0]).toBe(
			"https://api.digitalocean.com/v2/domains/example.com/records/8",
		);
		expect(call(1)[1].method).toBe("PUT");
		expect(bodyOf(1)).toEqual({
			type: "MX",
			name: "@",
			priority: 10,
			data: "mail.example.com.",
			ttl: 600,
		});
	});

	it("creates a new record when only the value differs, keeping the existing one", async () => {
		mockFetch
			.mockResolvedValueOnce(
				jsonResponse({
					domain_records: [record({ id: 3, name: "app", data: "9.9.9.9" })],
					links: {},
				}),
			)
			.mockResolvedValueOnce(
				jsonResponse({ domain_record: record({ id: 4 }) }),
			);

		const result = await digitaloceanClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "A",
			name: "app.example.com",
			content: "1.2.3.4",
		});

		expect(result).toEqual({ id: "4" });
		expect(call(1)[1].method).toBe("POST");
	});

	it("rejects a malformed SRV value before calling the API", async () => {
		await expect(
			digitaloceanClient.upsertRecord(config, {
				zoneId: "example.com",
				type: "SRV",
				name: "_sip._udp.example.com",
				content: "sip.example.com",
			}),
		).rejects.toThrow('an SRV value must be "priority weight port target"');
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("rejects a CAA value that has no tag before calling the API", async () => {
		await expect(
			digitaloceanClient.upsertRecord(config, {
				zoneId: "example.com",
				type: "CAA",
				name: "example.com",
				content: '"letsencrypt.org"',
			}),
		).rejects.toThrow('a CAA value must be `flags tag "value"`');
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("falls back to MX priority 10 when the content has no leading number", async () => {
		mockFetch
			.mockResolvedValueOnce(jsonResponse({ domain_records: [], links: {} }))
			.mockResolvedValueOnce(jsonResponse({ domain_record: record({}) }));

		await digitaloceanClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "MX",
			name: "example.com",
			content: "mail.example.com",
		});

		expect(bodyOf(1)).toMatchObject({
			priority: 10,
			data: "mail.example.com.",
		});
	});
});

describe("digitaloceanClient.updateRecord", () => {
	it("updates in place when the type is unchanged", async () => {
		mockFetch
			.mockResolvedValueOnce(
				jsonResponse({ domain_record: record({ id: 5, name: "app" }) }),
			)
			.mockResolvedValueOnce(
				jsonResponse({ domain_record: record({ id: 5 }) }),
			);

		const result = await digitaloceanClient.updateRecord(
			config,
			"example.com",
			"5",
			{ type: "A", name: "app.example.com", content: "5.6.7.8", ttl: 120 },
		);

		expect(result).toEqual({ id: "5" });
		expect(call(0)[0]).toBe(
			"https://api.digitalocean.com/v2/domains/example.com/records/5",
		);
		expect(call(1)[1].method).toBe("PUT");
		expect(bodyOf(1)).toEqual({
			type: "A",
			name: "app",
			data: "5.6.7.8",
			ttl: 120,
		});
	});

	it("replaces the record when the type changes", async () => {
		mockFetch
			.mockResolvedValueOnce(
				jsonResponse({ domain_record: record({ id: 5, name: "app" }) }),
			)
			.mockResolvedValueOnce(noContent())
			.mockResolvedValueOnce(
				jsonResponse({ domain_record: record({ id: 9 }) }, true, 201),
			);

		const result = await digitaloceanClient.updateRecord(
			config,
			"example.com",
			"5",
			{ type: "CNAME", name: "app.example.com", content: "example.net" },
		);

		expect(result).toEqual({ id: "9" });
		expect(call(1)[1].method).toBe("DELETE");
		expect(call(2)[1].method).toBe("POST");
		expect(bodyOf(2)).toEqual({
			type: "CNAME",
			name: "app",
			data: "example.net.",
		});
	});

	it("restores the original record when the replacement is rejected", async () => {
		mockFetch
			.mockResolvedValueOnce(
				jsonResponse({
					domain_record: record({
						id: 5,
						type: "MX",
						name: "@",
						data: "mail.example.com",
						priority: 10,
						ttl: 3600,
					}),
				}),
			)
			.mockResolvedValueOnce(noContent())
			.mockResolvedValueOnce(doError("Data is invalid", 422))
			.mockResolvedValueOnce(
				jsonResponse({ domain_record: record({ id: 6 }) }),
			);

		await expect(
			digitaloceanClient.updateRecord(config, "example.com", "5", {
				type: "CNAME",
				name: "example.com",
				content: "example.net",
			}),
		).rejects.toThrow("Data is invalid");

		expect(call(3)[1].method).toBe("POST");
		expect(bodyOf(3)).toEqual({
			type: "MX",
			name: "@",
			priority: 10,
			data: "mail.example.com.",
			ttl: 3600,
		});
	});

	it("says what to recreate when the restore fails too", async () => {
		mockFetch
			.mockResolvedValueOnce(
				jsonResponse({ domain_record: record({ id: 5, name: "app" }) }),
			)
			.mockResolvedValueOnce(noContent())
			.mockResolvedValueOnce(doError("Data is invalid", 422))
			.mockResolvedValueOnce(doError("Service unavailable", 503));

		await expect(
			digitaloceanClient.updateRecord(config, "example.com", "5", {
				type: "CNAME",
				name: "app.example.com",
				content: "example.net",
			}),
		).rejects.toThrow(
			"Recreate it manually: A app.example.com -> 1.2.3.4. Original failure: DigitalOcean: request to /domains/example.com/records failed: Data is invalid",
		);
	});
});

describe("digitaloceanClient.deleteRecord", () => {
	it("accepts the empty 204 response", async () => {
		mockFetch.mockResolvedValue(noContent());

		await digitaloceanClient.deleteRecord(config, "example.com", "5");

		expect(call(0)[0]).toBe(
			"https://api.digitalocean.com/v2/domains/example.com/records/5",
		);
		expect(call(0)[1].method).toBe("DELETE");
	});
});

describe("digitaloceanClient.testConnection", () => {
	it("lists a single domain to validate the token", async () => {
		mockFetch.mockResolvedValue(jsonResponse({ domains: [], links: {} }));

		await digitaloceanClient.testConnection(config);

		expect(call(0)[0]).toBe(
			"https://api.digitalocean.com/v2/domains?per_page=1",
		);
	});

	it("surfaces DigitalOcean's error message on an invalid token", async () => {
		mockFetch.mockResolvedValue(doError("Unable to authenticate you"));

		await expect(digitaloceanClient.testConnection(config)).rejects.toThrow(
			"Unable to authenticate you",
		);
	});

	it("falls back to the status code when the error has no message", async () => {
		mockFetch.mockResolvedValue(textResponse("", false, 500));

		await expect(digitaloceanClient.testConnection(config)).rejects.toThrow(
			"(status 500)",
		);
	});
});

describe("digitaloceanClient auth header", () => {
	it("trims whitespace pasted into the token", async () => {
		mockFetch.mockResolvedValue(jsonResponse({ domains: [], links: {} }));

		await digitaloceanClient.testConnection({
			...config,
			apiToken: "  do-token\n",
		});

		expect(call(0)[1].headers).toMatchObject({
			Authorization: "Bearer do-token",
		});
	});
});
