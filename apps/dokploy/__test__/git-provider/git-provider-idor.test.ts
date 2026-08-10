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

const providerLookups = vi.hoisted(() => ({
	findGithubById: vi.fn(),
	findGitlabById: vi.fn(),
	findBitbucketById: vi.fn(),
	findGiteaById: vi.fn(),
}));
vi.mock("@dokploy/server/services/github", () => ({
	findGithubById: providerLookups.findGithubById,
}));
vi.mock("@dokploy/server/services/gitlab", () => ({
	findGitlabById: providerLookups.findGitlabById,
}));
vi.mock("@dokploy/server/services/bitbucket", () => ({
	findBitbucketById: providerLookups.findBitbucketById,
}));
vi.mock("@dokploy/server/services/gitea", () => ({
	findGiteaById: providerLookups.findGiteaById,
}));

import {
	assertGitProviderAccess,
	assertGitProviderReferencesAccess,
} from "@dokploy/server/services/git-provider";

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
	for (const lookup of Object.values(providerLookups)) {
		lookup.mockImplementation(async (id: string) => ({
			gitProvider: {
				gitProviderId: id === "blocked" ? "gp-other" : "gp-mine",
				organizationId: id === "cross-org" ? "org-2" : ORG,
			},
		}));
	}
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

describe("assertGitProviderReferencesAccess", () => {
	it("authorizes every provider subtype referenced by a mutation", async () => {
		await expect(
			assertGitProviderReferencesAccess(session, {
				githubId: "github",
				gitlabId: "gitlab",
				bitbucketId: "bitbucket",
				giteaId: "gitea",
			}),
		).resolves.toBeUndefined();

		expect(providerLookups.findGithubById).toHaveBeenCalledWith("github");
		expect(providerLookups.findGitlabById).toHaveBeenCalledWith("gitlab");
		expect(providerLookups.findBitbucketById).toHaveBeenCalledWith("bitbucket");
		expect(providerLookups.findGiteaById).toHaveBeenCalledWith("gitea");
	});

	it("rejects cross-organization provider references", async () => {
		await expect(
			assertGitProviderReferencesAccess(session, { githubId: "cross-org" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("rejects same-organization provider references unavailable to the caller", async () => {
		await expect(
			assertGitProviderReferencesAccess(session, { gitlabId: "blocked" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("does not query providers for omitted or null references", async () => {
		await expect(
			assertGitProviderReferencesAccess(session, {
				githubId: null,
				gitlabId: undefined,
			}),
		).resolves.toBeUndefined();
		expect(providerLookups.findGithubById).not.toHaveBeenCalled();
		expect(providerLookups.findGitlabById).not.toHaveBeenCalled();
	});
});
