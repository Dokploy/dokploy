import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mutable mock functions so the vi.mock factories below can wire up
// determininistic responses that individual tests override per-case.
const mocks = vi.hoisted(() => ({
	findDomainById: vi.fn(),
	removeDomainById: vi.fn(),
	findApplicationById: vi.fn(),
	findPreviewDeploymentById: vi.fn(),
	removeDomain: vi.fn(),
	manageDomain: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	checkPermission: vi.fn(),
	audit: vi.fn(),
	validateRequest: vi.fn(),
	hasValidLicense: vi.fn(),
}));

// lib/auth runs betterAuth()/drizzleAdapter() at module load. Stub it so
// pulling in the tRPC plumbing never initializes better-auth against the
// globally-mocked db (see __test__/setup.ts).
vi.mock("@dokploy/server/lib/auth", () => ({
	auth: {},
	handler: vi.fn(),
	validateRequest: mocks.validateRequest,
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mocks.checkPermission,
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: mocks.audit,
}));

// Replace the @dokploy/server barrel with controllable stubs so the domain
// router's service calls are deterministic without DB/docker access, and so
// the tRPC context init never loads heavy modules via the barrel.
vi.mock("@dokploy/server", () => ({
	findDomainById: mocks.findDomainById,
	removeDomainById: mocks.removeDomainById,
	findApplicationById: mocks.findApplicationById,
	findPreviewDeploymentById: mocks.findPreviewDeploymentById,
	removeDomain: mocks.removeDomain,
	manageDomain: mocks.manageDomain,
	createDomain: vi.fn(),
	updateDomainById: vi.fn(),
	findDomainsByApplicationId: vi.fn(),
	findDomainsByComposeId: vi.fn(),
	findServerById: vi.fn(),
	generateTraefikMeDomain: vi.fn(),
	getServerIpCandidates: vi.fn(),
	getWebServerSettings: vi.fn(),
	validateDomain: vi.fn(),
	hasValidLicense: mocks.hasValidLicense,
}));

import { domainRouter } from "@/server/api/routers/domain";

const ctx = {
	session: { activeOrganizationId: "org-1", userId: "user-1" },
	user: {
		id: "user-1",
		email: "u@example.com",
		role: "owner",
		ownerId: "org-1",
	},
	db: {},
	req: {},
	res: {},
} as any;

beforeEach(() => {
	vi.clearAllMocks();
	mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
	mocks.checkPermission.mockResolvedValue(undefined);
	mocks.removeDomainById.mockResolvedValue({ domainId: "" });
	mocks.audit.mockResolvedValue(undefined);
	mocks.validateRequest.mockResolvedValue({ session: null, user: null });
	mocks.hasValidLicense.mockResolvedValue(false);
});

describe("domainRouter.delete — Traefik cleanup", () => {
	it("removes the preview router from preview-*.yml on delete (regression: the router was orphaned)", async () => {
		const previewDomain = {
			domainId: "dom-preview",
			host: "preview-parent.example.com",
			applicationId: null,
			composeId: null,
			previewDeploymentId: "pd-1",
			uniqueConfigKey: 42,
			domainType: "preview",
			enabled: true,
		};
		const previewDeployment = {
			previewDeploymentId: "pd-1",
			applicationId: "app-1",
			appName: "preview-parent-ab12cd",
		};
		const parentApplication = {
			applicationId: "app-1",
			appName: "parent",
			serverId: null,
		};

		mocks.findDomainById.mockResolvedValue(previewDomain);
		mocks.findPreviewDeploymentById.mockResolvedValue(previewDeployment);
		mocks.findApplicationById.mockResolvedValue(parentApplication);

		const caller = domainRouter.createCaller(ctx);
		await caller.delete({ domainId: "dom-preview" });

		// The DB row is deleted regardless of the bug.
		expect(mocks.removeDomainById).toHaveBeenCalledOnce();
		expect(mocks.removeDomainById).toHaveBeenCalledWith("dom-preview");

		// BUG FIX: a preview domain has applicationId=null, so before the fix the
		// `if (domain.applicationId)` guard skipped removeDomain entirely and the
		// router kept serving traffic. The fix must invoke removeDomain.
		expect(mocks.removeDomain).toHaveBeenCalledOnce();
		const [applicationArg, uniqueKeyArg] =
			mocks.removeDomain.mock.calls[0] ?? [];
		expect(uniqueKeyArg).toBe(42);
		// removeDomain must target the preview's config file: the handler mutates
		// appName to the preview appName (preview-*.yml), not the parent's
		// (parent.yml). Without the mutation, the wrong file would be touched.
		expect(applicationArg.appName).toBe("preview-parent-ab12cd");
		expect(applicationArg.applicationId).toBe("app-1");

		// Authorization and cleanup each resolve the preview deployment.
		expect(mocks.findPreviewDeploymentById).toHaveBeenCalledTimes(2);
		expect(mocks.findPreviewDeploymentById).toHaveBeenCalledWith("pd-1");

		// Application domains are never looked up on the preview path.
		expect(mocks.findApplicationById).toHaveBeenCalledOnce();
		expect(mocks.findApplicationById).toHaveBeenCalledWith("app-1");
	});

	it("still removes the router for application domains (no regression)", async () => {
		const appDomain = {
			domainId: "dom-app",
			host: "app.example.com",
			applicationId: "app-2",
			composeId: null,
			previewDeploymentId: null,
			uniqueConfigKey: 7,
			domainType: "application",
			enabled: true,
		};
		mocks.findDomainById.mockResolvedValue(appDomain);
		mocks.findApplicationById.mockResolvedValue({
			applicationId: "app-2",
			appName: "myapp",
			serverId: null,
		});

		const caller = domainRouter.createCaller(ctx);
		await caller.delete({ domainId: "dom-app" });

		expect(mocks.removeDomainById).toHaveBeenCalledWith("dom-app");
		expect(mocks.removeDomain).toHaveBeenCalledOnce();
		const [applicationArg, uniqueKeyArg] =
			mocks.removeDomain.mock.calls[0] ?? [];
		// Application path uses the application's own appName (no mutation).
		expect(applicationArg.appName).toBe("myapp");
		expect(uniqueKeyArg).toBe(7);
		// Application path never resolves a preview deployment.
		expect(mocks.findPreviewDeploymentById).not.toHaveBeenCalled();
	});

	it("does not call file-provider cleanup for compose domains (no regression)", async () => {
		const composeDomain = {
			domainId: "dom-compose",
			host: "compose.example.com",
			applicationId: null,
			composeId: "comp-1",
			previewDeploymentId: null,
			uniqueConfigKey: 99,
			domainType: "compose",
			enabled: true,
		};
		mocks.findDomainById.mockResolvedValue(composeDomain);

		const caller = domainRouter.createCaller(ctx);
		await caller.delete({ domainId: "dom-compose" });

		expect(mocks.removeDomainById).toHaveBeenCalledWith("dom-compose");
		// Compose domains are published via docker labels, not the file provider,
		// so delete must not touch removeDomain. The fix's preview branch must not
		// widen to compose domains.
		expect(mocks.removeDomain).not.toHaveBeenCalled();
		expect(mocks.findPreviewDeploymentById).not.toHaveBeenCalled();
		expect(mocks.findApplicationById).not.toHaveBeenCalled();
	});
});
