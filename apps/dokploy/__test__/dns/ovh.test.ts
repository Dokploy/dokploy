import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

import { ovhClient } from "@dokploy/server/utils/dns/ovh";

const textResponse = (body: string, ok = true, status = 200) =>
	({
		ok,
		status,
		text: async () => body,
	}) as Response;

const ovhSuccess = (data: unknown) =>
	textResponse(data === undefined ? "" : JSON.stringify(data));

const ovhError = (message: string, status = 403) =>
	textResponse(JSON.stringify({ message }), false, status);

const SERVER_TIME = 1788268225;

const config = {
	providerType: "ovh" as const,
	endpoint: "ovh-eu" as const,
	applicationKey: "app-key",
	applicationSecret: "app-secret",
	consumerKey: "consumer-key",
};

// Each test uses a distinct endpoint so the module-level clock-skew cache, which
// is keyed by base url, never leaks a measurement between them.
let endpointCursor = 0;
const endpoints = [
	"ovh-eu",
	"ovh-ca",
	"ovh-us",
	"kimsufi-eu",
	"kimsufi-ca",
	"soyoustart-eu",
	"soyoustart-ca",
] as const;
const baseUrls: Record<(typeof endpoints)[number], string> = {
	"ovh-eu": "https://eu.api.ovh.com/1.0",
	"ovh-ca": "https://ca.api.ovh.com/1.0",
	"ovh-us": "https://api.us.ovhcloud.com/1.0",
	"kimsufi-eu": "https://eu.api.kimsufi.com/1.0",
	"kimsufi-ca": "https://ca.api.kimsufi.com/1.0",
	"soyoustart-eu": "https://eu.api.soyoustart.com/1.0",
	"soyoustart-ca": "https://ca.api.soyoustart.com/1.0",
};

/** A config on a not-yet-used endpoint, so the first call always fetches /auth/time. */
const freshConfig = () => {
	const endpoint = endpoints[
		endpointCursor % endpoints.length
	] as (typeof endpoints)[number];
	endpointCursor += 1;
	return { ...config, endpoint, baseUrl: baseUrls[endpoint] };
};

/** Replies to /auth/time, then to each queued API response in order. */
const mockApi = (...responses: Response[]) => {
	let call = 0;
	mockFetch.mockImplementation((url: string) => {
		if (url.endsWith("/auth/time")) {
			return Promise.resolve(textResponse(String(SERVER_TIME)));
		}
		const response = responses[call];
		call += 1;
		return Promise.resolve(response ?? ovhSuccess(null));
	});
};

const apiCalls = () =>
	mockFetch.mock.calls.filter(
		([url]) => !(url as string).endsWith("/auth/time"),
	) as [string, RequestInit][];

beforeEach(() => {
	mockFetch.mockReset();
});

describe("ovhClient request signing", () => {
	it("signs the request with the API server clock, not the local one", async () => {
		const { baseUrl, ...cfg } = freshConfig();
		mockApi(ovhSuccess(["example.com"]));
		vi.spyOn(Date, "now").mockReturnValue((SERVER_TIME - 120) * 1000);

		await ovhClient.listZones(cfg);

		const [url, init] = apiCalls()[0] as [string, RequestInit];
		const headers = init.headers as Record<string, string>;
		expect(url).toBe(`${baseUrl}/domain/zone`);
		expect(headers["X-Ovh-Timestamp"]).toBe(String(SERVER_TIME));
		expect(headers["X-Ovh-Application"]).toBe("app-key");
		expect(headers["X-Ovh-Consumer"]).toBe("consumer-key");

		const expected = createHash("sha1")
			.update(
				["app-secret", "consumer-key", "GET", url, "", SERVER_TIME].join("+"),
			)
			.digest("hex");
		expect(headers["X-Ovh-Signature"]).toBe(`$1$${expected}`);

		vi.restoreAllMocks();
	});

	it("signs a request body when one is sent", async () => {
		const { baseUrl, ...cfg } = freshConfig();
		mockApi(ovhSuccess([]), ovhSuccess({ id: 5 }), ovhSuccess(null));
		vi.spyOn(Date, "now").mockReturnValue(SERVER_TIME * 1000);

		await ovhClient.upsertRecord(cfg, {
			zoneId: "example.com",
			type: "A",
			name: "app.example.com",
			content: "1.2.3.4",
		});

		const [url, init] = apiCalls()[1] as [string, RequestInit];
		const headers = init.headers as Record<string, string>;
		const body = init.body as string;
		expect(body).not.toBe("");
		const expected = createHash("sha1")
			.update(
				["app-secret", "consumer-key", "POST", url, body, SERVER_TIME].join(
					"+",
				),
			)
			.digest("hex");
		expect(headers["X-Ovh-Signature"]).toBe(`$1$${expected}`);

		vi.restoreAllMocks();
	});
});

