import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the DB so the REAL getAccessibleGitProviderIds (called internally by
// assertGitProviderAccess) runs against controlled data. Mocking the exported
// function would NOT intercept the intra-module call, so we mock one layer down.
const mockDb = vi.hoisted(() => ({
	query: {
		gitProvider: {
			findMany: vi.fn(),
		},
		member: {
			findFirst: vi.fn(),
		},
	},
}));
vi.mock("@dokploy/server/db", () => ({ db: mockDb }));

const mockHasValidLicense = vi.hoisted(() => vi.fn());
vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: mockHasValidLicense,
}));

import { assertGitProviderAccess } from "@dokploy/server/services/git-provider";

const ORG = "org-1";
const USER = "user-member";
const session = { userId: USER, activeOrganizationId: ORG };

// Provider owned by USER within ORG -> should be accessible.
const providerMine = {
	gitProviderId: "gp-mine",
	userId: USER,
	sharedWithOrganization: false,
};
// Provider owned by someone else within ORG, not shared, not assigned.
const providerOther = {
	gitProviderId: "gp-other",
	userId: "user-2",
	sharedWithOrganization: false,
};

beforeEach(() => {
	vi.clearAllMocks();
	mockHasValidLicense.mockResolvedValue(false);
	mockDb.query.gitProvider.findMany.mockResolvedValue([
		providerMine,
		providerOther,
	]);
	mockDb.query.member.findFirst.mockResolvedValue({
		role: "member",
		accessedGitProviders: [],
	});
});

describe("assertGitProviderAccess (git provider IDOR guard)", () => {
	it("rejects a provider from another organization with NOT_FOUND (cross-org IDOR)", async () => {
		await expect(
			assertGitProviderAccess(session, {
				gitProviderId: "gp-mine",
				organizationId: "org-2",
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("rejects a same-org provider the caller is not entitled to with FORBIDDEN", async () => {
		await expect(
			assertGitProviderAccess(session, {
				gitProviderId: "gp-other",
				organizationId: ORG,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("allows a same-org provider the caller owns", async () => {
		await expect(
			assertGitProviderAccess(session, {
				gitProviderId: "gp-mine",
				organizationId: ORG,
			}),
		).resolves.toBeUndefined();
	});

	it("throws a TRPCError so tRPC maps the HTTP status", async () => {
		const err = await assertGitProviderAccess(session, {
			gitProviderId: "gp-mine",
			organizationId: "org-2",
		}).catch((e) => e);
		expect(err).toBeInstanceOf(TRPCError);
	});
});
