import {
	CATCH_ALL_INGRESS_SERVICE,
	type CloudflareIngressRule,
	createTunnel,
	DOKPLOY_DNS_COMMENT,
	hasHostIngressRule,
	listZones,
	removeIngressRule,
	tunnelCnameTarget,
	upsertIngressRule,
	upsertTunnelDnsRecord,
} from "@dokploy/server/utils/providers/cloudflare";
import { afterEach, describe, expect, it, vi } from "vitest";

const TRAEFIK = "http://dokploy-traefik:80";

const fakeResponse = (ok: boolean, status: number, body: unknown) =>
	({ ok, status, json: async () => body }) as unknown as Response;

const stubFetch = (response: Response) => {
	const fetchMock = vi.fn().mockResolvedValue(response);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("hasHostIngressRule", () => {
	it("detects the per-host (no-path) rule the upsert would replace", () => {
		const rules: CloudflareIngressRule[] = [
			{ hostname: "app.example.com", service: TRAEFIK },
			{ service: CATCH_ALL_INGRESS_SERVICE },
		];
		expect(hasHostIngressRule(rules, "app.example.com")).toBe(true);
		expect(hasHostIngressRule(rules, "other.example.com")).toBe(false);
	});

	it("ignores path-scoped rules and an empty/undefined ingress list", () => {
		// A rule with a path is not the entry upsert replaces, so it doesn't count
		// as an existing per-host route for the no-clobber guard.
		const withPath: CloudflareIngressRule[] = [
			{ hostname: "app.example.com", path: "/api", service: TRAEFIK },
			{ service: CATCH_ALL_INGRESS_SERVICE },
		];
		expect(hasHostIngressRule(withPath, "app.example.com")).toBe(false);
		expect(hasHostIngressRule(undefined, "app.example.com")).toBe(false);
		expect(hasHostIngressRule([], "app.example.com")).toBe(false);
	});
});

describe("upsertIngressRule", () => {
	it("adds a per-host rule plus a 404 catch-all when starting empty", () => {
		const result = upsertIngressRule(undefined, "app.example.com", TRAEFIK);
		expect(result).toEqual([
			{ hostname: "app.example.com", service: TRAEFIK },
			{ service: CATCH_ALL_INGRESS_SERVICE },
		]);
	});

	it("preserves unknown host rules and keeps the catch-all last", () => {
		const existing: CloudflareIngressRule[] = [
			{ hostname: "other.example.com", service: "http://other:8080" },
			{ service: CATCH_ALL_INGRESS_SERVICE },
		];
		const result = upsertIngressRule(existing, "app.example.com", TRAEFIK);
		expect(result).toEqual([
			{ hostname: "other.example.com", service: "http://other:8080" },
			{ hostname: "app.example.com", service: TRAEFIK },
			{ service: CATCH_ALL_INGRESS_SERVICE },
		]);
		// catch-all must remain last
		expect(result.at(-1)?.hostname).toBeUndefined();
	});

	it("is idempotent — replaces our existing entry for the same host", () => {
		const existing: CloudflareIngressRule[] = [
			{ hostname: "app.example.com", service: "http://stale:1" },
			{ service: CATCH_ALL_INGRESS_SERVICE },
		];
		const result = upsertIngressRule(existing, "app.example.com", TRAEFIK);
		expect(result.filter((r) => r.hostname === "app.example.com")).toHaveLength(
			1,
		);
		expect(result).toEqual([
			{ hostname: "app.example.com", service: TRAEFIK },
			{ service: CATCH_ALL_INGRESS_SERVICE },
		]);
	});

	it("preserves a user-defined catch-all instead of forcing 404", () => {
		const existing: CloudflareIngressRule[] = [
			{ hostname: "other.example.com", service: "http://other:8080" },
			{ service: "http://fallback:9000" },
		];
		const result = upsertIngressRule(existing, "app.example.com", TRAEFIK);
		expect(result[result.length - 1]).toEqual({
			service: "http://fallback:9000",
		});
	});

	it("drops a non-terminal hostname-less rule that would swallow our host", () => {
		// A hostname-less rule matches every request, so it is only valid as the
		// trailing catch-all. If one appears mid-list it must not be preserved
		// ahead of our host rule (which it would otherwise shadow).
		const existing: CloudflareIngressRule[] = [
			{ service: "http://fallback:9000" },
			{ service: CATCH_ALL_INGRESS_SERVICE },
		];
		const result = upsertIngressRule(existing, "app.example.com", TRAEFIK);
		expect(result).toEqual([
			{ hostname: "app.example.com", service: TRAEFIK },
			{ service: CATCH_ALL_INGRESS_SERVICE },
		]);
	});
});

describe("listZones pagination", () => {
	const zonePage = (names: string[]) =>
		fakeResponse(true, 200, {
			success: true,
			errors: [],
			messages: [],
			result: names.map((name, i) => ({
				id: `z-${i}-${name}`,
				name,
				status: "active",
			})),
		});

	it("fetches every page until a short page is returned", async () => {
		// A full first page (50) forces a second request; the short second page
		// stops the loop. A zone beyond page 1 must still be returned.
		const page1 = Array.from({ length: 50 }, (_, i) => `z${i}.example.com`);
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(zonePage(page1))
			.mockResolvedValueOnce(zonePage(["target.com"]));
		vi.stubGlobal("fetch", fetchMock);

		const zones = await listZones("token");

		expect(zones).toHaveLength(51);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect((fetchMock.mock.calls[0] as [string])[0]).toContain("page=1");
		expect((fetchMock.mock.calls[1] as [string])[0]).toContain("page=2");
		expect(zones.at(-1)?.name).toBe("target.com");
	});

	it("stops after one request when the first page is short", async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(zonePage(["only.com"]));
		vi.stubGlobal("fetch", fetchMock);

		const zones = await listZones("token");

		expect(zones).toHaveLength(1);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

describe("removeIngressRule", () => {
	it("removes only our host rule and keeps unknown rules + catch-all", () => {
		const existing: CloudflareIngressRule[] = [
			{ hostname: "other.example.com", service: "http://other:8080" },
			{ hostname: "app.example.com", service: TRAEFIK },
			{ service: CATCH_ALL_INGRESS_SERVICE },
		];
		const result = removeIngressRule(existing, "app.example.com");
		expect(result).toEqual([
			{ hostname: "other.example.com", service: "http://other:8080" },
			{ service: CATCH_ALL_INGRESS_SERVICE },
		]);
	});
});

describe("createTunnel", () => {
	it("creates a remotely-managed tunnel (config_src: cloudflare)", async () => {
		const fetchMock = stubFetch(
			fakeResponse(true, 200, {
				success: true,
				errors: [],
				messages: [],
				result: { id: "tun-1", name: "dokploy", config_src: "cloudflare" },
			}),
		);
		const tunnel = await createTunnel("token", "acct-1", "dokploy");
		expect(tunnel.id).toBe("tun-1");
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(
			"https://api.cloudflare.com/client/v4/accounts/acct-1/cfd_tunnel",
		);
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body as string)).toEqual({
			name: "dokploy",
			config_src: "cloudflare",
		});
	});
});

describe("DNS ownership marker", () => {
	it("formats the tunnel CNAME target", () => {
		expect(tunnelCnameTarget("tun-1")).toBe("tun-1.cfargotunnel.com");
	});

	it("creates a proxied, Dokploy-tagged CNAME when none exists", async () => {
		const fetchMock = vi
			.fn()
			// findDnsRecordByName -> []
			.mockResolvedValueOnce(
				fakeResponse(true, 200, {
					success: true,
					errors: [],
					messages: [],
					result: [],
				}),
			)
			// create -> record
			.mockResolvedValueOnce(
				fakeResponse(true, 200, {
					success: true,
					errors: [],
					messages: [],
					result: { id: "rec-1", type: "CNAME", name: "app.example.com" },
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		await upsertTunnelDnsRecord("token", "zone-1", "app.example.com", "tun-1");

		const [, createInit] = fetchMock.mock.calls[1] as [string, RequestInit];
		expect(createInit.method).toBe("POST");
		const body = JSON.parse(createInit.body as string);
		expect(body).toMatchObject({
			type: "CNAME",
			name: "app.example.com",
			content: "tun-1.cfargotunnel.com",
			proxied: true,
			comment: DOKPLOY_DNS_COMMENT,
		});
	});

	it("refuses to overwrite a record not managed by Dokploy", async () => {
		stubFetch(
			fakeResponse(true, 200, {
				success: true,
				errors: [],
				messages: [],
				result: [
					{
						id: "rec-1",
						type: "CNAME",
						name: "app.example.com",
						content: "1.2.3.4",
						comment: "set by hand",
					},
				],
			}),
		);

		await expect(
			upsertTunnelDnsRecord("token", "zone-1", "app.example.com", "tun-1"),
		).rejects.toThrow(/not managed by Dokploy/i);
	});

	it("updates an existing Dokploy-managed record in place", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				fakeResponse(true, 200, {
					success: true,
					errors: [],
					messages: [],
					result: [
						{
							id: "rec-1",
							type: "CNAME",
							name: "app.example.com",
							content: "old.cfargotunnel.com",
							comment: DOKPLOY_DNS_COMMENT,
						},
					],
				}),
			)
			.mockResolvedValueOnce(
				fakeResponse(true, 200, {
					success: true,
					errors: [],
					messages: [],
					result: { id: "rec-1", type: "CNAME", name: "app.example.com" },
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		// Ownership proven by the stored record id (an idempotent re-run of our
		// own record) — the Dokploy comment alone is no longer enough to adopt.
		await upsertTunnelDnsRecord("token", "zone-1", "app.example.com", "tun-2", {
			expectedRecordId: "rec-1",
		});

		const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
		expect(url).toContain("/zones/zone-1/dns_records/rec-1");
		expect(init.method).toBe("PATCH");
		expect(JSON.parse(init.body as string).content).toBe(
			"tun-2.cfargotunnel.com",
		);
	});

	it("refuses a Dokploy-tagged record this instance does not track", async () => {
		stubFetch(
			fakeResponse(true, 200, {
				success: true,
				errors: [],
				messages: [],
				result: [
					{
						id: "rec-1",
						type: "CNAME",
						name: "app.example.com",
						content: "old.cfargotunnel.com",
						comment: DOKPLOY_DNS_COMMENT,
					},
				],
			}),
		);

		// Comment matches but no ownership facts are supplied (e.g. another
		// install's record sharing the same Cloudflare account) → refuse.
		await expect(
			upsertTunnelDnsRecord("token", "zone-1", "app.example.com", "tun-2"),
		).rejects.toThrow(/not tracked by this Dokploy instance/i);
	});

	it("adopts a Dokploy-tagged record when a sibling domain owns it", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				fakeResponse(true, 200, {
					success: true,
					errors: [],
					messages: [],
					result: [
						{
							id: "rec-1",
							type: "CNAME",
							name: "app.example.com",
							content: "old.cfargotunnel.com",
							comment: DOKPLOY_DNS_COMMENT,
						},
					],
				}),
			)
			.mockResolvedValueOnce(
				fakeResponse(true, 200, {
					success: true,
					errors: [],
					messages: [],
					result: { id: "rec-1", type: "CNAME", name: "app.example.com" },
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		await upsertTunnelDnsRecord("token", "zone-1", "app.example.com", "tun-2", {
			adoptable: true,
		});

		const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
		expect(url).toContain("/zones/zone-1/dns_records/rec-1");
		expect(init.method).toBe("PATCH");
	});
});
