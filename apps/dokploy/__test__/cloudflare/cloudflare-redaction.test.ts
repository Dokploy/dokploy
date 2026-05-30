import { describe, expect, it, vi } from "vitest";

/**
 * The stored Cloudflare API token must never be returned to the client. These
 * tests stub the service layer to return a row that still contains the token
 * and assert the router strips it before responding.
 */
const SECRET = "cf-secret-token-value";

const fullRow = {
	cloudflareId: "cf-1",
	name: "production",
	apiToken: SECRET,
	accountId: "acct-1",
	defaultTunnelId: null,
	organizationId: "org-1",
	createdAt: new Date(),
};

vi.mock("@dokploy/server", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@dokploy/server")>();
	return {
		...actual,
		createCloudflare: vi.fn(async () => fullRow),
		findCloudflareById: vi.fn(async () => fullRow),
	};
});

const { cloudflareRouter } = await import("@/server/api/routers/cloudflare");
const { createCallerFactory } = await import("@/server/api/trpc");

const createCaller = createCallerFactory(cloudflareRouter);
const caller = createCaller({
	user: { id: "user-1", email: "owner@test.com", role: "owner" },
	session: { activeOrganizationId: "org-1" },
	req: {} as unknown,
	res: {} as unknown,
} as never);

describe("cloudflare token redaction", () => {
	it("does not return the API token from create", async () => {
		const result = await caller.create({
			name: "production",
			apiToken: SECRET,
			accountId: "acct-1",
		});
		expect(result).not.toHaveProperty("apiToken");
		expect(JSON.stringify(result)).not.toContain(SECRET);
	});

	it("does not return the API token from one", async () => {
		const result = await caller.one({ cloudflareId: "cf-1" });
		expect(result).not.toHaveProperty("apiToken");
		expect(JSON.stringify(result)).not.toContain(SECRET);
	});
});