describe("ovhClient.listZones", () => {
	it("maps each zone name to a zone", async () => {
		const cfg = freshConfig();
		mockApi(ovhSuccess(["example.com", "example.fr"]));

		const zones = await ovhClient.listZones(cfg);

		expect(zones).toEqual([
			{ id: "example.com", name: "example.com" },
			{ id: "example.fr", name: "example.fr" },
		]);
	});

	it("names the missing root right when OVH refuses the zone listing", async () => {
		const cfg = freshConfig();
		mockApi(ovhError("This call has not been granted", 403));

		// A `GET /domain/zone/*` rule does not cover the bare `GET /domain/zone`,
		// so the raw OVH message would send users looking in the wrong place.
		await expect(ovhClient.listZones(cfg)).rejects.toThrow(
			/missing the `GET \/domain\/zone` right/,
		);
	});

	it("propagates the API error message", async () => {
		const cfg = freshConfig();
		mockApi(ovhError("Invalid signature", 403));

		await expect(ovhClient.listZones(cfg)).rejects.toThrow("Invalid signature");
	});
});

describe("ovhClient.listRecords", () => {
	it("resolves each id into a full record", async () => {
		const cfg = freshConfig();
		mockApi(
			ovhSuccess([1, 2]),
			ovhSuccess({
				id: 1,
				zone: "example.com",
				fieldType: "A",
				subDomain: "app",
				target: "1.2.3.4",
				ttl: 600,
			}),
			ovhSuccess({
				id: 2,
				zone: "example.com",
				fieldType: "A",
				subDomain: null,
				target: "5.6.7.8",
				ttl: null,
			}),
		);

		const records = await ovhClient.listRecords(cfg, "example.com");

		expect(records).toEqual([
			{
				id: "1",
				type: "A",
				name: "app.example.com",
				content: "1.2.3.4",
				ttl: 600,
			},
			{
				id: "2",
				type: "A",
				name: "example.com",
				content: "5.6.7.8",
				ttl: 0,
			},
		]);
	});

	it("keeps the records in the order of the returned ids", async () => {
		const cfg = freshConfig();
		const record = (id: number, subDomain: string) => ({
			id,
			zone: "example.com",
			fieldType: "A",
			subDomain,
			target: `10.0.0.${id}`,
			ttl: 60,
		});
		mockApi(
			ovhSuccess([1, 2, 3, 4, 5]),
			...[1, 2, 3, 4, 5].map((id) => ovhSuccess(record(id, `host${id}`))),
		);

		const records = await ovhClient.listRecords(cfg, "example.com");

		expect(records.map((r) => r.id)).toEqual(["1", "2", "3", "4", "5"]);
	});
});

