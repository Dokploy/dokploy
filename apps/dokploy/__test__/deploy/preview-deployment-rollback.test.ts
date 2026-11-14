import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findApplicationById: vi.fn(),
	findGithubById: vi.fn(),
	authGithub: vi.fn(),
	createComment: vi.fn(),
	updateComment: vi.fn(),
	createDomain: vi.fn(),
	manageDomain: vi.fn(),
	createRedirectMiddleware: vi.fn(),
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
		transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
			cb({
				insert: vi.fn(() => ({
					values: vi.fn(() => ({
						returning: mocks.insertReturning,
					})),
				})),
			}),
		),
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

vi.mock("@dokploy/server/utils/traefik/redirect", () => ({
	createRedirectMiddleware: mocks.createRedirectMiddleware,
	removeRedirectMiddleware: vi.fn(),
	updateRedirectMiddleware: vi.fn(),
}));

vi.mock("@dokploy/server/utils/traefik/application", () => ({
	removeTraefikConfig: mocks.removeTraefikConfig,
}));

const { createPreviewDeployment } = await import(
	"@dokploy/server/services/preview-deployment"
);
const { createRedirect } = await import("@dokploy/server/services/redirect");

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

	it("awaits createRedirectMiddleware inside createRedirect transaction so write failures reject and roll back", async () => {
		mocks.insertReturning.mockResolvedValueOnce([
			{
				redirectId: "redirect-1",
				applicationId: "app-1",
				regex: "^/old/(.*)",
				replacement: "/new/$1",
				permanent: true,
				uniqueConfigKey: 1,
			},
		]);
		mocks.createRedirectMiddleware.mockRejectedValueOnce(
			new Error("SSH SFTP write failed"),
		);

		await expect(
			createRedirect({
				applicationId: "app-1",
				regex: "^/old/(.*)",
				replacement: "/new/$1",
				permanent: true,
			}),
		).rejects.toThrow("Error creating this redirect");

		expect(mocks.createRedirectMiddleware).toHaveBeenCalledOnce();
	});
});
