import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/db", () => {
	const chain: any = {
		set: () => chain,
		where: () => chain,
		returning: async () => [{}],
	};
	return {
		db: {
			update: () => chain,
			query: {
				applications: { findFirst: vi.fn() },
				notifications: { findMany: vi.fn() },
			},
		},
	};
});

vi.mock("@dokploy/server/services/admin", () => ({
	getDokployUrl: async () => "https://dokploy.example.com",
}));

vi.mock("@dokploy/server/services/deployment", () => ({
	createDeployment: async () => ({
		deploymentId: "deploy-1",
		logPath: "/tmp/build.log",
	}),
	updateDeployment: vi.fn(),
	updateDeploymentStatus: vi.fn(),
	writeDeploymentErrorLog: vi.fn(),
}));

vi.mock("@dokploy/server/utils/builders", () => ({
	getBuildCommand: async () => "echo build;",
	mechanizeDockerContainer: vi.fn(),
}));

vi.mock("@dokploy/server/services/patch", () => ({
	generateApplyPatchesCommand: async () => "",
}));

vi.mock("@dokploy/server/utils/providers/github", () => ({
	cloneGithubRepository: async () => "echo clone;",
}));
vi.mock("@dokploy/server/utils/providers/gitlab", () => ({
	cloneGitlabRepository: async () => "echo clone;",
}));
vi.mock("@dokploy/server/utils/providers/gitea", () => ({
	cloneGiteaRepository: async () => "echo clone;",
}));
vi.mock("@dokploy/server/utils/providers/bitbucket", () => ({
	cloneBitbucketRepository: async () => "echo clone;",
}));
vi.mock("@dokploy/server/utils/providers/docker", () => ({
	buildRemoteDocker: async () => "echo pull;",
}));
vi.mock("@dokploy/server/utils/providers/git", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/utils/providers/git")
	>("@dokploy/server/utils/providers/git");
	return { ...actual, cloneGitRepository: async () => "echo clone;" };
});
vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

import { db } from "@dokploy/server/db";
import {
	deployApplication,
	rebuildApplication,
} from "@dokploy/server/services/application";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";

const hash = "1234567890abcdef1234567890abcdef12345678";
const fetchMock = vi.fn();
let failBuild = false;
let failClone = false;
let missingCheckout = false;

const application = {
	applicationId: "app-1",
	appName: "web-abc",
	name: "Web",
	sourceType: "github",
	owner: "acme",
	repository: "web",
	branch: "release",
	gitlabOwner: "acme",
	gitlabRepository: "web",
	gitlabPathNamespace: "acme/team/web",
	gitlabBranch: "gitlab-release",
	giteaOwner: "gitea-org",
	giteaRepository: "site",
	giteaBranch: "gitea-release",
	bitbucketOwner: "workspace",
	bitbucketRepository: "Display Name",
	bitbucketRepositorySlug: "web-slug",
	bitbucketBranch: "bitbucket-release",
	customGitUrl: "https://git.example.com/team/site.git",
	customGitBranch: "custom-release",
	serverId: null,
	buildServerId: null,
	environmentId: "env-1",
	environment: {
		projectId: "project-1",
		name: "production",
		project: { name: "Project", organizationId: "org-1" },
	},
	domains: [],
};

const deploy = (rebuild = false) =>
	(rebuild ? rebuildApplication : deployApplication)({
		applicationId: "app-1",
		titleLog: "Deploy",
		descriptionLog: "",
	});

const payload = () => JSON.parse(fetchMock.mock.calls[0]?.[1].body);

beforeEach(() => {
	vi.clearAllMocks();
	failBuild = false;
	failClone = false;
	missingCheckout = false;
	vi.stubGlobal("fetch", fetchMock.mockResolvedValue({ ok: true }));
	vi.mocked(db.query.applications.findFirst).mockResolvedValue({
		...application,
	} as any);
	vi.mocked(db.query.notifications.findMany).mockResolvedValue([
		{ custom: { endpoint: "https://receiver.example.com/build" } },
	] as any);
	const execute = async (command: string) => {
		if (command.includes("git -C")) {
			if (missingCheckout) throw new Error("No checkout");
			return {
				stdout: `${hash}---DELIMITER---Ship release\n\nDetails`,
				stderr: "",
			};
		}
		if (failClone && command.includes("echo clone")) {
			throw new Error("Clone failed");
		}
		if (failBuild && command.includes("echo build")) {
			throw new Error("Build failed");
		}
		return { stdout: "", stderr: "" };
	};
	vi.mocked(execAsync).mockImplementation(execute as any);
	vi.mocked(execAsyncRemote).mockImplementation(((
		_serverId: string,
		command: string,
	) => execute(command)) as any);
});

