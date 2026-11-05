import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUpdateApplication = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/services/permission", () => {
	return {
		checkServicePermissionAndAccess: vi.fn(async () => undefined),
	};
});

vi.mock("@dokploy/server/index", () => ({
	IS_CLOUD: true,
	hasValidLicense: vi.fn(async () => false),
	updateApplication: mockUpdateApplication,
	findApplicationById: vi.fn(async () => ({
		applicationId: "app-1",
		appName: "example-app",
	})),
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));

const { applicationRouter } = await import("@/server/api/routers/application");

const caller = applicationRouter.createCaller({
	session: { activeOrganizationId: "org-1" },
	user: { id: "user-1", email: "user@example.com", role: "owner" },
} as Parameters<typeof applicationRouter.createCaller>[0]);

const providerChanges = [
	{
		name: "GitHub",
		sourceType: "github",
		save: () =>
			caller.saveGithubProvider({
				applicationId: "app-1",
				repository: "example-repo",
				owner: "example-owner",
				branch: "main",
				buildPath: "/",
				githubId: "provider-1",
				watchPaths: ["src/**"],
				triggerType: "push",
				enableSubmodules: false,
			}),
	},
	{
		name: "GitLab",
		sourceType: "gitlab",
		save: () =>
			caller.saveGitlabProvider({
				applicationId: "app-1",
				gitlabRepository: "example-repo",
				gitlabOwner: "example-owner",
				gitlabBranch: "main",
				gitlabBuildPath: "/",
				gitlabId: "provider-1",
				gitlabProjectId: 1,
				gitlabPathNamespace: "example-owner/example-repo",
			}),
	},
	{
		name: "Bitbucket",
		sourceType: "bitbucket",
		save: () =>
			caller.saveBitbucketProvider({
				applicationId: "app-1",
				bitbucketRepository: "example-repo",
				bitbucketRepositorySlug: "example-repo",
				bitbucketOwner: "example-owner",
				bitbucketBranch: "main",
				bitbucketBuildPath: "/",
				bitbucketId: "provider-1",
			}),
	},
	{
		name: "Gitea",
		sourceType: "gitea",
		save: () =>
			caller.saveGiteaProvider({
				applicationId: "app-1",
				giteaRepository: "example-repo",
				giteaOwner: "example-owner",
				giteaBranch: "main",
				giteaBuildPath: "/",
				giteaId: "provider-1",
			}),
	},
	{
		name: "Docker",
		sourceType: "docker",
		save: () =>
			caller.saveDockerProvider({
				applicationId: "app-1",
				dockerImage: "nginx:alpine",
				username: "",
				password: "",
				registryUrl: "",
			}),
	},
	{
		name: "custom Git",
		sourceType: "git",
		save: () =>
			caller.saveGitProvider({
				applicationId: "app-1",
				customGitUrl: "https://example.com/repo.git",
				customGitBranch: "main",
				customGitBuildPath: "/",
				customGitSSHKeyId: "key-1",
				watchPaths: ["src/**"],
				enableSubmodules: false,
			}),
	},
	{
		name: "disconnect Git provider",
		sourceType: "github",
		save: () => caller.disconnectGitProvider({ applicationId: "app-1" }),
	},
];

describe("saving an application provider", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each(providerChanges)(
		"keeps the status when $name settings change",
		async ({ save, sourceType }) => {
			for (const status of ["done", "running"]) {
				mockUpdateApplication.mockClear();
				let savedStatus = status;
				mockUpdateApplication.mockImplementation(async (_id, update) => {
					if (update.applicationStatus !== undefined) {
						savedStatus = update.applicationStatus;
					}
				});

				await save();

				expect(savedStatus).toBe(status);
				expect(mockUpdateApplication).toHaveBeenCalledTimes(1);
				expect(mockUpdateApplication).toHaveBeenCalledWith(
					"app-1",
					expect.objectContaining({ sourceType }),
				);
			}
		},
	);
});
