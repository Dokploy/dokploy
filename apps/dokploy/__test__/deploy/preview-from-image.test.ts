import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/db", () => {
	const chain: any = {
		set: vi.fn(() => chain),
		values: vi.fn(() => chain),
		where: vi.fn(() => chain),
		returning: vi.fn().mockResolvedValue([{ deploymentId: "dep-1" }]),
	};
	return {
		db: {
			insert: vi.fn(() => chain),
			update: vi.fn(() => chain),
			delete: vi.fn(() => chain),
			query: {
				applications: { findFirst: vi.fn() },
				previewDeployments: { findFirst: vi.fn() },
				deployments: { findMany: vi.fn().mockResolvedValue([]) },
			},
		},
	};
});

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	ExecError: class ExecError extends Error {},
}));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: vi.fn(async (serverId: string) => ({ serverId })),
}));

vi.mock("@dokploy/server/services/github", () => ({
	issueCommentExists: vi.fn().mockResolvedValue(true),
	createPreviewDeploymentComment: vi.fn(),
	getIssueComment: vi.fn().mockReturnValue(""),
	updateIssueComment: vi.fn(),
	findGithubById: vi.fn(),
}));

vi.mock("@dokploy/server/utils/providers/github", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/utils/providers/github")
	>("@dokploy/server/utils/providers/github");
	return {
		...actual,
		cloneGithubRepository: vi.fn().mockResolvedValue("clone;"),
	};
});

vi.mock("@dokploy/server/utils/builders", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/utils/builders")
	>("@dokploy/server/utils/builders");
	return {
		...actual,
		getBuildCommand: vi.fn().mockResolvedValue("build;"),
		mechanizeDockerContainer: vi.fn(),
	};
});

import { db } from "@dokploy/server/db";
import {
	deployPreviewApplication,
	rebuildPreviewApplication,
} from "@dokploy/server/services/application";
import {
	issueCommentExists,
	updateIssueComment,
} from "@dokploy/server/services/github";
import { mechanizeDockerContainer } from "@dokploy/server/utils/builders";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { cloneGithubRepository } from "@dokploy/server/utils/providers/github";

const APP_IMAGE = "ghcr.io/acme/web:latest";
const PREVIEW_IMAGE = "ghcr.io/acme/web:pr-7";

const mockApplication = (overrides: Record<string, unknown> = {}) => ({
	applicationId: "app-1",
	name: "Web",
	appName: "web-abc",
	sourceType: "docker",
	dockerImage: APP_IMAGE,
	username: null,
	password: null,
	registryUrl: null,
	githubId: null,
	owner: null,
	repository: null,
	serverId: "deploy-server",
	buildServerId: null,
	registry: null,
	buildRegistry: null,
	rollbackRegistry: null,
	rollbackActive: false,
	previewEnv: "API_URL=https://staging.example.com",
	previewBuildArgs: "",
	previewBuildSecrets: "",
	environment: { project: {} },
	...overrides,
});

const mockPreview = (application: ReturnType<typeof mockApplication>) => ({
	previewDeploymentId: "preview-1",
	applicationId: application.applicationId,
	appName: "preview-web-abc-xyz",
	branch: "",
	dockerImage: PREVIEW_IMAGE,
	pullRequestNumber: "7",
	pullRequestCommentId: "",
	domain: { host: "pr-7.preview.example.com", https: true },
	application: {
		applicationId: application.applicationId,
		serverId: application.serverId,
		buildServerId: application.buildServerId,
	},
});

const setup = (overrides: Record<string, unknown> = {}) => {
	const application = mockApplication(overrides);
	vi.mocked(db.query.applications.findFirst).mockResolvedValue(
		application as any,
	);
	vi.mocked(db.query.previewDeployments.findFirst).mockResolvedValue(
		mockPreview(application) as any,
	);
	return application;
};

const deployCommands = () =>
	vi
		.mocked(execAsyncRemote)
		.mock.calls.map(([, command]) => command)
		.filter((command) => command.includes("build;"));

const previewStatuses = () => {
	const chain = vi.mocked(db.update).mock.results[0]?.value;
	return chain.set.mock.calls
		.map(([values]: [Record<string, unknown>]) => values.previewStatus)
		.filter(Boolean);
};

const runners = [
	["deploy", deployPreviewApplication],
	["rebuild", rebuildPreviewApplication],
] as const;

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(execAsyncRemote).mockReset();
});

describe.each(runners)("%s of a preview built from an image", (_, run) => {
	const runPreview = () =>
		run({
			applicationId: "app-1",
			titleLog: "Preview",
			descriptionLog: "",
			previewDeploymentId: "preview-1",
		});

	it("pulls the preview image instead of cloning the repository", async () => {
		setup();

		await runPreview();

		expect(cloneGithubRepository).not.toHaveBeenCalled();
		const [command] = deployCommands();
		expect(command).toContain("docker pull");
		expect(command).toContain(PREVIEW_IMAGE);
		expect(command).not.toContain(APP_IMAGE);
	});

	it("runs the preview service with the preview image and preview env", async () => {
		setup();

		await runPreview();

		const deployed = vi.mocked(mechanizeDockerContainer).mock.calls[0]?.[0];
		expect(deployed).toMatchObject({
			appName: "preview-web-abc-xyz",
			dockerImage: PREVIEW_IMAGE,
			serverId: "deploy-server",
		});
		expect(deployed?.env).toContain("API_URL=https://staging.example.com");
		expect(deployed?.env).toContain(
			"DOKPLOY_DEPLOY_URL=pr-7.preview.example.com",
		);
		expect(previewStatuses()).toContain("done");
	});

	it("does not call GitHub when the application has no GitHub provider", async () => {
		setup();

		await runPreview();

		expect(issueCommentExists).not.toHaveBeenCalled();
		expect(updateIssueComment).not.toHaveBeenCalled();
	});

	it("comments on the pull request when a GitHub provider is linked", async () => {
		setup({ githubId: "gh-1", owner: "acme", repository: "web" });

		await runPreview();

		expect(issueCommentExists).toHaveBeenCalled();
		expect(vi.mocked(updateIssueComment).mock.calls.at(-1)?.[0]).toMatchObject({
			githubId: "gh-1",
			issue_number: "7",
		});
	});

	it("marks the preview as failed without GitHub when the pull fails", async () => {
		setup();
		vi.mocked(execAsyncRemote).mockImplementation(async (_, command) => {
			if (command.includes("docker pull")) {
				throw new Error("pull access denied");
			}
			return { stdout: "", stderr: "" };
		});

		await expect(runPreview()).rejects.toThrow("pull access denied");

		expect(previewStatuses()).toContain("error");
		expect(updateIssueComment).not.toHaveBeenCalled();
		expect(mechanizeDockerContainer).not.toHaveBeenCalled();
	});

	it("fails instead of running the application image when the preview has none", async () => {
		const application = setup();
		vi.mocked(db.query.previewDeployments.findFirst).mockResolvedValue({
			...mockPreview(application),
			dockerImage: null,
		} as any);

		await expect(runPreview()).rejects.toThrow("Docker image not found");

		expect(mechanizeDockerContainer).not.toHaveBeenCalled();
	});

	it("pulls locally when the application runs on the Dokploy server", async () => {
		setup({ serverId: null });

		await runPreview();

		expect(execAsyncRemote).not.toHaveBeenCalled();
		expect(
			vi
				.mocked(execAsync)
				.mock.calls.some(([command]) => command.includes(PREVIEW_IMAGE)),
		).toBe(true);
	});
});
