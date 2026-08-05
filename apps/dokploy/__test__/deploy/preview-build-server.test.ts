import { db } from "@dokploy/server/db";
import {
	deployPreviewApplication,
	rebuildPreviewApplication,
} from "@dokploy/server/services/application";
import * as deploymentService from "@dokploy/server/services/deployment";
import * as githubService from "@dokploy/server/services/github";
import * as previewService from "@dokploy/server/services/preview-deployment";
import * as builders from "@dokploy/server/utils/builders";
import * as execProcess from "@dokploy/server/utils/process/execAsync";
import * as githubProvider from "@dokploy/server/utils/providers/github";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			applications: {
				findFirst: vi.fn(),
			},
		},
	},
}));

vi.mock("@dokploy/server/services/deployment", () => ({
	createDeployment: vi.fn(),
	createDeploymentPreview: vi.fn(),
	updateDeployment: vi.fn(),
	updateDeploymentStatus: vi.fn(),
}));

vi.mock("@dokploy/server/services/preview-deployment", () => ({
	findPreviewDeploymentById: vi.fn(),
	updatePreviewDeployment: vi.fn(),
}));

vi.mock("@dokploy/server/services/github", () => ({
	createPreviewDeploymentComment: vi.fn(),
	getIssueComment: vi.fn(),
	issueCommentExists: vi.fn(),
	updateIssueComment: vi.fn(),
}));

vi.mock("@dokploy/server/utils/builders", () => ({
	getBuildCommand: vi.fn(),
	mechanizeDockerContainer: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	ExecError: class ExecError extends Error {},
}));

vi.mock("@dokploy/server/utils/providers/github", () => ({
	cloneGithubRepository: vi.fn(),
}));

const createMockApplication = () => ({
	applicationId: "application-id",
	name: "Test application",
	appName: "test-application",
	sourceType: "github" as const,
	owner: "Dokploy",
	repository: "dokploy",
	branch: "canary",
	githubId: "github-id",
	enableSubmodules: false,
	serverId: "deployment-server-id",
	buildServerId: "build-server-id",
	buildRegistry: {
		registryId: "build-registry-id",
	},
	registry: null,
	rollbackRegistry: null,
	rollbackActive: true,
	previewEnv: "",
	previewBuildArgs: "",
	previewBuildSecrets: "",
	environment: {
		env: "",
		projectId: "project-id",
		project: {
			env: "",
			name: "Test project",
			organizationId: "organization-id",
		},
	},
	domains: [],
	mounts: [],
	ports: [],
	security: [],
	redirects: [],
});

const createMockPreview = () => ({
	previewDeploymentId: "preview-id",
	applicationId: "application-id",
	appName: "preview-test-application",
	branch: "feature/test-preview",
	pullRequestNumber: "123",
	pullRequestCommentId: "456",
	deployments: [
		{
			buildServerId: "build-server-id",
		},
	],
	domain: {
		host: "preview.example.com",
		https: true,
	},
});

