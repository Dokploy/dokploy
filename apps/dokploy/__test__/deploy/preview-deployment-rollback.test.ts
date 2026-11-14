import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findApplicationById: vi.fn(),
	findGithubById: vi.fn(),
	authGithub: vi.fn(),
	createComment: vi.fn(),
	updateComment: vi.fn(),
	createDomain: vi.fn(),
	manageDomain: vi.fn(),
	removeTraefikConfig: vi.fn(),
	insertReturning: vi.fn(),
	updateWhere: vi.fn(),
	deleteWhere: vi.fn(),
	organizationFindFirst: vi.fn(),
	getWebServerSettings: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			organization: {
				findFirst: mocks.organizationFindFirst,
			},
			previewDeployments: {
				findFirst: vi.fn(),
				findMany: vi.fn(),
			},
		},
		insert: vi.fn(() => ({
			values: vi.fn(() => ({
				returning: mocks.insertReturning,
			})),
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: mocks.updateWhere,
			})),
		})),
		delete: vi.fn(() => ({
			where: mocks.deleteWhere,
		})),
	},
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: mocks.findApplicationById,
}));

vi.mock("@dokploy/server/services/domain", () => ({
	createDomain: mocks.createDomain,
}));

vi.mock("@dokploy/server/services/github", () => ({
	findGithubById: mocks.findGithubById,
	getIssueComment: vi.fn(
		(appName: string, status: string, previewDomain: string) =>
			`${appName}:${status}:${previewDomain}`,
	),
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: mocks.getWebServerSettings,
}));

vi.mock("@dokploy/server/utils/providers/github", () => ({
	authGithub: mocks.authGithub,
}));

vi.mock("@dokploy/server/utils/traefik/domain", () => ({
	manageDomain: mocks.manageDomain,
}));

vi.mock("@dokploy/server/utils/traefik/application", () => ({
	removeTraefikConfig: mocks.removeTraefikConfig,
}));

const { createPreviewDeployment } = await import(
	"@dokploy/server/services/preview-deployment"
);

describe("createPreviewDeployment rollback on Traefik write failure", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findApplicationById.mockResolvedValue({
			applicationId: "app-1",
			name: "my-app",
			appName: "my-app-abc",
			serverId: "server-1",
			server: { ipAddress: "1.2.3.4" },
			environment: { project: { organizationId: "org-1" } },
			previewWildcard: "*.example.com",
			previewPath: "/",
			previewPort: 3000,
			previewHttps: true,
			previewCertificateType: "none",
			previewCustomCertResolver: null,
			githubId: "gh-1",
			owner: "acme",
			repository: "web",
		});
		mocks.organizationFindFirst.mockResolvedValue({ ownerId: "user-1" });
		mocks.findGithubById.mockResolvedValue({ githubId: "gh-1" });
		mocks.authGithub.mockReturnValue({
			rest: {
				issues: {
					createComment: mocks.createComment,
					updateComment: mocks.updateComment,
				},
			},
		});
		mocks.createComment.mockResolvedValue({ data: { id: 999 } });
		mocks.updateComment.mockResolvedValue({});
		mocks.insertReturning.mockResolvedValue([
			{ previewDeploymentId: "preview-1" },
		]);
		mocks.createDomain.mockResolvedValue({
			domainId: "domain-1",
			uniqueConfigKey: 1,
		});
		mocks.removeTraefikConfig.mockResolvedValue(undefined);
		mocks.deleteWhere.mockResolvedValue(undefined);
		mocks.updateWhere.mockResolvedValue(undefined);
	});

	it("deletes orphaned domain and preview rows and marks the PR comment as error when manageDomain throws", async () => {
		mocks.manageDomain.mockRejectedValue(
			new Error("Failed to write remote traefik config"),
		);

		await expect(
			createPreviewDeployment({
				applicationId: "app-1",
				branch: "feat/test",
				pullRequestId: "123",
				pullRequestNumber: "42",
				pullRequestTitle: "Add test feature",
				pullRequestURL: "https://github.com/acme/web/pull/42",
			}),
		).rejects.toThrow("Failed to write remote traefik config");

		expect(mocks.removeTraefikConfig).toHaveBeenCalledOnce();
		expect(mocks.deleteWhere).toHaveBeenCalledTimes(2);
		expect(mocks.updateComment).toHaveBeenCalledWith(
			expect.objectContaining({
				comment_id: 999,
				body: expect.stringContaining(":error:"),
			}),
		);
		expect(mocks.updateWhere).not.toHaveBeenCalled();
	});
});
