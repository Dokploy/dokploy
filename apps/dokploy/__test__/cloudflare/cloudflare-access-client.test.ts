import {
	buildAccessIncludeRules,
	createAccessApplication,
	createAccessPolicy,
} from "@dokploy/server/utils/providers/cloudflare";
import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("buildAccessIncludeRules", () => {
	it("maps emails and email domains to Cloudflare include rules", () => {
		const rules = buildAccessIncludeRules(
			["a@example.com", "b@example.com"],
			["example.org"],
		);
		expect(rules).toEqual([
			{ email: { email: "a@example.com" } },
			{ email: { email: "b@example.com" } },
			{ email_domain: { domain: "example.org" } },
		]);
	});

	it("returns an empty array when there are no allow rules", () => {
		expect(buildAccessIncludeRules([], [])).toEqual([]);
	});
});

describe("createAccessApplication", () => {
	it("posts a self_hosted application bound to the host", async () => {
		const fetchMock = stubFetch(
			fakeResponse(true, 200, {
				success: true,
				errors: [],
				messages: [],
				result: { id: "app-1", name: "app", domain: "app.example.com" },
			}),
		);
		const app = await createAccessApplication("token", "acct-1", {
			name: "app",
			domain: "app.example.com",
			sessionDuration: "24h",
		});
		expect(app.id).toBe("app-1");
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(
			"https://api.cloudflare.com/client/v4/accounts/acct-1/access/apps",
		);
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body as string)).toEqual({
			name: "app",
			type: "self_hosted",
			domain: "app.example.com",
			session_duration: "24h",
		});
	});

	it("defaults the session duration to 24h", async () => {
		const fetchMock = stubFetch(
			fakeResponse(true, 200, {
				success: true,
				errors: [],
				messages: [],
				result: { id: "app-1", name: "app", domain: "app.example.com" },
			}),
		);
		await createAccessApplication("token", "acct-1", {
			name: "app",
			domain: "app.example.com",
		});
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(JSON.parse(init.body as string).session_duration).toBe("24h");
	});
});

describe("createAccessPolicy", () => {
	it("posts an app-scoped allow policy with include rules", async () => {
		const fetchMock = stubFetch(
			fakeResponse(true, 200, {
				success: true,
				errors: [],
				messages: [],
				result: { id: "pol-1", name: "allow", decision: "allow" },
			}),
		);
		const include = buildAccessIncludeRules(["a@example.com"], ["example.org"]);
		const policy = await createAccessPolicy("token", "acct-1", "app-1", {
			name: "Dokploy allow policy",
			include,
		});
		expect(policy.id).toBe("pol-1");
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		// App-scoped endpoint, NOT the detached /access/policies endpoint.
		expect(url).toBe(
			"https://api.cloudflare.com/client/v4/accounts/acct-1/access/apps/app-1/policies",
		);
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body as string)).toEqual({
			name: "Dokploy allow policy",
			decision: "allow",
			include: [
				{ email: { email: "a@example.com" } },
				{ email_domain: { domain: "example.org" } },
			],
		});
	});
});