describe("ovhClient.upsertRecord", () => {
	it("creates the record then refreshes the zone", async () => {
		const cfg = freshConfig();
		mockApi(ovhSuccess([]), ovhSuccess({ id: 9 }), ovhSuccess(null));

		const result = await ovhClient.upsertRecord(cfg, {
			zoneId: "example.com",
			type: "A",
			name: "app.example.com",
			content: "1.2.3.4",
			ttl: 600,
		});

		expect(result).toEqual({ id: "9" });
		const calls = apiCalls();
		expect(calls[0]?.[0]).toContain(
			"/domain/zone/example.com/record?fieldType=A&subDomain=app",
		);
		expect(calls[1]?.[1].method).toBe("POST");
		expect(JSON.parse(calls[1]?.[1].body as string)).toEqual({
			fieldType: "A",
			subDomain: "app",
			target: "1.2.3.4",
			ttl: 600,
		});
		expect(calls[2]?.[0]).toContain("/domain/zone/example.com/refresh");
		expect(calls[2]?.[1].method).toBe("POST");
	});

	it("updates the existing record instead of creating a duplicate", async () => {
		const cfg = freshConfig();
		mockApi(ovhSuccess([4]), ovhSuccess(null), ovhSuccess(null));

		const result = await ovhClient.upsertRecord(cfg, {
			zoneId: "example.com",
			type: "A",
			name: "app.example.com",
			content: "1.2.3.4",
		});

		expect(result).toEqual({ id: "4" });
		const calls = apiCalls();
		expect(calls[1]?.[0]).toContain("/domain/zone/example.com/record/4");
		expect(calls[1]?.[1].method).toBe("PUT");
		expect(calls[2]?.[0]).toContain("/refresh");
	});

	it("omits the ttl so OVH applies the zone default", async () => {
		const cfg = freshConfig();
		mockApi(ovhSuccess([]), ovhSuccess({ id: 9 }), ovhSuccess(null));

		await ovhClient.upsertRecord(cfg, {
			zoneId: "example.com",
			type: "A",
			name: "app.example.com",
			content: "1.2.3.4",
		});

		expect(JSON.parse(apiCalls()[1]?.[1].body as string)).not.toHaveProperty(
			"ttl",
		);
	});

	it("writes an empty subDomain for the apex and strips the trailing dot", async () => {
		const cfg = freshConfig();
		mockApi(ovhSuccess([]), ovhSuccess({ id: 9 }), ovhSuccess(null));

		await ovhClient.upsertRecord(cfg, {
			zoneId: "example.com",
			type: "A",
			name: "example.com.",
			content: "1.2.3.4",
		});

		expect(apiCalls()[0]?.[0]).toContain("subDomain=");
		expect(JSON.parse(apiCalls()[1]?.[1].body as string).subDomain).toBe("");
	});
});

