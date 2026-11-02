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

vi.mock("@dokploy/server/utils/docker/utils", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/utils/docker/utils")
	>("@dokploy/server/utils/docker/utils");
	return { ...actual, removeService: vi.fn() };
});

vi.mock("@dokploy/server/utils/traefik/application", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/utils/traefik/application")
	>("@dokploy/server/utils/traefik/application");
	return { ...actual, removeTraefikConfig: vi.fn() };
});

import { db } from "@dokploy/server/db";
import {
	deployPreviewApplication,
	rebuildPreviewApplication,
} from "@dokploy/server/services/application";
import { createDeploymentPreview } from "@dokploy/server/services/deployment";
import { removePreviewDeployment } from "@dokploy/server/services/preview-deployment";
import {
	getBuildCommand,
	mechanizeDockerContainer,
} from "@dokploy/server/utils/builders";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { cloneGithubRepository } from "@dokploy/server/utils/providers/github";

const buildRegistry = { registryId: "build-reg" };
const registry = { registryId: "swarm-reg" };
const rollbackRegistry = { registryId: "rollback-reg" };

const mockApplication = (overrides: Record<string, unknown> = {}) => ({
	applicationId: "app-1",
	name: "App",
	appName: "app-abc",
	sourceType: "github",
	owner: "Dokploy",
	repository: "examples",
	githubId: "gh-1",
	serverId: "deploy-server",
	buildServerId: "build-server",
	buildRegistry,
	registry,
	rollbackRegistry,
	rollbackActive: true,
	previewEnv: "",
	previewBuildArgs: "",
	previewBuildSecrets: "",
	environment: { project: {} },
	...overrides,
});

const mockPreview = (application: ReturnType<typeof mockApplication>) => ({
	previewDeploymentId: "preview-1",
	applicationId: application.applicationId,
	appName: "preview-app-abc-xyz",
	branch: "feature",
	pullRequestNumber: "1",
	pullRequestCommentId: "1",
	domain: { host: "preview.example.com", https: false },
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

const remoteCalls = () =>
	vi.mocked(execAsyncRemote).mock.calls.map(([serverId, command]) => ({
		serverId,
		command,
	}));

const insertedDeployment = () => {
	const chain = vi.mocked(db.insert).mock.results[0]?.value;
	return chain.values.mock.calls[0][0];
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe("preview deployments with a build server", () => {
	it("clones and builds on the build server and keeps build/swarm registries", async () => {
		setup();

		await deployPreviewApplication({
			applicationId: "app-1",
			titleLog: "Preview",
			descriptionLog: "",
			previewDeploymentId: "preview-1",
		});

		expect(vi.mocked(cloneGithubRepository).mock.calls[0]?.[0]).toMatchObject({
			serverId: "build-server",
			appName: "preview-app-abc-xyz",
			branch: "feature",
		});

		const buildCalls = remoteCalls().filter(({ command }) =>
			command.includes("build;"),
		);
		expect(buildCalls).toHaveLength(1);
		expect(buildCalls[0]?.serverId).toBe("build-server");

		const built = vi.mocked(getBuildCommand).mock.calls[0]?.[0];
		expect(built).toMatchObject({
			appName: "preview-app-abc-xyz",
			buildRegistry,
			registry,
			rollbackRegistry: null,
			rollbackActive: false,
		});

		const deployed = vi.mocked(mechanizeDockerContainer).mock.calls[0]?.[0];
		expect(deployed).toMatchObject({
			serverId: "deploy-server",
			buildRegistry,
			registry,
		});
	});

	it("rebuilds on the build server", async () => {
		setup();

		await rebuildPreviewApplication({
			applicationId: "app-1",
			titleLog: "Rebuild",
			descriptionLog: "",
			previewDeploymentId: "preview-1",
		});

		const buildCalls = remoteCalls().filter(({ command }) =>
			command.includes("build;"),
		);
		expect(buildCalls.map(({ serverId }) => serverId)).toEqual([
			"build-server",
		]);
		expect(
			vi.mocked(mechanizeDockerContainer).mock.calls[0]?.[0],
		).toMatchObject({ serverId: "deploy-server", buildRegistry });
	});

	it("writes the deployment log on the build server and records it", async () => {
		setup();

		await createDeploymentPreview({
			title: "Preview",
			description: "",
			previewDeploymentId: "preview-1",
		});

		expect(remoteCalls()[0]?.serverId).toBe("build-server");
		expect(insertedDeployment()).toMatchObject({
			buildServerId: "build-server",
			previewDeploymentId: "preview-1",
		});
	});

	it("cleans the code and logs on the build server when removing the preview", async () => {
		setup();

		await removePreviewDeployment("preview-1");

		const commands = remoteCalls();
		expect(commands).toContainEqual({
			serverId: "build-server",
			command: expect.stringMatching(
				/rm -rf .*applications\/preview-app-abc-xyz$/,
			),
		});
		expect(commands).toContainEqual({
			serverId: "build-server",
			command: expect.stringMatching(/rm -rf .*logs\/preview-app-abc-xyz$/),
		});
		expect(commands).toContainEqual({
			serverId: "deploy-server",
			command: expect.stringMatching(
				/rm -rf .*applications\/preview-app-abc-xyz$/,
			),
		});
	});
});

describe("preview deployments without a build server", () => {
	it("builds on the deploy server", async () => {
		setup({ buildServerId: null, buildRegistry: null, registry: null });

		await deployPreviewApplication({
			applicationId: "app-1",
			titleLog: "Preview",
			descriptionLog: "",
			previewDeploymentId: "preview-1",
		});

		expect(vi.mocked(cloneGithubRepository).mock.calls[0]?.[0]).toMatchObject({
			serverId: "deploy-server",
		});
		const buildCalls = remoteCalls().filter(({ command }) =>
			command.includes("build;"),
		);
		expect(buildCalls.map(({ serverId }) => serverId)).toEqual([
			"deploy-server",
		]);
	});

	it("builds locally when the app runs on the Dokploy server", async () => {
		setup({ buildServerId: null, serverId: null });

		await deployPreviewApplication({
			applicationId: "app-1",
			titleLog: "Preview",
			descriptionLog: "",
			previewDeploymentId: "preview-1",
		});

		expect(execAsyncRemote).not.toHaveBeenCalled();
		expect(
			vi
				.mocked(execAsync)
				.mock.calls.some(([command]) => command.includes("build;")),
		).toBe(true);
	});

	it("does not record a build server on the deployment", async () => {
		setup({ buildServerId: null });

		await createDeploymentPreview({
			title: "Preview",
			description: "",
			previewDeploymentId: "preview-1",
		});

		expect(remoteCalls()[0]?.serverId).toBe("deploy-server");
		expect(insertedDeployment()).not.toHaveProperty("buildServerId");
	});

	it("only cleans the deploy server when removing the preview", async () => {
		setup({ buildServerId: null });

		await removePreviewDeployment("preview-1");

		expect(
			remoteCalls().every(({ serverId }) => serverId === "deploy-server"),
		).toBe(true);
	});
});
