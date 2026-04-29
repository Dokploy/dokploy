import * as adminService from "@dokploy/server/services/admin";
import * as applicationService from "@dokploy/server/services/application";
import { deployApplication } from "@dokploy/server/services/application";
import * as deploymentService from "@dokploy/server/services/deployment";
import * as builders from "@dokploy/server/utils/builders";
import * as hooks from "@dokploy/server/utils/docker/hooks";
import * as notifications from "@dokploy/server/utils/notifications/build-error";
import * as successNotifications from "@dokploy/server/utils/notifications/build-success";
import * as execProcess from "@dokploy/server/utils/process/execAsync";
import * as gitProvider from "@dokploy/server/utils/providers/git";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/db", () => {
	const createChainableMock = (): any => {
		const chain = {
			set: vi.fn(() => chain),
			where: vi.fn(() => chain),
			returning: vi.fn().mockResolvedValue([{}] as any),
			from: vi.fn(() => chain),
			innerJoin: vi.fn(() => chain),
			then: (resolve: (v: any) => void) => {
				resolve([]);
			},
		} as any;
		return chain;
	};

	return {
		db: {
			select: vi.fn(() => createChainableMock()),
			insert: vi.fn(),
			update: vi.fn(() => createChainableMock()),
			delete: vi.fn(),
			query: {
				applications: {
					findFirst: vi.fn(),
				},
				patch: {
					findMany: vi.fn().mockResolvedValue([]),
				},
				member: {
					findMany: vi.fn().mockResolvedValue([]),
				},
			},
		},
	};
});

vi.mock("@dokploy/server/services/application", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/services/application")
	>("@dokploy/server/services/application");
	return {
		...actual,
		findApplicationById: vi.fn(),
		updateApplicationStatus: vi.fn(),
	};
});

vi.mock("@dokploy/server/services/admin", () => ({
	getDokployUrl: vi.fn(),
}));

vi.mock("@dokploy/server/services/deployment", () => ({
	createDeployment: vi.fn(),
	updateDeploymentStatus: vi.fn(),
	updateDeployment: vi.fn(),
}));

vi.mock("@dokploy/server/utils/providers/git", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/utils/providers/git")
	>("@dokploy/server/utils/providers/git");
	return {
		...actual,
		getGitCommitInfo: vi.fn(),
	};
});

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	ExecError: class ExecError extends Error {},
}));

vi.mock("@dokploy/server/utils/builders", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/utils/builders")
	>("@dokploy/server/utils/builders");
	return {
		...actual,
		mechanizeDockerContainer: vi.fn(),
		getBuildCommand: vi.fn(),
	};
});

vi.mock("@dokploy/server/utils/docker/hooks", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/utils/docker/hooks")
	>("@dokploy/server/utils/docker/hooks");
	return {
		...actual,
		runDeployHook: vi.fn(),
		waitForSwarmServiceRunning: vi.fn(),
	};
});

vi.mock("@dokploy/server/utils/notifications/build-success", () => ({
	sendBuildSuccessNotifications: vi.fn(),
}));

vi.mock("@dokploy/server/utils/notifications/build-error", () => ({
	sendBuildErrorNotifications: vi.fn(),
}));

vi.mock("@dokploy/server/services/rollbacks", () => ({
	createRollback: vi.fn(),
}));

import { db } from "@dokploy/server/db";

const createMockApplication = (overrides = {}) => ({
	applicationId: "test-app-id",
	name: "Test App",
	appName: "test-app",
	sourceType: "git" as const,
	customGitUrl: "https://github.com/Dokploy/examples.git",
	customGitBranch: "main",
	customGitSSHKeyId: null,
	buildType: "nixpacks" as const,
	buildPath: "/astro",
	env: "NODE_ENV=production",
	serverId: null,
	rollbackActive: false,
	enableSubmodules: false,
	environmentId: "env-id",
	deployHooks: null,
	environment: {
		projectId: "project-id",
		env: "",
		name: "production",
		project: {
			name: "Test Project",
			organizationId: "org-id",
			env: "",
		},
	},
	domains: [],
	...overrides,
});

const createMockDeployment = () => ({
	deploymentId: "deployment-id",
	logPath: "/tmp/test-deployment.log",
});

const primeMocks = (app = createMockApplication()) => {
	vi.mocked(db.query.applications.findFirst).mockResolvedValue(app as any);
	vi.mocked(applicationService.findApplicationById).mockResolvedValue(
		app as any,
	);
	vi.mocked(adminService.getDokployUrl).mockResolvedValue(
		"http://localhost:3000",
	);
	vi.mocked(deploymentService.createDeployment).mockResolvedValue(
		createMockDeployment() as any,
	);
	vi.mocked(execProcess.execAsync).mockResolvedValue({
		stdout: "",
		stderr: "",
	} as any);
	vi.mocked(execProcess.execAsyncRemote).mockResolvedValue({
		stdout: "",
		stderr: "",
	} as any);
	vi.mocked(builders.getBuildCommand).mockResolvedValue("echo build");
	vi.mocked(builders.mechanizeDockerContainer).mockResolvedValue(
		undefined as any,
	);
	vi.mocked(deploymentService.updateDeploymentStatus).mockResolvedValue(
		undefined as any,
	);
	vi.mocked(applicationService.updateApplicationStatus).mockResolvedValue(
		{} as any,
	);
	vi.mocked(
		successNotifications.sendBuildSuccessNotifications,
	).mockResolvedValue(undefined as any);
	vi.mocked(notifications.sendBuildErrorNotifications).mockResolvedValue(
		undefined as any,
	);
	vi.mocked(gitProvider.getGitCommitInfo).mockResolvedValue({
		message: "test commit",
		hash: "abc123",
	});
	vi.mocked(deploymentService.updateDeployment).mockResolvedValue({} as any);
	vi.mocked(hooks.runDeployHook).mockResolvedValue(undefined as any);
	vi.mocked(hooks.waitForSwarmServiceRunning).mockResolvedValue(
		"container-id-abc",
	);
};

