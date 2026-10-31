import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	previewDeploymentExists: vi.fn(),
	mechanizeDockerContainer: vi.fn(),
	updateIssueComment: vi.fn(),
	updateDeploymentStatus: vi.fn(),
	updatePreviewDeployment: vi.fn(),
}));

// `findApplicationById` runs for real and reads the application through the
// database mock.
vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			applications: {
				findFirst: vi.fn().mockResolvedValue({
					applicationId: "application-id",
					name: "my-app",
					appName: "my-app",
					sourceType: "github",
					owner: "agentHits",
					repository: "dokploy",
					githubId: "github-id",
					serverId: null,
					buildServerId: null,
					previewEnv: "",
					previewBuildArgs: "",
					previewBuildSecrets: "",
					enableSubmodules: false,
				}),
			},
		},
		select: vi.fn(),
		insert: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
	},
}));

vi.mock("@dokploy/server/services/preview-deployment", () => ({
	findPreviewDeploymentById: vi.fn().mockResolvedValue({
		previewDeploymentId: "preview-id",
		appName: "preview-my-app-abcdef",
		branch: "feature",
		pullRequestNumber: "42",
		pullRequestCommentId: "7",
		domain: { host: "preview.example.com", https: true },
	}),
	previewDeploymentExists: mocks.previewDeploymentExists,
	updatePreviewDeployment: mocks.updatePreviewDeployment,
}));

vi.mock("@dokploy/server/services/deployment", () => ({
	createDeploymentPreview: vi.fn().mockResolvedValue({
		deploymentId: "deployment-id",
		logPath: "/tmp/preview.log",
	}),
	updateDeploymentStatus: mocks.updateDeploymentStatus,
	createDeployment: vi.fn(),
	updateDeployment: vi.fn(),
}));

vi.mock("@dokploy/server/services/github", () => ({
	issueCommentExists: vi.fn().mockResolvedValue(true),
	updateIssueComment: mocks.updateIssueComment,
	createPreviewDeploymentComment: vi.fn(),
	getIssueComment: vi.fn((_name: string, status: string) => status),
}));

vi.mock("@dokploy/server/services/domain", () => ({
	getDomainHost: vi.fn(() => "https://preview.example.com"),
}));

vi.mock("@dokploy/server/services/admin", () => ({
	getDokployUrl: vi.fn(),
}));

vi.mock("@dokploy/server/utils/providers/github", () => ({
	cloneGithubRepository: vi.fn().mockResolvedValue("echo clone;"),
}));

vi.mock("@dokploy/server/utils/builders", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/utils/builders")
	>("@dokploy/server/utils/builders");
	return {
		...actual,
		getBuildCommand: vi.fn().mockResolvedValue("echo build;"),
		mechanizeDockerContainer: mocks.mechanizeDockerContainer,
	};
});

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
	execAsyncRemote: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
	ExecError: class ExecError extends Error {},
}));

vi.mock("@dokploy/server/utils/notifications/build-success", () => ({
	sendBuildSuccessNotifications: vi.fn(),
}));

vi.mock("@dokploy/server/utils/notifications/build-error", () => ({
	sendBuildErrorNotifications: vi.fn(),
}));

import {
	deployPreviewApplication,
	rebuildPreviewApplication,
} from "@dokploy/server/services/application";

const job = {
	applicationId: "application-id",
	titleLog: "Preview Deployment",
	descriptionLog: "Hash: abc123",
	previewDeploymentId: "preview-id",
};

describe("preview builds whose preview was removed meanwhile", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	for (const [name, run] of [
		["deployPreviewApplication", deployPreviewApplication],
		["rebuildPreviewApplication", rebuildPreviewApplication],
	] as const) {
		describe(name, () => {
			it("starts the service when the preview still exists", async () => {
				mocks.previewDeploymentExists.mockResolvedValue(true);

				await expect(run(job)).resolves.toBe(true);

				expect(mocks.mechanizeDockerContainer).toHaveBeenCalledTimes(1);
				expect(mocks.updatePreviewDeployment).toHaveBeenCalledWith(
					"preview-id",
					{ previewStatus: "done" },
				);
			});

			it("does not start the service once the preview is gone", async () => {
				mocks.previewDeploymentExists.mockResolvedValue(false);

				await expect(run(job)).resolves.toBe(false);

				expect(mocks.mechanizeDockerContainer).not.toHaveBeenCalled();
				expect(mocks.updateDeploymentStatus).not.toHaveBeenCalled();
				expect(mocks.updatePreviewDeployment).not.toHaveBeenCalledWith(
					"preview-id",
					expect.objectContaining({ previewStatus: "done" }),
				);
				expect(mocks.updatePreviewDeployment).not.toHaveBeenCalledWith(
					"preview-id",
					expect.objectContaining({ previewStatus: "error" }),
				);
				// The "running" comment was posted before the build; no success or
				// error comment follows for a preview that no longer exists.
				expect(
					mocks.updateIssueComment.mock.calls.map(
						(call) => (call[0] as { body: string }).body,
					),
				).toEqual(["### Dokploy Preview Deployment\n\nrunning"]);
			});
		});
	}
});
