import { describe, expect, it, vi } from "vitest";

/**
 * Publishing a domain via Cloudflare triggers org-wide DNS/Tunnel changes, so it
 * must require an owner/admin even when the caller holds service-level
 * `domain:create`. These tests isolate that gate by stubbing the service-access
 * check (so a member passes it) and asserting the Cloudflare admin gate still
 * blocks the member.
 */
vi.mock("@dokploy/server/services/permission", async (importOriginal) => ({
	...(await importOriginal<object>()),
	checkServicePermissionAndAccess: vi.fn(() => Promise.resolve()),
}));

vi.mock("@dokploy/server", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@dokploy/server")>();
	return {
		...actual,
		createDomain: vi.fn(async (input: { host: string }) => ({
			domainId: "dom-1",
			host: input.host,
			applicationId: "app-1",
		})),
		findDomainById: vi.fn(async () => ({
			domainId: "dom-1",
			host: "app.example.com",
			applicationId: "app-1",
			composeId: null,
			previewDeploymentId: null,
			publishToCloudflare: false,
		})),
		provisionCloudflareForDomain: vi.fn(async () => {}),
		isCloudflarePublished: vi.fn(() => false),
		findCloudflareById: vi.fn(async () => ({
			cloudflareId: "cf-1",
			organizationId: "org-1",
			name: "prod",
			apiToken: "secret",
			accountId: "acct-1",
		})),
	};
});

const { domainRouter } = await import("@/server/api/routers/domain");
const { createCallerFactory } = await import("@/server/api/trpc");
const { findCloudflareById } = await import("@dokploy/server");

const createCaller = createCallerFactory(domainRouter);

const ctxFor = (role: "owner" | "admin" | "member") =>
	({
		user: { id: "user-1", email: "user@test.com", role },
		session: { activeOrganizationId: "org-1" },
		req: {} as unknown,
		res: {} as unknown,
	}) as never;

const publishInput = {
	host: "app.example.com",
	domainType: "application" as const,
	applicationId: "app-1",
	publishToCloudflare: true,
	cloudflareId: "cf-1",
	cloudflareTunnelMode: "shared-managed" as const,
};

describe("domain.create Cloudflare publish gate", () => {
	it("rejects a member trying to publish via Cloudflare", async () => {
		const caller = createCaller(ctxFor("member"));
		await expect(caller.create(publishInput)).rejects.toThrow(
			/owners or admins can publish/i,
		);
	});

	it("allows an admin to publish via Cloudflare", async () => {
		const caller = createCaller(ctxFor("admin"));
		await expect(caller.create(publishInput)).resolves.toBeDefined();
	});

	it("rejects publishing with an integration from another organization", async () => {
		vi.mocked(findCloudflareById).mockResolvedValueOnce({
			cloudflareId: "cf-1",
			organizationId: "other-org",
			name: "prod",
			apiToken: "secret",
			accountId: "acct-1",
		} as Awaited<ReturnType<typeof findCloudflareById>>);
		const caller = createCaller(ctxFor("admin"));
		await expect(caller.create(publishInput)).rejects.toThrow(
			/not found in this organization/i,
		);
	});
});

describe("domain.update Cloudflare publish gate", () => {
	it("rejects a member turning on Cloudflare publishing", async () => {
		const caller = createCaller(ctxFor("member"));
		await expect(
			caller.update({ domainId: "dom-1", ...publishInput }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});