describe("deployApplication - Deploy Hooks", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("invokes pre-deploy hook before mechanizeDockerContainer", async () => {
		const order: string[] = [];
		primeMocks(
			createMockApplication({
				deployHooks: JSON.stringify({ pre: "echo pre" }),
			}),
		);
		vi.mocked(hooks.runDeployHook).mockImplementation(async ({ kind }) => {
			order.push(`hook:${kind}`);
		});
		vi.mocked(builders.mechanizeDockerContainer).mockImplementation(
			async () => {
				order.push("mechanize");
			},
		);

		await deployApplication({
			applicationId: "test-app-id",
			titleLog: "t",
			descriptionLog: "",
		});

		expect(hooks.runDeployHook).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "pre",
				appName: "test-app",
				serverId: null,
				command: "echo pre",
				logPath: "/tmp/test-deployment.log",
			}),
		);
		expect(order[0]).toBe("hook:pre");
		expect(order[1]).toBe("mechanize");
	});

	it("invokes post-deploy hook after mechanizeDockerContainer and after waitForSwarmServiceRunning", async () => {
		const order: string[] = [];
		primeMocks(
			createMockApplication({
				deployHooks: JSON.stringify({ post: "npm run migrate" }),
			}),
		);
		vi.mocked(builders.mechanizeDockerContainer).mockImplementation(
			async () => {
				order.push("mechanize");
			},
		);
		vi.mocked(hooks.waitForSwarmServiceRunning).mockImplementation(async () => {
			order.push("wait");
			return "container-id-abc";
		});
		vi.mocked(hooks.runDeployHook).mockImplementation(async ({ kind }) => {
			order.push(`hook:${kind}`);
		});

		await deployApplication({
			applicationId: "test-app-id",
			titleLog: "t",
			descriptionLog: "",
		});

		expect(order).toEqual(["hook:pre", "mechanize", "wait", "hook:post"]);
		expect(hooks.runDeployHook).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "post",
				command: "npm run migrate",
				containerId: "container-id-abc",
			}),
		);
	});

	it("skips waitForSwarmServiceRunning when postDeployCommand is empty", async () => {
		primeMocks(
			createMockApplication({
				deployHooks: null,
			}),
		);

		await deployApplication({
			applicationId: "test-app-id",
			titleLog: "t",
			descriptionLog: "",
		});

		expect(hooks.waitForSwarmServiceRunning).not.toHaveBeenCalled();
		const postCalls = vi
			.mocked(hooks.runDeployHook)
			.mock.calls.filter(([arg]) => arg.kind === "post");
		expect(postCalls).toHaveLength(0);
	});

	it("always invokes pre-deploy hook (runDeployHook handles empty command internally)", async () => {
		primeMocks(
			createMockApplication({
				deployHooks: null,
			}),
		);

		await deployApplication({
			applicationId: "test-app-id",
			titleLog: "t",
			descriptionLog: "",
		});

		expect(hooks.runDeployHook).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "pre" }),
		);
	});

	it("marks deployment as error when pre-deploy hook throws", async () => {
		primeMocks(
			createMockApplication({
				deployHooks: JSON.stringify({ pre: "exit 1" }),
			}),
		);
		vi.mocked(hooks.runDeployHook).mockRejectedValueOnce(
			new Error("pre-deploy failed"),
		);

		await expect(
			deployApplication({
				applicationId: "test-app-id",
				titleLog: "t",
				descriptionLog: "",
			}),
		).rejects.toThrow("pre-deploy failed");

		expect(builders.mechanizeDockerContainer).not.toHaveBeenCalled();
		expect(deploymentService.updateDeploymentStatus).toHaveBeenCalledWith(
			"deployment-id",
			"error",
		);
		expect(notifications.sendBuildErrorNotifications).toHaveBeenCalled();
	});

	it("marks deployment as error when post-deploy hook throws", async () => {
		primeMocks(
			createMockApplication({
				deployHooks: JSON.stringify({ post: "exit 1" }),
			}),
		);
		vi.mocked(hooks.runDeployHook).mockImplementation(async ({ kind }) => {
			if (kind === "post") throw new Error("post-deploy failed");
		});

		await expect(
			deployApplication({
				applicationId: "test-app-id",
				titleLog: "t",
				descriptionLog: "",
			}),
		).rejects.toThrow("post-deploy failed");

		expect(deploymentService.updateDeploymentStatus).toHaveBeenCalledWith(
			"deployment-id",
			"error",
		);
	});

	it("passes serverId through for remote deploys", async () => {
		primeMocks(
			createMockApplication({
				serverId: "remote-server-id",
				deployHooks: JSON.stringify({ pre: "echo pre", post: "echo post" }),
			}),
		);

		await deployApplication({
			applicationId: "test-app-id",
			titleLog: "t",
			descriptionLog: "",
		});

		expect(hooks.runDeployHook).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "pre",
				serverId: "remote-server-id",
			}),
		);
		expect(hooks.waitForSwarmServiceRunning).toHaveBeenCalledWith(
			"test-app",
			"remote-server-id",
		);
		expect(hooks.runDeployHook).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "post",
				serverId: "remote-server-id",
			}),
		);
	});
});