describe("preview deployment build server and registry", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		vi.mocked(db.query.applications.findFirst).mockResolvedValue(
			createMockApplication() as any,
		);

		vi.mocked(previewService.findPreviewDeploymentById).mockResolvedValue(
			createMockPreview() as any,
		);

		vi.mocked(deploymentService.createDeploymentPreview).mockResolvedValue({
			deploymentId: "deployment-id",
			logPath: "/tmp/preview.log",
		} as any);

		vi.mocked(githubService.issueCommentExists).mockResolvedValue(true);
		vi.mocked(githubService.getIssueComment).mockReturnValue("comment");
		vi.mocked(githubService.updateIssueComment).mockResolvedValue(
			undefined as any,
		);

		vi.mocked(githubProvider.cloneGithubRepository).mockResolvedValue(
			"git clone command;",
		);

		vi.mocked(builders.getBuildCommand).mockResolvedValue(
			"docker build and push command;",
		);

		vi.mocked(builders.mechanizeDockerContainer).mockResolvedValue(
			undefined as any,
		);

		vi.mocked(execProcess.execAsyncRemote).mockResolvedValue({
			stdout: "",
			stderr: "",
		} as any);
	});

	it("builds a new preview on the configured build server and preserves its registry", async () => {
		await deployPreviewApplication({
			applicationId: "application-id",
			previewDeploymentId: "preview-id",
			titleLog: "Preview deployment",
			descriptionLog: "",
		});

		expect(githubProvider.cloneGithubRepository).toHaveBeenCalledWith(
			expect.objectContaining({
				appName: "preview-test-application",
				branch: "feature/test-preview",
				serverId: "build-server-id",
			}),
		);

		expect(builders.getBuildCommand).toHaveBeenCalledWith(
			expect.objectContaining({
				serverId: "build-server-id",
				buildServerId: "build-server-id",
				buildRegistry: expect.objectContaining({
					registryId: "build-registry-id",
				}),
			}),
		);

		expect(execProcess.execAsyncRemote).toHaveBeenCalledWith(
			"build-server-id",
			expect.stringContaining("docker build and push command"),
		);

		expect(builders.mechanizeDockerContainer).toHaveBeenCalledWith(
			expect.objectContaining({
				serverId: "deployment-server-id",
				buildRegistry: expect.objectContaining({
					registryId: "build-registry-id",
				}),
			}),
		);
	});

	it("rebuilds a preview on the configured build server and preserves its registry", async () => {
		await rebuildPreviewApplication({
			applicationId: "application-id",
			previewDeploymentId: "preview-id",
			titleLog: "Rebuild preview deployment",
			descriptionLog: "",
		});

		expect(githubProvider.cloneGithubRepository).not.toHaveBeenCalled();

		expect(builders.getBuildCommand).toHaveBeenCalledWith(
			expect.objectContaining({
				serverId: "build-server-id",
				buildServerId: "build-server-id",
				buildRegistry: expect.objectContaining({
					registryId: "build-registry-id",
				}),
			}),
		);

		expect(execProcess.execAsyncRemote).toHaveBeenCalledWith(
			"build-server-id",
			expect.stringContaining("docker build and push command"),
		);

		expect(builders.mechanizeDockerContainer).toHaveBeenCalledWith(
			expect.objectContaining({
				serverId: "deployment-server-id",
			}),
		);
	});

	it("reclones a preview on the current build server when its build server changed", async () => {
		vi.mocked(previewService.findPreviewDeploymentById).mockResolvedValue({
			...createMockPreview(),
			deployments: [
				{
					buildServerId: "previous-build-server-id",
				},
			],
		} as any);

		await rebuildPreviewApplication({
			applicationId: "application-id",
			previewDeploymentId: "preview-id",
			titleLog: "Rebuild preview deployment",
			descriptionLog: "",
		});

		expect(githubProvider.cloneGithubRepository).toHaveBeenCalledWith(
			expect.objectContaining({
				serverId: "build-server-id",
				appName: "preview-test-application",
				branch: "feature/test-preview",
			}),
		);

		expect(builders.getBuildCommand).toHaveBeenCalledWith(
			expect.objectContaining({
				serverId: "build-server-id",
				buildRegistry: expect.objectContaining({
					registryId: "build-registry-id",
				}),
			}),
		);

		expect(execProcess.execAsyncRemote).toHaveBeenCalledWith(
			"build-server-id",
			expect.stringContaining("git clone command;"),
		);
	});

	it("reclones a legacy preview on the configured build server", async () => {
		vi.mocked(previewService.findPreviewDeploymentById).mockResolvedValue({
			...createMockPreview(),
			deployments: [
				{
					buildServerId: null,
				},
			],
		} as any);

		await rebuildPreviewApplication({
			applicationId: "application-id",
			previewDeploymentId: "preview-id",
			titleLog: "Rebuild preview deployment",
			descriptionLog: "",
		});

		expect(githubProvider.cloneGithubRepository).toHaveBeenCalledWith(
			expect.objectContaining({
				serverId: "build-server-id",
				appName: "preview-test-application",
				branch: "feature/test-preview",
			}),
		);

		expect(execProcess.execAsyncRemote).toHaveBeenCalledWith(
			"build-server-id",
			expect.stringContaining("git clone command;"),
		);
	});
});
