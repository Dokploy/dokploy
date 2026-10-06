import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * DoDomain refuses to register (and dead-letters deliveries to) webhook URLs
 * that resolve to non-public hosts. These tests cover the host heuristic used
 * for the early warning, the parser of the refusal, and the registration flow:
 * a refused URL still saves the integration (without an endpoint) and returns
 * a readable warning instead of an error.
 */

const mocks = vi.hoisted(() => ({
	inserted: [] as Record<string, unknown>[],
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: new Proxy({} as Record<string, unknown>, {
			get: () => ({
				findFirst: vi.fn(async () => undefined),
				findMany: vi.fn(async () => []),
			}),
		}),
		insert: vi.fn(() => ({
			values: (row: Record<string, unknown>) => {
				mocks.inserted.push(row);
				return { returning: async () => [row] };
			},
		})),
		update: vi.fn(),
		delete: vi.fn(),
		execute: vi.fn(async () => []),
	},
	dbUrl: "postgres://mock:mock@localhost:5432/mock",
}));

const {
	dodomainWebhookWarning,
	isLikelyPrivateWebhookHost,
	parseDoDomainWebhookRefusal,
} = await import("@dokploy/server/utils/dodomain/webhook-reachability");
const { createDoDomain } = await import("@dokploy/server/services/dodomain");

describe("isLikelyPrivateWebhookHost", () => {
	it.each([
		"localhost",
		"LOCALHOST",
		"app.localhost",
		"nas.local",
		"db.internal",
		"panel.tail1234.ts.net",
		"panel.tail1234.ts.net.",
		"https://panel.tail1234.ts.net/api/webhooks/dodomain?integration=x",
		"panel.tail1234.ts.net:3000",
		"printer.lan",
		"router.home.arpa",
		"dokploy",
		"10.0.0.5",
		"10.255.255.255",
		"172.16.0.1",
		"172.31.255.255",
		"192.168.1.20",
		"http://192.168.1.20:3000/x",
		"127.0.0.1",
		"127.8.8.8",
		"100.64.0.1",
		"100.127.255.254",
		"169.254.169.254",
		"0.0.0.0",
		"[::1]",
		"::1",
		"[::1]:3000",
		"http://[::1]:3000/",
		"fd00::1",
		"fc00::1234",
		"fdab:cdef::1",
		"fe80::1",
		"febf::1",
		"::ffff:10.0.0.1",
		"[::ffff:192.168.0.1]",
	])("flags %s as private", (host) => {
		expect(isLikelyPrivateWebhookHost(host)).toBe(true);
	});

	it.each([
		"",
		"   ",
		"dokploy.devino.ca",
		"https://dokploy-community.devino.ca/api/webhooks/dodomain",
		"panel.example.com:8443",
		"example.ts.net.evil.com",
		"notlocal.com",
		"localhost.example.com",
		"8.8.8.8",
		"172.15.255.255",
		"172.32.0.1",
		"100.63.255.255",
		"100.128.0.1",
		"169.253.1.1",
		"11.0.0.1",
		"192.169.0.1",
		"2606:4700:4700::1111",
		"[2001:db8::1]",
		"fe00::1",
		"fec0::1",
		"::ffff:8.8.8.8",
	])("treats %s as public", (host) => {
		expect(isLikelyPrivateWebhookHost(host)).toBe(false);
	});
});

describe("parseDoDomainWebhookRefusal", () => {
	const refusal = (reason: unknown, message = "anything") => ({
		status: 400,
		body: {
			error: "invalid_request",
			message,
			details: { reason },
		},
	});

	it("reads webhook_url_resolves_private", () => {
		expect(
			parseDoDomainWebhookRefusal(refusal("webhook_url_resolves_private")),
		).toBe("webhook_url_resolves_private");
	});

	it("does not treat webhook_url_unresolvable as a refusal", () => {
		expect(
			parseDoDomainWebhookRefusal(refusal("webhook_url_unresolvable")),
		).toBeNull();
	});

	it("matches on error + details.reason only, never on the message", () => {
		// A reworded message does not matter...
		expect(
			parseDoDomainWebhookRefusal(
				refusal("webhook_url_resolves_private", "Totally different words"),
			),
		).toBe("webhook_url_resolves_private");
		// ...and a message that sounds like a refusal does not make one.
		expect(
			parseDoDomainWebhookRefusal({
				status: 400,
				body: {
					error: "invalid_request",
					message: "webhook_url_resolves_private: URL resolves to a private IP",
				},
			}),
		).toBeNull();
		expect(
			parseDoDomainWebhookRefusal({
				status: 400,
				body: {
					error: "invalid_request",
					message: "bad",
					details: {},
				},
			}),
		).toBeNull();
	});

	it("ignores other reasons, other errors and other statuses", () => {
		expect(parseDoDomainWebhookRefusal(refusal("something_else"))).toBeNull();
		expect(parseDoDomainWebhookRefusal(refusal(undefined))).toBeNull();
		expect(
			parseDoDomainWebhookRefusal({
				status: 400,
				body: {
					error: "other_error",
					details: { reason: "webhook_url_resolves_private" },
				},
			}),
		).toBeNull();
		expect(
			parseDoDomainWebhookRefusal({
				status: 422,
				body: {
					error: "invalid_request",
					details: { reason: "webhook_url_resolves_private" },
				},
			}),
		).toBeNull();
		expect(parseDoDomainWebhookRefusal({ status: 400, body: null })).toBeNull();
		expect(
			parseDoDomainWebhookRefusal({ status: 400, body: "invalid_request" }),
		).toBeNull();
		expect(parseDoDomainWebhookRefusal({ status: 400 })).toBeNull();
	});
});