describe("application build webhook payloads", () => {
	it.each([
		["github", "release", "acme/web"],
		["gitlab", "gitlab-release", "acme/team/web"],
		["gitea", "gitea-release", "gitea-org/site"],
		["bitbucket", "bitbucket-release", "workspace/web-slug"],
		["git", "custom-release", "https://git.example.com/team/site.git"],
	])(
		"includes the checked-out commit and %s source",
		async (sourceType, branch, repository) => {
			vi.mocked(db.query.applications.findFirst).mockResolvedValue({
				...application,
				sourceType,
			} as any);
			await deploy();
			expect(payload()).toMatchObject({
				status: "success",
				applicationId: "app-1",
				environmentName: "production",
				commitHash: hash,
				commitMessage: "Ship release",
				branch,
				repository,
			});
		},
	);

	it("includes the built commit on failure", async () => {
		failBuild = true;
		await expect(deploy()).rejects.toThrow("Build failed");
		expect(payload()).toMatchObject({
			status: "error",
			applicationId: "app-1",
			environmentName: "production",
			commitHash: hash,
			commitMessage: "Ship release",
			branch: "release",
			repository: "acme/web",
		});
	});

	it("reads the checkout on the build server, not the deployment server", async () => {
		vi.mocked(db.query.applications.findFirst).mockResolvedValue({
			...application,
			serverId: "deployment-server",
			buildServerId: "build-server",
		} as any);
		vi.mocked(execAsync).mockRejectedValue(new Error("No local checkout"));
		const executeRemote = vi.mocked(execAsyncRemote).getMockImplementation()!;
		vi.mocked(execAsyncRemote).mockImplementation((serverId, command) => {
			if (serverId !== "build-server") {
				return Promise.reject(new Error("No checkout on deployment server"));
			}
			return executeRemote(serverId, command);
		});
		await deploy();
		expect(payload().commitHash).toBe(hash);
	});

	it("keeps the captured commit even if HEAD changes during the build", async () => {
		const execute = vi.mocked(execAsync).getMockImplementation()!;
		let buildStarted = false;
		vi.mocked(execAsync).mockImplementation((command, options) => {
			if (command.includes("echo build")) buildStarted = true;
			if (buildStarted && command.includes("git -C")) {
				return Promise.resolve({
					stdout: `${"f".repeat(40)}---DELIMITER---Next release`,
					stderr: "",
				});
			}
			return execute(command, options);
		});
		await deploy();
		expect(payload().commitHash).toBe(hash);
	});

	it("does not report an old checkout when cloning fails", async () => {
		failClone = true;
		await expect(deploy()).rejects.toThrow("Clone failed");
		expect(payload().commitHash ?? null).toBeNull();
		expect(payload().commitMessage ?? null).toBeNull();
	});

	it.each([false, true])(
		"includes the existing commit for a rebuild (failure: %s)",
		async (failure) => {
			failBuild = failure;
			if (failure) await expect(deploy(true)).rejects.toThrow("Build failed");
			else await deploy(true);
			expect(payload()).toMatchObject({
				status: failure ? "error" : "success",
				commitHash: hash,
				commitMessage: "Ship release",
			});
		},
	);

	it("omits Git metadata for Docker images even with old source settings", async () => {
		vi.mocked(db.query.applications.findFirst).mockResolvedValue({
			...application,
			sourceType: "docker",
		} as any);
		await deploy();
		for (const field of [
			"commitHash",
			"commitMessage",
			"branch",
			"repository",
		]) {
			expect(payload()[field] ?? null).toBeNull();
		}
	});

	it("still notifies when commit metadata cannot be read", async () => {
		missingCheckout = true;
		await deploy();
		expect(payload().status).toBe("success");
		expect(payload().commitHash ?? null).toBeNull();
	});
});
