import { assertGitlabProviderAccess } from "@dokploy/server/services/gitlab";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
	query: {
		gitlab: {
			findFirst: vi.fn(),
		},
		gitProvider: {
			findMany: vi.fn(),
			findFirst: vi.fn(),
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

const ORG_ID = "org-1";
const OTHER_ORG_ID = "org-2";
const USER_MEMBER = "user-member";
const USER_OWNER = "user-owner";

const ownedProvider = {
	gitProviderId: "gp-owned",
	userId: USER_MEMBER,
	sharedWithOrganization: false,
	organizationId: ORG_ID,
};

const privateProvider = {
	gitProviderId: "gp-private",
	userId: USER_OWNER,
	sharedWithOrganization: false,
	organizationId: ORG_ID,
};

function session(userId: string, organizationId = ORG_ID) {
	return { userId, activeOrganizationId: organizationId };
}

function mockGitlab(overrides: {
	gitlabId?: string;
	gitProviderId: string;
	organizationId: string;
}) {
	return {
		gitlabId: overrides.gitlabId ?? "gitlab-id",
		gitProviderId: overrides.gitProviderId,
		gitProvider: {
			gitProviderId: overrides.gitProviderId,
			organizationId: overrides.organizationId,
			userId:
				overrides.gitProviderId === ownedProvider.gitProviderId
					? USER_MEMBER
					: USER_OWNER,
			sharedWithOrganization: false,
		},
	};
}

describe("assertGitlabProviderAccess", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockHasValidLicense.mockResolvedValue(false);
		mockDb.query.gitProvider.findMany.mockResolvedValue([
			ownedProvider,
			privateProvider,
		]);
		mockDb.query.member.findFirst.mockResolvedValue({
			role: "member",
			accessedGitProviders: [],
		});
	});

	it("allows a member to use a GitLab provider they can access", async () => {
		mockDb.query.gitlab.findFirst.mockResolvedValue(
			mockGitlab({
				gitProviderId: ownedProvider.gitProviderId,
				organizationId: ORG_ID,
			}),
		);

		await expect(
			assertGitlabProviderAccess("gitlab-id", session(USER_MEMBER)),
		).resolves.toMatchObject({ gitlabId: "gitlab-id" });
	});

	it("rejects an out-of-scope GitLab provider in the same organization", async () => {
		mockDb.query.gitlab.findFirst.mockResolvedValue(
			mockGitlab({
				gitProviderId: privateProvider.gitProviderId,
				organizationId: ORG_ID,
			}),
		);

		await expect(
			assertGitlabProviderAccess("gitlab-private", session(USER_MEMBER)),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});

	it("rejects a GitLab provider from another organization", async () => {
		mockDb.query.gitlab.findFirst.mockResolvedValue(
			mockGitlab({
				gitProviderId: "gp-other-org",
				organizationId: OTHER_ORG_ID,
			}),
		);

		await expect(
			assertGitlabProviderAccess("gitlab-other-org", session(USER_MEMBER)),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});
});
