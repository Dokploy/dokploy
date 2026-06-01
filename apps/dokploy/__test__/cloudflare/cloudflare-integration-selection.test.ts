import type { Cloudflare } from "@dokploy/server/services/cloudflare";
import { selectIntegrationForHost } from "@dokploy/server/services/cloudflare-provisioning";
import { CloudflareApiError } from "@dokploy/server/utils/providers/cloudflare";
import { afterEach, describe, expect, it, vi } from "vitest";

const fakeResponse = (ok: boolean, status: number, body: unknown) =>
	({ ok, status, json: async () => body }) as unknown as Response;

const zoneList = (names: string[]) =>
	fakeResponse(true, 200, {
		success: true,
		errors: [],
		messages: [],
		result: names.map((name, i) => ({ id: `z-${i}`, name, status: "active" })),
	});

// A Cloudflare API failure (non-2xx / success:false) — what cloudflareRequest
// turns into a thrown CloudflareApiError.
const apiFailure = () =>
	fakeResponse(false, 500, {
		success: false,
		errors: [{ code: 1000, message: "rate limited" }],
		messages: [],
		result: null,
	});

// resolveZoneIdForHost only reads `apiToken`, so a minimal partial is enough.
const integration = (apiToken: string): Cloudflare =>
	({ apiToken, cloudflareId: apiToken }) as Cloudflare;

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("selectIntegrationForHost", () => {
	it("returns the integration whose token owns the host's zone", async () => {
		const fetchMock = vi
			.fn()
			// first token: a zone that does not match the host
			.mockResolvedValueOnce(zoneList(["other.com"]))
			// second token: owns example.com
			.mockResolvedValueOnce(zoneList(["example.com"]));
		vi.stubGlobal("fetch", fetchMock);

		const chosen = await selectIntegrationForHost(
			[integration("t1"), integration("t2")],
			"app.example.com",
		);

		expect(chosen?.apiToken).toBe("t2");
	});

	it("returns null when no token owns the host's zone", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(zoneList(["other.com"]))
			.mockResolvedValueOnce(zoneList(["different.net"]));
		vi.stubGlobal("fetch", fetchMock);

		const chosen = await selectIntegrationForHost(
			[integration("t1"), integration("t2")],
			"app.example.com",
		);

		expect(chosen).toBeNull();
	});

	it("fails closed: rethrows when a Cloudflare API call fails and nothing matched", async () => {
		// A transient API failure must NOT be swallowed into a null result, or a
		// require-protected policy would silently let an unprotected domain through.
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(apiFailure())
			.mockResolvedValueOnce(zoneList(["different.net"]));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			selectIntegrationForHost(
				[integration("t1"), integration("t2")],
				"app.example.com",
			),
		).rejects.toBeInstanceOf(CloudflareApiError);
	});

	it("fails closed on a network/transport failure (not just API errors)", async () => {
		// `fetch` rejecting (DNS/connection/abort) is not a CloudflareApiError, but
		// it still leaves ownership undetermined, so it must not collapse to null.
		const fetchMock = vi.fn().mockRejectedValue(new TypeError("network down"));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			selectIntegrationForHost([integration("t1")], "app.example.com"),
		).rejects.toBeInstanceOf(TypeError);
	});

	it("still returns a match even if another token's API call failed", async () => {
		// An error on one token must not prevent selecting a token that does own
		// the zone.
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(apiFailure())
			.mockResolvedValueOnce(zoneList(["example.com"]));
		vi.stubGlobal("fetch", fetchMock);

		const chosen = await selectIntegrationForHost(
			[integration("t1"), integration("t2")],
			"app.example.com",
		);

		expect(chosen?.apiToken).toBe("t2");
	});
});
