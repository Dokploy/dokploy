import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildIngress,
	CloudflareApiError,
	createDnsRecord,
	createTunnel,
	deleteDnsRecord,
	deleteTunnel,
	getTunnel,
	listDnsRecords,
	listZones,
	updateIngress,
	verifyToken,
} from "@dokploy/server/services/cloudflare";

const TOKEN = "cf-test-token";
const ACCOUNT = "acc-123";
const ZONE = "zone-abc";

const okResponse = (result: unknown, init?: { status?: number }) =>
	new Response(
		JSON.stringify({
			success: true,
			errors: [],
			messages: [],
			result,
		}),
		{
			status: init?.status ?? 200,
			headers: { "Content-Type": "application/json" },
		},
	);

const errResponse = (
	status: number,
	errors: Array<{ code: number; message: string }>,
	headers?: Record<string, string>,
) =>
	new Response(
		JSON.stringify({ success: false, errors, messages: [], result: null }),
		{
			status,
			headers: { "Content-Type": "application/json", ...(headers ?? {}) },
		},
	);

describe("cloudflare service", () => {
	let fetchMock: ReturnType<typeof vi.fn>;
	const realFetch = globalThis.fetch;

	beforeEach(() => {
		fetchMock = vi.fn();
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});

	afterEach(() => {
		globalThis.fetch = realFetch;
		vi.useRealTimers();
	});

	describe("verifyToken", () => {
		it("returns ok=true with active status", async () => {
			fetchMock
				.mockResolvedValueOnce(
					okResponse({ id: "t1", status: "active", expires_on: null }),
				)
				.mockResolvedValueOnce(okResponse([{ id: ACCOUNT, name: "acme" }]));

			const result = await verifyToken(TOKEN);
			expect(result.ok).toBe(true);
			expect(result.status).toBe("active");
			expect(result.accountId).toBe(ACCOUNT);
		});

		it("returns ok=false on 401 without throwing", async () => {
			fetchMock.mockResolvedValueOnce(
				errResponse(401, [{ code: 1000, message: "Invalid token" }]),
			);

			const result = await verifyToken(TOKEN);
			expect(result.ok).toBe(false);
			expect(result.status).toBe("invalid");
		});
	});

	describe("listZones", () => {
		it("paginates through result_info", async () => {
			const z1 = {
				id: "z1",
				name: "a.com",
				status: "active",
				account: { id: ACCOUNT, name: "acme" },
			};
			const z2 = {
				id: "z2",
				name: "b.com",
				status: "active",
				account: { id: ACCOUNT, name: "acme" },
			};
			fetchMock
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({
							success: true,
							errors: [],
							messages: [],
							result: [z1],
							result_info: {
								page: 1,
								per_page: 50,
								total_pages: 2,
								count: 1,
								total_count: 2,
							},
						}),
						{ status: 200 },
					),
				)
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({
							success: true,
							errors: [],
							messages: [],
							result: [z2],
							result_info: {
								page: 2,
								per_page: 50,
								total_pages: 2,
								count: 1,
								total_count: 2,
							},
						}),
						{ status: 200 },
					),
				);

			const zones = await listZones(TOKEN);
			expect(zones).toHaveLength(2);
			expect(zones[0]?.id).toBe("z1");
			expect(zones[1]?.id).toBe("z2");
			expect(fetchMock).toHaveBeenCalledTimes(2);
		});
	});

	describe("createTunnel", () => {
		it("posts config_src=cloudflare and returns id+token", async () => {
			fetchMock.mockResolvedValueOnce(
				okResponse({ id: "tun-1", token: "tun-token-1" }),
			);

			const r = await createTunnel(TOKEN, ACCOUNT, "my-tunnel");
			expect(r).toEqual({ id: "tun-1", token: "tun-token-1" });
			const [, init] = fetchMock.mock.calls[0]!;
			const body = JSON.parse(init.body as string);
			expect(body.name).toBe("my-tunnel");
			expect(body.config_src).toBe("cloudflare");
			expect(typeof body.tunnel_secret).toBe("string");
			expect(body.tunnel_secret.length).toBeGreaterThan(0);
		});

		it("fetches token separately if not in create response", async () => {
			fetchMock
				.mockResolvedValueOnce(okResponse({ id: "tun-1" }))
				.mockResolvedValueOnce(okResponse("tun-token-1"));

			const r = await createTunnel(TOKEN, ACCOUNT, "my-tunnel");
			expect(r.id).toBe("tun-1");
			expect(r.token).toBe("tun-token-1");
		});
	});

	describe("getTunnel / deleteTunnel", () => {
		it("getTunnel returns connections count from connections array", async () => {
			fetchMock.mockResolvedValueOnce(
				okResponse({
					id: "tun-1",
					status: "healthy",
					connections: [{}, {}],
				}),
			);

			const r = await getTunnel(TOKEN, ACCOUNT, "tun-1");
			expect(r.connections).toBe(2);
			expect(r.status).toBe("healthy");
		});

		it("deleteTunnel issues DELETE", async () => {
			fetchMock.mockResolvedValueOnce(okResponse(null));
			await deleteTunnel(TOKEN, ACCOUNT, "tun-1");
			const [url, init] = fetchMock.mock.calls[0]!;
			expect(init.method).toBe("DELETE");
			expect(url).toContain(`/accounts/${ACCOUNT}/cfd_tunnel/tun-1`);
		});
	});

	describe("updateIngress", () => {
		it("PUTs body shape { config: { ingress } }", async () => {
			fetchMock.mockResolvedValueOnce(okResponse(null));
			const ingress = buildIngress({
				hostnames: [{ hostname: "app.example.com", service: "http://localhost:80" }],
			});
			await updateIngress(TOKEN, ACCOUNT, "tun-1", ingress);
			const [, init] = fetchMock.mock.calls[0]!;
			expect(init.method).toBe("PUT");
			const body = JSON.parse(init.body as string);
			expect(body.config.ingress).toEqual(ingress);
		});
	});

	describe("DNS records", () => {
		it("listDnsRecords filters by name + type", async () => {
			fetchMock.mockResolvedValueOnce(okResponse([]));
			await listDnsRecords(TOKEN, ZONE, {
				name: "x.example.com",
				type: "CNAME",
			});
			const [url] = fetchMock.mock.calls[0]!;
			expect(url).toContain("name=x.example.com");
			expect(url).toContain("type=CNAME");
		});

		it("createDnsRecord defaults to CNAME proxied", async () => {
			fetchMock.mockResolvedValueOnce(
				okResponse({
					id: "rec-1",
					zone_id: ZONE,
					zone_name: "example.com",
					name: "x.example.com",
					type: "CNAME",
					content: "tun-1.cfargotunnel.com",
					proxied: true,
					ttl: 1,
					comment: "Managed by Dokploy",
				}),
			);
			const r = await createDnsRecord(TOKEN, ZONE, {
				name: "x.example.com",
				content: "tun-1.cfargotunnel.com",
			});
			expect(r.id).toBe("rec-1");
			const [, init] = fetchMock.mock.calls[0]!;
			const body = JSON.parse(init.body as string);
			expect(body.type).toBe("CNAME");
			expect(body.proxied).toBe(true);
		});

		it("deleteDnsRecord issues DELETE", async () => {
			fetchMock.mockResolvedValueOnce(okResponse(null));
			await deleteDnsRecord(TOKEN, ZONE, "rec-1");
			const [url, init] = fetchMock.mock.calls[0]!;
			expect(init.method).toBe("DELETE");
			expect(url).toContain(`/zones/${ZONE}/dns_records/rec-1`);
		});
	});

	describe("retry logic", () => {
		it("retries on 429 honoring Retry-After then succeeds", async () => {
			fetchMock
				.mockResolvedValueOnce(
					errResponse(429, [{ code: 10013, message: "Rate limited" }], {
						"Retry-After": "1",
					}),
				)
				.mockResolvedValueOnce(okResponse([]));

			const promise = listZones(TOKEN);
			await vi.advanceTimersByTimeAsync(1100);
			const zones = await promise;
			expect(zones).toEqual([]);
			expect(fetchMock).toHaveBeenCalledTimes(2);
		});

		it("does not retry on 401", async () => {
			fetchMock.mockResolvedValueOnce(
				errResponse(401, [{ code: 1000, message: "Invalid token" }]),
			);
			await expect(listZones(TOKEN)).rejects.toBeInstanceOf(CloudflareApiError);
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it("retries on 5xx with exponential backoff then throws after MAX_RETRIES", async () => {
			fetchMock.mockResolvedValue(
				errResponse(503, [{ code: 0, message: "Service unavailable" }]),
			);
			const promise = listZones(TOKEN).catch((e) => e);
			// Advance past all backoff windows: 500 + 1000 + 2000 = 3500ms
			await vi.advanceTimersByTimeAsync(10_000);
			const err = await promise;
			expect(err).toBeInstanceOf(CloudflareApiError);
			expect((err as CloudflareApiError).status).toBe(503);
			expect((err as CloudflareApiError).retryable).toBe(true);
			// initial + 3 retries
			expect(fetchMock).toHaveBeenCalledTimes(4);
		});
	});

	describe("buildIngress", () => {
		it("emits one rule per hostname in order plus terminating http_status:404", () => {
			const rules = buildIngress({
				hostnames: [
					{ hostname: "a.example.com", service: "http://localhost:80" },
					{ hostname: "b.example.com", service: "http://localhost:80" },
				],
			});
			expect(rules).toHaveLength(3);
			expect(rules[0]).toEqual({
				hostname: "a.example.com",
				service: "http://localhost:80",
			});
			expect(rules[1]).toEqual({
				hostname: "b.example.com",
				service: "http://localhost:80",
			});
			expect(rules[2]).toEqual({ service: "http_status:404" });
		});

		it("preserves path when provided", () => {
			const rules = buildIngress({
				hostnames: [
					{
						hostname: "a.example.com",
						service: "http://localhost:80",
						path: "/api",
					},
				],
			});
			expect(rules[0]).toEqual({
				hostname: "a.example.com",
				path: "/api",
				service: "http://localhost:80",
			});
		});

		it("returns just the terminator for empty input", () => {
			const rules = buildIngress({ hostnames: [] });
			expect(rules).toEqual([{ service: "http_status:404" }]);
		});
	});
});
