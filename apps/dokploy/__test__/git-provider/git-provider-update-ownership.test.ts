import { beforeEach, describe, expect, it, vi } from "vitest";
import { bitbucketRouter } from "@/server/api/routers/bitbucket";
import { giteaRouter } from "@/server/api/routers/gitea";
import { gitlabRouter } from "@/server/api/routers/gitlab";

const mocks = vi.hoisted(() => ({
	findGitlabById: vi.fn(),
	findGiteaById: vi.fn(),
	findBitbucketById: vi.fn(),
	assertGitProviderAccess: vi.fn(async () => undefined),
	canViewGitProviderSecrets: vi.fn(),
	updateGitProvider: vi.fn(),
	updateGitlab: vi.fn(),
	updateGitea: vi.fn(),
	updateBitbucket: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	...mocks,
	getAccessibleGitProviderIds: vi.fn(async () => new Set()),
}));
vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: vi.fn(async () => undefined),
}));
vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));

const ctx = {
	user: { id: "member-1", role: "member" },
	session: { userId: "member-1", activeOrganizationId: "org-a" },
} as never;

// Shared with the org by another user, so the member may use it but not edit it.
const sharedProvider = {
	gitProviderId: "gp-1",
	organizationId: "org-a",
	userId: "owner-1",
	sharedWithOrganization: true,
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.findGitlabById.mockResolvedValue({
		gitlabId: "gl-1",
		gitProvider: sharedProvider,
	});
	mocks.findGiteaById.mockResolvedValue({
		giteaId: "gt-1",
		gitProvider: sharedProvider,
	});
	mocks.findBitbucketById.mockResolvedValue({
		bitbucketId: "bb-1",
		gitProvider: sharedProvider,
	});
});

const updates = [
	{
		name: "gitlab",
		call: () =>
			gitlabRouter.createCaller(ctx).update({
				gitlabId: "gl-1",
				gitProviderId: "gp-1",
				name: "x",
				gitlabUrl: "https://attacker.example",
			}),
		mutation: mocks.updateGitlab,
	},
	{
		name: "gitea",
		call: () =>
			giteaRouter.createCaller(ctx).update({
				giteaId: "gt-1",
				gitProviderId: "gp-1",
				name: "x",
				giteaUrl: "https://attacker.example",
			} as never),
		mutation: mocks.updateGitea,
	},
	{
		name: "bitbucket",
		call: () =>
			bitbucketRouter.createCaller(ctx).update({
				bitbucketId: "bb-1",
				gitProviderId: "gp-1",
				name: "x",
				apiToken: "attacker-token",
			} as never),
		mutation: mocks.updateBitbucket,
	},
];

describe("git provider update — only the provider owner or an org admin", () => {
	for (const { name, call, mutation } of updates) {
		it(`${name}: a member using a shared provider cannot repoint or overwrite it`, async () => {
			mocks.canViewGitProviderSecrets.mockResolvedValue(false);
			await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
			expect(mutation).not.toHaveBeenCalled();
			expect(mocks.updateGitProvider).not.toHaveBeenCalled();
		});

		it(`${name}: the provider owner can update it`, async () => {
			mocks.canViewGitProviderSecrets.mockResolvedValue(true);
			await call();
			expect(mutation).toHaveBeenCalledTimes(1);
		});
	}
});
