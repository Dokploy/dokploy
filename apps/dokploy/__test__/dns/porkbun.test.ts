import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

import { porkbunClient } from "@dokploy/server/utils/dns/porkbun";

const jsonResponse = (body: unknown, ok = true, status = 200) =>
	({
		ok,
		status,
		json: async () => body,
	}) as Response;

const pbSuccess = (result: Record<string, unknown> = {}) =>
	jsonResponse({ status: "SUCCESS", ...result });

const pbError = (message: string, status = 400) =>
	jsonResponse({ status: "ERROR", message }, false, status);

const config = {
	providerType: "porkbun" as const,
	apiKey: "pk1_test",
	secretApiKey: "sk1_test",
};

beforeEach(() => {
	mockFetch.mockReset();
});

describe("porkbunClient.listZones", () => {
	it("lists all domains as zones", async () => {
		mockFetch.mockResolvedValue(
			pbSuccess({ domains: [{ domain: "example.com" }] }),
		);

		const zones = await porkbunClient.listZones(config);

		expect(zones).toEqual([{ id: "example.com", name: "example.com" }]);
		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/domain/listAll");
		const body = JSON.parse(init.body as string);
		expect(body).toMatchObject({
			apikey: "pk1_test",
			secretapikey: "sk1_test",
		});
	});
});

describe("porkbunClient.listRecords", () => {
	it("lists records for a domain", async () => {
		mockFetch.mockResolvedValue(
			pbSuccess({
				records: [
					{
						id: "1",
						type: "A",
						name: "app.example.com",
						content: "1.2.3.4",
						ttl: "600",
						prio: "0",
						notes: "",
					},
				],
			}),
		);

		const records = await porkbunClient.listRecords(config, "example.com");

		expect(records).toEqual([
			{
				id: "1",
				type: "A",
				name: "app.example.com",
				content: "1.2.3.4",
				ttl: 600,
			},
		]);
		expect(mockFetch.mock.calls[0]?.[0]).toContain("/dns/retrieve/example.com");
	});
});

describe("porkbunClient.upsertRecord", () => {
	it("creates a record when none exists for the name/type", async () => {
		mockFetch
			.mockResolvedValueOnce(pbSuccess({ records: [] }))
			.mockResolvedValueOnce(pbSuccess({ id: "new-1" }));

		const result = await porkbunClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "A",
			name: "app.example.com",
			content: "1.2.3.4",
		});

		expect(result).toEqual({ id: "new-1" });
		const [lookupUrl] = mockFetch.mock.calls[0] as [string];
		expect(lookupUrl).toContain("/dns/retrieveByNameType/example.com/A/app");
		const [createUrl, createInit] = mockFetch.mock.calls[1] as [
			string,
			RequestInit,
		];
		expect(createUrl).toContain("/dns/create/example.com");
		const body = JSON.parse(createInit.body as string);
		expect(body).toMatchObject({ name: "app", type: "A", content: "1.2.3.4" });
	});

	it("resolves the apex domain to an empty subdomain", async () => {
		mockFetch
			.mockResolvedValueOnce(pbSuccess({ records: [] }))
			.mockResolvedValueOnce(pbSuccess({ id: "new-2" }));

		await porkbunClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "A",
			name: "example.com",
			content: "1.2.3.4",
		});

		const [lookupUrl] = mockFetch.mock.calls[0] as [string];
		expect(lookupUrl).toContain("/dns/retrieveByNameType/example.com/A/");
	});

	it("edits the existing record instead of creating a duplicate", async () => {
		mockFetch
			.mockResolvedValueOnce(pbSuccess({ records: [{ id: "existing-1" }] }))
			.mockResolvedValueOnce(pbSuccess({}));

		const result = await porkbunClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "A",
			name: "app.example.com",
			content: "5.6.7.8",
		});

		expect(result).toEqual({ id: "existing-1" });
		const [editUrl] = mockFetch.mock.calls[1] as [string, RequestInit];
		expect(editUrl).toContain("/dns/edit/example.com/existing-1");
	});

	it("defaults ttl to 600 when not provided", async () => {
		mockFetch
			.mockResolvedValueOnce(pbSuccess({ records: [] }))
			.mockResolvedValueOnce(pbSuccess({ id: "new-1" }));

		await porkbunClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "CNAME",
			name: "www.example.com",
			content: "example.com",
		});

		const [, createInit] = mockFetch.mock.calls[1] as [string, RequestInit];
		const body = JSON.parse(createInit.body as string);
		expect(body.ttl).toBe(600);
	});
});

describe("porkbunClient.updateRecord", () => {
	it("edits the given record id", async () => {
		mockFetch.mockResolvedValue(pbSuccess({}));

		const result = await porkbunClient.updateRecord(
			config,
			"example.com",
			"1",
			{
				type: "A",
				name: "app.example.com",
				content: "9.9.9.9",
				ttl: 300,
			},
		);

		expect(result).toEqual({ id: "1" });
		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/dns/edit/example.com/1");
		expect(JSON.parse(init.body as string)).toMatchObject({
			name: "app",
			type: "A",
			content: "9.9.9.9",
			ttl: 300,
		});
	});
});

describe("porkbunClient.deleteRecord", () => {
	it("posts to the delete endpoint for the given record id", async () => {
		mockFetch.mockResolvedValue(pbSuccess({}));

		await porkbunClient.deleteRecord(config, "example.com", "1");

		const [url] = mockFetch.mock.calls[0] as [string];
		expect(url).toContain("/dns/delete/example.com/1");
	});
});

describe("porkbunClient.testConnection", () => {
	it("succeeds when the credentials can ping the API", async () => {
		mockFetch.mockResolvedValue(pbSuccess({}));
		await expect(porkbunClient.testConnection(config)).resolves.toBeUndefined();
	});

	it("surfaces Porkbun's error message on invalid credentials", async () => {
		mockFetch.mockResolvedValue(pbError("Invalid API key."));

		await expect(porkbunClient.testConnection(config)).rejects.toThrow(
			"Invalid API key.",
		);
	});
});
