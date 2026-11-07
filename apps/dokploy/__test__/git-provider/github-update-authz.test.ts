import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findGithubById: vi.fn(),
	assertGitProviderAccess: vi.fn(),
	updateGitProvider: vi.fn(),
	updateGithub: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	findGithubById: mocks.findGithubById,
	assertGitProviderAccess: mocks.assertGitProviderAccess,
	updateGitProvider: mocks.updateGitProvider,
	updateGithub: mocks.updateGithub,
	canViewGitProviderSecrets: vi.fn(async () => true),
	getAccessibleGitProviderIds: vi.fn(async () => new Set()),
}));
vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: vi.fn(async () => undefined),
}));
vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));

const { githubRouter } = await import("@/server/api/routers/github");

const callerAs = (role: string) =>
	githubRouter.createCaller({
		user: { id: "u1", role },
		session: { activeOrganizationId: "org-a" },
	} as never);

const input = {
	githubId: "gh-1",
	gitProviderId: "gp-1",
	name: "my-provider",
	githubAppName: "app",
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.findGithubById.mockResolvedValue({
		githubId: "gh-1",
		gitProvider: { gitProviderId: "gp-1", organizationId: "org-a" },
	});
});

describe("github.update — owner/admin update their own provider", () => {
	for (const role of ["owner", "admin"]) {
		it(`${role} can update a provider in their org`, async () => {
			mocks.assertGitProviderAccess.mockResolvedValue(undefined);
			await callerAs(role).update(input as never);
			expect(mocks.assertGitProviderAccess).toHaveBeenCalledTimes(1);
			expect(mocks.updateGitProvider).toHaveBeenCalledTimes(1);
			expect(mocks.updateGithub).toHaveBeenCalledTimes(1);
		});
	}
});

describe("github.update — cross-org takeover is blocked", () => {
	it("rejects and does not mutate when the provider is not in the caller's org", async () => {
		mocks.assertGitProviderAccess.mockRejectedValue(
			Object.assign(new Error("not found"), { code: "NOT_FOUND" }),
		);
		await expect(callerAs("owner").update(input as never)).rejects.toBeTruthy();
		expect(mocks.updateGitProvider).not.toHaveBeenCalled();
		expect(mocks.updateGithub).not.toHaveBeenCalled();
	});
});
