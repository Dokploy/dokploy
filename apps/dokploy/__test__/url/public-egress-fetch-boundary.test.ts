import {
	fetchWithPublicEgress,
	isBlockedCloudHost,
} from "@dokploy/server/utils/url/network";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("public egress fetch boundary", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("blocks IPv6 link-local and deprecated site-local ranges", () => {
		for (const hostname of ["fe80::1", "fe90::1", "fea0::1", "febf::1"]) {
			expect(isBlockedCloudHost(hostname)).toBe(true);
		}

		for (const hostname of ["fec0::1", "fed0::1", "feff::1"]) {
			expect(isBlockedCloudHost(hostname)).toBe(true);
		}
	});

	it("rejects public-looking hosts that resolve to private addresses before fetch", async () => {
		const fetchMock = vi.fn(async () => {
			return new Response("ok");
		});
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			fetchWithPublicEgress(
				"https://api.example.com/models",
				{ redirect: "error" },
				{
					allowPrivateNetwork: false,
					fieldName: "AI provider URL",
					lookup: async () => [{ address: "10.0.0.10", family: 4 }],
				},
			),
		).rejects.toThrow(/AI provider URL/i);

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("pins public fetches to a validated DNS lookup dispatcher", async () => {
		const fetchMock = vi.fn(async () => {
			return new Response(JSON.stringify({ ok: true }), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWithPublicEgress(
			"https://api.example.com/models",
			{ redirect: "error" },
			{
				allowPrivateNetwork: false,
				fieldName: "AI provider URL",
				lookup: async () => [{ address: "8.8.8.8", family: 4 }],
			},
		);

		await expect(response.json()).resolves.toEqual({ ok: true });
		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.example.com/models",
			expect.objectContaining({
				dispatcher: expect.any(Object),
				redirect: "error",
			}),
		);
	});

	it("passes Request inputs through with the pinned dispatcher", async () => {
		const fetchMock = vi.fn(async () => {
			return new Response(null, { status: 204 });
		});
		vi.stubGlobal("fetch", fetchMock);
		const request = new Request("https://api.example.com/models", {
			method: "POST",
			body: JSON.stringify({ model: "test" }),
			headers: { "Content-Type": "application/json" },
		});

		const response = await fetchWithPublicEgress(
			request,
			{},
			{
				allowPrivateNetwork: false,
				fieldName: "AI provider URL",
				lookup: async () => [{ address: "8.8.8.8", family: 4 }],
			},
		);

		expect(response.status).toBe(204);
		expect(fetchMock).toHaveBeenCalledWith(
			request,
			expect.objectContaining({
				dispatcher: expect.any(Object),
			}),
		);
	});
});