describe("ovhClient.updateRecord", () => {
	it("updates in place when the type is unchanged", async () => {
		const cfg = freshConfig();
		mockApi(
			ovhSuccess({
				id: 4,
				zone: "example.com",
				fieldType: "A",
				subDomain: "app",
				target: "1.1.1.1",
				ttl: 60,
			}),
			ovhSuccess(null),
			ovhSuccess(null),
		);

		const result = await ovhClient.updateRecord(cfg, "example.com", "4", {
			type: "A",
			name: "app.example.com",
			content: "1.2.3.4",
			ttl: 300,
		});

		expect(result).toEqual({ id: "4" });
		const calls = apiCalls();
		expect(calls[1]?.[1].method).toBe("PUT");
		expect(JSON.parse(calls[1]?.[1].body as string)).toEqual({
			subDomain: "app",
			target: "1.2.3.4",
			ttl: 300,
		});
		expect(calls[2]?.[0]).toContain("/refresh");
	});

	it("replaces the record when the type changes, since PUT carries no fieldType", async () => {
		const cfg = freshConfig();
		mockApi(
			ovhSuccess({
				id: 4,
				zone: "example.com",
				fieldType: "A",
				subDomain: "app",
				target: "1.1.1.1",
				ttl: 60,
			}),
			ovhSuccess(null),
			ovhSuccess({ id: 11 }),
			ovhSuccess(null),
		);

		const result = await ovhClient.updateRecord(cfg, "example.com", "4", {
			type: "CNAME",
			name: "app.example.com",
			content: "example.com",
		});

		expect(result).toEqual({ id: "11" });
		const calls = apiCalls();
		expect(calls[1]?.[1].method).toBe("DELETE");
		expect(calls[2]?.[1].method).toBe("POST");
		expect(JSON.parse(calls[2]?.[1].body as string).fieldType).toBe("CNAME");
		expect(calls[3]?.[0]).toContain("/refresh");
	});

	it("restores the original record when the replacement fails", async () => {
		const cfg = freshConfig();
		const original = {
			id: 4,
			zone: "example.com",
			fieldType: "A",
			subDomain: "app",
			target: "1.1.1.1",
			ttl: 60,
		};
		mockApi(
			ovhSuccess(original),
			ovhSuccess(null),
			ovhError("Invalid target", 400),
			ovhSuccess({ id: 12 }),
			ovhSuccess(null),
		);

		await expect(
			ovhClient.updateRecord(cfg, "example.com", "4", {
				type: "CNAME",
				name: "app.example.com",
				content: "not a valid target",
			}),
		).rejects.toThrow("Invalid target");

		const calls = apiCalls();
		expect(calls[1]?.[1].method).toBe("DELETE");
		expect(calls[2]?.[1].method).toBe("POST");
		// The original record is put back with its own type, target and ttl.
		expect(JSON.parse(calls[3]?.[1].body as string)).toEqual({
			fieldType: "A",
			subDomain: "app",
			target: "1.1.1.1",
			ttl: 60,
		});
		expect(calls[4]?.[0]).toContain("/refresh");
	});

	it("reports the lost record when the restore also fails", async () => {
		const cfg = freshConfig();
		mockApi(
			ovhSuccess({
				id: 4,
				zone: "example.com",
				fieldType: "A",
				subDomain: "app",
				target: "1.1.1.1",
				ttl: 60,
			}),
			ovhSuccess(null),
			ovhError("Invalid target", 400),
			ovhError("Service unavailable", 503),
		);

		await expect(
			ovhClient.updateRecord(cfg, "example.com", "4", {
				type: "CNAME",
				name: "app.example.com",
				content: "not a valid target",
			}),
		).rejects.toThrow(
			/Recreate it manually: A app\.example\.com -> 1\.1\.1\.1/,
		);
	});

	it("says the change was applied when only the zone refresh fails", async () => {
		const cfg = freshConfig();
		mockApi(
			ovhSuccess({
				id: 4,
				zone: "example.com",
				fieldType: "A",
				subDomain: "app",
				target: "1.1.1.1",
				ttl: 60,
			}),
			ovhSuccess(null),
			ovhSuccess({ id: 11 }),
			ovhError("Service unavailable", 503),
		);

		// The replacement succeeded, so the record exists at the provider — only
		// publishing failed. Rolling back would destroy correct state.
		await expect(
			ovhClient.updateRecord(cfg, "example.com", "4", {
				type: "CNAME",
				name: "app.example.com",
				content: "example.com",
			}),
		).rejects.toThrow(/was applied, but refreshing zone "example\.com" failed/);
	});

	it("does not tell the user to recreate a record that was restored but not published", async () => {
		const cfg = freshConfig();
		mockApi(
			ovhSuccess({
				id: 4,
				zone: "example.com",
				fieldType: "A",
				subDomain: "app",
				target: "1.1.1.1",
				ttl: 60,
			}),
			ovhSuccess(null), // DELETE de l'ancien
			ovhError("Invalid target", 400), // POST de remplacement -> échec
			ovhSuccess({ id: 12 }), // POST de restauration -> succès
			ovhError("Service unavailable", 503), // refresh -> échec
		);

		const attempt = ovhClient.updateRecord(cfg, "example.com", "4", {
			type: "CNAME",
			name: "app.example.com",
			content: "not a valid target",
		});

		// L'enregistrement existe de nouveau chez OVH : le recréer le dupliquerait.
		await expect(attempt).rejects.toThrow(/was restored, but refreshing zone/);
		await expect(attempt).rejects.not.toThrow(/Recreate it manually/);
	});
});

describe("ovhClient.deleteRecord", () => {
	it("deletes the record then refreshes the zone", async () => {
		const cfg = freshConfig();
		mockApi(ovhSuccess(null), ovhSuccess(null));

		await ovhClient.deleteRecord(cfg, "example.com", "4");

		const calls = apiCalls();
		expect(calls[0]?.[0]).toContain("/domain/zone/example.com/record/4");
		expect(calls[0]?.[1].method).toBe("DELETE");
		expect(calls[1]?.[0]).toContain("/domain/zone/example.com/refresh");
	});

	it("does not refresh the zone when the delete fails", async () => {
		const cfg = freshConfig();
		mockApi(ovhError("This object does not exist", 404));

		await expect(
			ovhClient.deleteRecord(cfg, "example.com", "4"),
		).rejects.toThrow("This object does not exist");
		expect(apiCalls()).toHaveLength(1);
	});
});

describe("ovhClient.testConnection", () => {
	it("resolves when the zone listing succeeds", async () => {
		const cfg = freshConfig();
		mockApi(ovhSuccess([]));

		await expect(ovhClient.testConnection(cfg)).resolves.toBeUndefined();
	});

	it("rejects on invalid credentials", async () => {
		const cfg = freshConfig();
		mockApi(ovhError("Invalid signature", 403));

		await expect(ovhClient.testConnection(cfg)).rejects.toThrow(
			"Invalid signature",
		);
	});
});