describe("dodomainWebhookWarning", () => {
	it("names the host and the Re-verify DNS fallback", () => {
		const text = dodomainWebhookWarning("panel.tail1234.ts.net");
		expect(text).toBe(
			"DoDomain can't reach panel.tail1234.ts.net, so domain-status webhooks won't arrive. DNS status still updates when you press Re-verify DNS. Serve the panel on a public HTTPS URL to receive webhooks.",
		);
	});
});

describe("createDoDomain when DoDomain refuses the webhook URL", () => {
	const originalAuthUrl = process.env.BETTER_AUTH_URL;
	let calls: { url: string; method: string }[] = [];
	let handler: (url: string, method: string) => Response;

	const json = (status: number, body: unknown) =>
		new Response(JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json" },
		});

	const input = {
		name: "DoDomain",
		secretKey: "dd_sk_test_key",
		appId: "app_1",
		baseUrl: "https://dodomain.test",
	};

	beforeEach(() => {
		mocks.inserted = [];
		calls = [];
		process.env.BETTER_AUTH_URL = "https://panel.tail1234.ts.net";
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init: { method: string }) => {
				calls.push({ url, method: init.method });
				return handler(url, init.method);
			}),
		);
	});

	afterAll(() => {
		if (originalAuthUrl === undefined) {
			Reflect.deleteProperty(process.env, "BETTER_AUTH_URL");
		} else {
			process.env.BETTER_AUTH_URL = originalAuthUrl;
		}
		vi.unstubAllGlobals();
	});

	it("saves the integration without an endpoint and returns the warning", async () => {
		handler = () =>
			json(400, {
				error: "invalid_request",
				message: "Webhook URL must resolve to a public address",
				details: { reason: "webhook_url_resolves_private" },
			});

		const result = await createDoDomain(input, "org-1");

		expect(result.webhookWarning).toBe(
			dodomainWebhookWarning("panel.tail1234.ts.net"),
		);
		expect(result.integration).toMatchObject({
			organizationId: "org-1",
			appId: "app_1",
			webhookEndpointId: null,
			webhookUrl: null,
			webhookSecret: null,
		});
		expect(mocks.inserted).toHaveLength(1);
		// Only the registration attempt: no list/rotate recovery, no delete.
		expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
			"POST /api/v1/webhook-endpoints",
		]);
	});

	it("keeps another invalid_request as an error carrying DoDomain's message", async () => {
		handler = (url, method) =>
			method === "GET"
				? json(200, { endpoints: [] })
				: json(400, {
						error: "invalid_request",
						message: "Webhook URL must use https",
					});

		await expect(createDoDomain(input, "org-1")).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "DoDomain: Webhook URL must use https",
		});
		expect(mocks.inserted).toHaveLength(0);
	});

	it("surfaces DoDomain's message for an invalid_request with reason webhook_url_unresolvable", async () => {
		handler = (url, method) =>
			method === "GET"
				? json(200, { endpoints: [] })
				: json(400, {
						error: "invalid_request",
						message: "Webhook URL could not be resolved",
						details: { reason: "webhook_url_unresolvable" },
					});

		await expect(createDoDomain(input, "org-1")).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "DoDomain: Webhook URL could not be resolved",
		});
		expect(mocks.inserted).toHaveLength(0);
	});

	it("registers normally when DoDomain accepts the URL", async () => {
		handler = () =>
			json(200, {
				id: "we_1",
				appId: "app_1",
				url: "https://panel.tail1234.ts.net/api/webhooks/dodomain?integration=x",
				createdAt: new Date().toISOString(),
				secret: "whsec_new",
			});

		const result = await createDoDomain(input, "org-1");

		expect(result.webhookWarning).toBeNull();
		expect(result.integration).toMatchObject({
			webhookEndpointId: "we_1",
			webhookSecret: "whsec_new",
		});
	});
});

describe("DoDomain card Webhook row", () => {
	const source = fs.readFileSync(
		path.resolve(
			__dirname,
			"../../components/dashboard/settings/integrations/dodomain/show-dodomain.tsx",
		),
		"utf8",
	);

	it("only shows the green check when registered and not likely private", () => {
		const row = source.slice(source.indexOf("Webhook</dt>"));
		const unregistered = row.indexOf("!integration.webhookRegistered");
		const warning = row.indexOf("webhookReachability.likelyPrivate");
		const check = row.indexOf("<CheckCircle2");
		expect(unregistered).toBeGreaterThan(-1);
		expect(warning).toBeGreaterThan(unregistered);
		expect(check).toBeGreaterThan(warning);
		expect(row).toContain("<AlertTriangle");
		expect(row).toContain("DoDomain can&apos;t reach this address");
	});
});
