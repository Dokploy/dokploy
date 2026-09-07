import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The router imports its service helpers from the `@dokploy/server` barrel.
// Stub the barrel (without importOriginal) so loading the router never pulls
// in the full server barrel (better-auth, docker, k8s, etc.); we only need to
// control the three helpers the `update` handler touches and provide
// `hasValidLicense` for `@/server/api/trpc`'s barrel import.
const mockFindBitbucketById = vi.hoisted(() => vi.fn());
const mockUpdateBitbucket = vi.hoisted(() => vi.fn());
const mockAssertGitProviderAccess = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server", () => ({
	assertGitProviderAccess: mockAssertGitProviderAccess,
	canViewGitProviderSecrets: vi.fn(),
	createBitbucket: vi.fn(),
	findBitbucketById: mockFindBitbucketById,
	getAccessibleGitProviderIds: vi.fn(),
	getBitbucketBranches: vi.fn(),
	getBitbucketRepositories: vi.fn(),
	testBitbucketConnection: vi.fn(),
	updateBitbucket: mockUpdateBitbucket,
	hasValidLicense: vi.fn().mockResolvedValue(true),
}));

// `withPermission` calls `checkPermission`; bypass it so the test isolates the
// handler's own access gate (assertGitProviderAccess) rather than the permission
// middleware, which is exercised separately.
vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: vi.fn().mockResolvedValue(undefined),
}));

// Loading `@/server/api/trpc` imports `validateRequest` from the auth module,
// which would otherwise bootstrap better-auth. Stub it; it is never called by
// createCaller (we supply the context directly).
vi.mock("@dokploy/server/lib/auth", () => ({ validateRequest: vi.fn() }));

// The handler writes an audit record; stub it so no audit-log DB write runs.
vi.mock("@/server/api/utils/audit", () => ({ audit: vi.fn() }));

import { bitbucketRouter } from "@/server/api/routers/bitbucket";

const ORG = "org-1";
const USER = "user-owner";

const makeCtx = () =>
	({
		session: { userId: USER, activeOrganizationId: ORG } as any,
		user: {
			id: USER,
			role: "owner" as const,
			ownerId: ORG,
			email: "owner@test",
			enableEnterpriseFeatures: true,
			isValidEnterpriseLicense: true,
		} as any,
		db: {} as any,
		req: {} as any,
		res: {} as any,
	}) as any;

// `updateBitbucket`'s real implementation returns the full secret-bearing row
// via `.returning()`. The router must NOT forward those columns back.
const secretBearingRow = {
	bitbucketId: "bb-1",
	bitbucketUsername: "owner-username",
	bitbucketEmail: "owner@test",
	appPassword: "leaked-app-password",
	apiToken: "leaked-api-token",
	bitbucketWorkspaceName: "ws",
	gitProviderId: "gp-1",
	gitProvider: {
		gitProviderId: "gp-1",
		organizationId: ORG,
		userId: USER,
		name: "P",
		sharedWithOrganization: false,
	},
};

const baseInput = {
	bitbucketId: "bb-1",
	gitProviderId: "gp-1",
	name: "P",
	bitbucketUsername: "owner-username",
	bitbucketEmail: "owner@test.com",
	bitbucketWorkspaceName: "ws",
};

beforeEach(() => {
	vi.clearAllMocks();
	mockAssertGitProviderAccess.mockResolvedValue(undefined);
	mockFindBitbucketById.mockResolvedValue(secretBearingRow);
	// Real updateBitbucket returns the full row (incl. secrets); the router must
	// not forward it.
	mockUpdateBitbucket.mockResolvedValue(secretBearingRow);
});

describe("bitbucket.update — secret-leak regression", () => {
	it("returns { success: true } and never exposes appPassword/apiToken", async () => {
		const caller = bitbucketRouter.createCaller(makeCtx());
		const result = await caller.update(baseInput);

		expect(result).toEqual({ success: true });
		expect(result).not.toHaveProperty("appPassword");
		expect(result).not.toHaveProperty("apiToken");
		expect(JSON.stringify(result)).not.toContain("leaked-app-password");
		expect(JSON.stringify(result)).not.toContain("leaked-api-token");
	});

	it("does not leak secrets even when the caller omits appPassword/apiToken", async () => {
		// A direct API call may omit the secret fields; the bug preserved them in
		// the DB and returned them via `.returning()`. The fix must not return them.
		const caller = bitbucketRouter.createCaller(makeCtx());
		const result = await caller.update({
			bitbucketId: "bb-1",
			gitProviderId: "gp-1",
			name: "P",
		});

		expect(result).toEqual({ success: true });
		expect(JSON.stringify(result)).not.toContain("leaked-app-password");
		expect(JSON.stringify(result)).not.toContain("leaked-api-token");
	});

	it("still performs the update with the caller's active organization", async () => {
		const caller = bitbucketRouter.createCaller(makeCtx());
		await caller.update(baseInput);

		expect(mockUpdateBitbucket).toHaveBeenCalledTimes(1);
		expect(mockUpdateBitbucket).toHaveBeenNthCalledWith(
			1,
			"bb-1",
			expect.objectContaining({ organizationId: ORG, bitbucketId: "bb-1" }),
		);
	});
});

describe("bitbucket.update — IDOR guard regression", () => {
	it("loads the provider and runs assertGitProviderAccess before updating", async () => {
		const caller = bitbucketRouter.createCaller(makeCtx());
		await caller.update(baseInput);

		expect(mockFindBitbucketById).toHaveBeenCalledWith("bb-1");
		expect(mockAssertGitProviderAccess).toHaveBeenCalledWith(
			{ userId: USER, activeOrganizationId: ORG },
			secretBearingRow.gitProvider,
		);
	});

	it("runs the access check before updateBitbucket (ordering)", async () => {
		const callOrder: string[] = [];
		mockFindBitbucketById.mockImplementation(async () => {
			callOrder.push("find");
			return secretBearingRow;
		});
		mockAssertGitProviderAccess.mockImplementation(async () => {
			callOrder.push("assert");
		});
		mockUpdateBitbucket.mockImplementation(async () => {
			callOrder.push("update");
			return secretBearingRow;
		});

		const caller = bitbucketRouter.createCaller(makeCtx());
		await caller.update(baseInput);

		expect(callOrder).toEqual(["find", "assert", "update"]);
	});

	it("rejects a cross-org / unentitled provider and skips the update", async () => {
		mockAssertGitProviderAccess.mockRejectedValue(
			new TRPCError({ code: "NOT_FOUND", message: "Git provider not found" }),
		);

		const caller = bitbucketRouter.createCaller(makeCtx());
		await expect(caller.update(baseInput)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect(mockUpdateBitbucket).not.toHaveBeenCalled();
	});

	it("rejects with FORBIDDEN when the caller is not entitled to the provider", async () => {
		mockAssertGitProviderAccess.mockRejectedValue(
			new TRPCError({ code: "FORBIDDEN", message: "You don't have access" }),
		);

		const caller = bitbucketRouter.createCaller(makeCtx());
		await expect(caller.update(baseInput)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(mockUpdateBitbucket).not.toHaveBeenCalled();
	});
});
