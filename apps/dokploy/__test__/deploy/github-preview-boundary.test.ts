import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serverMocks = vi.hoisted(() => ({
	checkUserRepositoryPermissions: vi.fn(),
	createPreviewDeployment: vi.fn(),
	createSecurityBlockedComment: vi.fn(),
	findGithubById: vi.fn(),
	findPreviewDeploymentByApplicationId: vi.fn(),
	findPreviewDeploymentsByPullRequestId: vi.fn(),
	removePreviewDeployment: vi.fn(),
	shouldDeploy: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
	findGithub: vi.fn(),
	findApplications: vi.fn(),
}));

const queueMocks = vi.hoisted(() => ({
	add: vi.fn(),
}));

const webhookMocks = vi.hoisted(() => ({
	verify: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	checkUserRepositoryPermissions: serverMocks.checkUserRepositoryPermissions,
	createPreviewDeployment: serverMocks.createPreviewDeployment,
	createSecurityBlockedComment: serverMocks.createSecurityBlockedComment,
	findGithubById: serverMocks.findGithubById,
	findPreviewDeploymentByApplicationId:
		serverMocks.findPreviewDeploymentByApplicationId,
	findPreviewDeploymentsByPullRequestId:
		serverMocks.findPreviewDeploymentsByPullRequestId,
	removePreviewDeployment: serverMocks.removePreviewDeployment,
	shouldDeploy: serverMocks.shouldDeploy,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			github: {
				findFirst: dbMocks.findGithub,
			},
			applications: {
				findMany: dbMocks.findApplications,
			},
		},
	},
}));

vi.mock("@octokit/webhooks", () => ({
	Webhooks: class {
		verify = webhookMocks.verify;
	},
}));

vi.mock("drizzle-orm", () => ({
	and: vi.fn((...conditions) => ({ conditions })),
	eq: vi.fn((left, right) => ({ left, right })),
}));

vi.mock("@/server/db/schema", () => ({
	applications: {
		autoDeploy: "autoDeploy",
		branch: "branch",
		githubId: "githubId",
		isPreviewDeploymentsActive: "isPreviewDeploymentsActive",
		owner: "owner",
		repository: "repository",
		sourceType: "sourceType",
		triggerType: "triggerType",
	},
	compose: {
		autoDeploy: "autoDeploy",
		branch: "branch",
		githubId: "githubId",
		owner: "owner",
		repository: "repository",
		sourceType: "sourceType",
		triggerType: "triggerType",
	},
	github: {
		githubInstallationId: "githubInstallationId",
	},
}));

vi.mock("@/server/queues/queueSetup", () => ({
	myQueue: queueMocks,
}));

vi.mock("@/server/utils/deploy", () => ({
	deploy: vi.fn(),
}));

vi.mock("../../pages/api/deploy/[refreshToken]", () => ({
	extractCommitMessage: vi.fn(() => "Preview Deployment"),
	extractHash: vi.fn(() => "sha-preview"),
	logWebhookError: vi.fn(),
}));

const { default: githubDeployHandler } = await import(
	"../../pages/api/deploy/github"
);

const createResponse = () => {
	const response = {
		json: vi.fn(),
		status: vi.fn(),
	};
	response.status.mockReturnValue(response);
	return response as unknown as NextApiResponse & {
		json: ReturnType<typeof vi.fn>;
		status: ReturnType<typeof vi.fn>;
	};
};

const createPullRequestRequest = () =>
	({
		headers: {
			"x-github-event": "pull_request",
			"x-hub-signature-256": "sha256=signature",
		},
		body: {
			action: "opened",
			installation: {
				id: 123,
			},
			repository: {
				name: "repo",
				owner: {
					login: "owner",
				},
			},
			pull_request: {
				id: 456,
				number: 7,
				title: "Preview from fork",
				html_url: "https://github.com/owner/repo/pull/7",
				head: {
					ref: "fork-branch",
					sha: "sha-preview",
				},
				base: {
					ref: "main",
				},
				user: {
					login: "external-user",
				},
				labels: [],
			},
		},
	}) as unknown as NextApiRequest;

describe("GitHub preview webhook collaborator boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		webhookMocks.verify.mockResolvedValue(true);
		dbMocks.findGithub.mockResolvedValue({
			githubId: "github-1",
			githubWebhookSecret: "webhook-secret",
		});
		serverMocks.findGithubById.mockResolvedValue({
			githubId: "github-1",
		});
		serverMocks.checkUserRepositoryPermissions.mockResolvedValue({
			hasWriteAccess: false,
			permission: null,
		});
		serverMocks.createSecurityBlockedComment.mockResolvedValue(undefined);
		serverMocks.findPreviewDeploymentByApplicationId.mockResolvedValue(null);
		serverMocks.createPreviewDeployment.mockResolvedValue({
			previewDeploymentId: "preview-1",
		});
		queueMocks.add.mockResolvedValue({ id: "job-1" });
	});

	it("blocks disabled collaborator checks when preview secrets would reach the build", async () => {
		dbMocks.findApplications.mockResolvedValue([
			{
				applicationId: "app-1",
				name: "preview-app",
				previewRequireCollaboratorPermissions: false,
				previewEnv: "PREVIEW_TOKEN=secret",
				previewBuildArgs: null,
				previewBuildSecrets: null,
				previewLabels: [],
				previewLimit: 0,
				previewDeployments: [],
				serverId: null,
			},
		]);

		const response = createResponse();

		await githubDeployHandler(createPullRequestRequest(), response);

		expect(serverMocks.checkUserRepositoryPermissions).toHaveBeenCalledWith(
			{ githubId: "github-1" },
			"owner",
			"repo",
			"external-user",
		);
		expect(serverMocks.createSecurityBlockedComment).toHaveBeenCalledWith({
			owner: "owner",
			repository: "repo",
			prNumber: 7,
			prAuthor: "external-user",
			permission: null,
			githubId: "github-1",
		});
		expect(serverMocks.createPreviewDeployment).not.toHaveBeenCalled();
		expect(queueMocks.add).not.toHaveBeenCalled();
		expect(response.status).toHaveBeenCalledWith(200);
		expect(response.json).toHaveBeenCalledWith({ message: "Apps Deployed" });
	});
});
