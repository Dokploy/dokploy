import {
	CloudflareApiError,
	verifyToken,
} from "@dokploy/server/utils/providers/cloudflare";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Minimal stand-in for a `fetch` Response. The client only relies on `ok`,
 * `status` and `json()`.
 */
const fakeResponse = (ok: boolean, status: number, body: unknown) =>
	({
		ok,
		status,
		json: async () => body,
	}) as unknown as Response;

const stubFetch = (response: Response) => {
	const fetchMock = vi.fn().mockResolvedValue(response);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("verifyToken", () => {
	it("resolves and sends a bearer token to the verify endpoint", async () => {
		const fetchMock = stubFetch(
			fakeResponse(true, 200, {
				success: true,
				errors: [],
				messages: [],
				result: { id: "abc", status: "active" },
			}),
		);

		const result = await verifyToken("token-123");

		expect(result.status).toBe("active");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://api.cloudflare.com/client/v4/user/tokens/verify");
		expect((init.headers as Record<string, string>).Authorization).toBe(
			"Bearer token-123",
		);
	});

	it("throws a mapped CloudflareApiError when the token is invalid", async () => {
		stubFetch(
			fakeResponse(false, 401, {
				success: false,
				errors: [{ code: 1000, message: "Invalid API Token" }],
				messages: [],
				result: null,
			}),
		);

		await expect(verifyToken("bad-token")).rejects.toThrow("Invalid API Token");
		await expect(verifyToken("bad-token")).rejects.toBeInstanceOf(
			CloudflareApiError,
		);
	});

	it("throws when the token verifies but is not active", async () => {
		stubFetch(
			fakeResponse(true, 200, {
				success: true,
				errors: [],
				messages: [],
				result: { id: "abc", status: "disabled" },
			}),
		);

		await expect(verifyToken("token")).rejects.toThrow(/not active|disabled/i);
	});

	it("never leaks the API token in the error message", async () => {
		const secret = "super-secret-token-value";
		stubFetch(
			fakeResponse(false, 403, {
				success: false,
				errors: [
					{ code: 9109, message: "Unauthorized to access requested resource" },
				],
				messages: [],
				result: null,
			}),
		);

		await expect(verifyToken(secret)).rejects.toMatchObject({
			message: expect.not.stringContaining(secret),
		});
	});

	it("falls back to a generic message when the body has no errors", async () => {
		stubFetch(fakeResponse(false, 500, { success: false }));

		await expect(verifyToken("token")).rejects.toThrow(/HTTP 500/);
	});
});
