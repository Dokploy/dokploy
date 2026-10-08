import * as adminService from "@dokploy/server/services/admin";
import * as applicationService from "@dokploy/server/services/application";
import {
	deployApplication,
	rebuildApplication,
} from "@dokploy/server/services/application";
import * as deploymentService from "@dokploy/server/services/deployment";
import * as builders from "@dokploy/server/utils/builders";
import * as hooks from "@dokploy/server/utils/docker/hooks";
import * as dockerUtils from "@dokploy/server/utils/docker/utils";
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
				// build-policy: the deploy path resolves org policy settings first.
				// No row means the policy is off, which is the default.
				buildPolicySettings: {
					findFirst: vi.fn().mockResolvedValue(undefined),
				},
				applications: {
					findFirst: vi.fn(),
				},
				// the cancel flag (deployment-cancel.ts)
				deployments: {
					findFirst: vi.fn().mockResolvedValue({ status: "running" }),
				},
				deployHook: {
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
	getDeploymentErrorMessage: vi.fn(),
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
	};
});

vi.mock("@dokploy/server/utils/docker/utils", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/utils/docker/utils")
	>("@dokploy/server/utils/docker/utils");
	return {
		...actual,
		waitForSwarmServiceStable: vi.fn(),
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
	buildServerId: null,
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
	// Hooks are stored in the deploy_hook side table (not an application column),
	// so route the mock application's deployHooks value through that query.
	vi.mocked(db.query.deployHook.findFirst).mockResolvedValue(
		(app as any).deployHooks != null
			? ({ hooks: (app as any).deployHooks } as any)
			: (undefined as any),
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
	vi.mocked(deploymentService.getDeploymentErrorMessage).mockResolvedValue(
		"error message",
	);
	vi.mocked(hooks.runDeployHook).mockResolvedValue(undefined as any);
	vi.mocked(dockerUtils.waitForSwarmServiceStable).mockResolvedValue({
		stable: true,
	} as any);
};


/**
 * Cancelling an application deployment that builds on a build server
 * (deployment-cancel.ts): the build script is launched cancelable, a cancel
 * ends the deployment as `cancelled` (never `error`, no notification, never
 * pulled or started on the serving host), and everything without a build server
 * is exactly what it was.
 */
const BUILD_SERVER = "build-server-id";
const APP_SERVER = "app-server-id";

const onBuildServer = () => ({
	...createMockDeployment(),
	serverId: APP_SERVER,
	buildServerId: BUILD_SERVER,
});

const cancelFlag = (status: string) =>
	vi
		.mocked(db.query.deployments.findFirst)
		.mockResolvedValue({ status } as any);

describe.each([
	["deployApplication", deployApplication],
	["rebuildApplication", rebuildApplication],
])("%s - cancelling a build on a build server", (_name, run) => {
	beforeEach(() => {
		vi.clearAllMocks();
		primeMocks(
			createMockApplication({
				serverId: APP_SERVER,
				buildServerId: BUILD_SERVER,
			}),
		);
		cancelFlag("running");
		vi.mocked(deploymentService.createDeployment).mockResolvedValue(
			onBuildServer() as any,
		);
	});

	const args = { applicationId: "test-app-id", titleLog: "t", descriptionLog: "" };

	it("launches the build script cancelable, for this deployment only", async () => {
		await run(args);

		expect(execProcess.execAsyncRemote).toHaveBeenCalledWith(
			BUILD_SERVER,
			expect.stringContaining("/tmp/test-deployment.log"),
			undefined,
			{
				cancelable: {
					pidFile: "/etc/dokploy/logs/.build-pids/deployment-id.pid",
					deploymentId: "deployment-id",
				},
			},
		);
		expect(builders.mechanizeDockerContainer).toHaveBeenCalledTimes(1);
	});

	it("ends cancelled, without error status or notification, when the cancel drops the build", async () => {
		vi.mocked(execProcess.execAsyncRemote).mockImplementation(async () => {
			cancelFlag("cancelled");
			throw new Error("Remote build was cancelled: cancelled by user");
		});

		const outcome = await run(args).catch((error) => error);

		expect(outcome).toMatchObject({ deploymentCancelled: true });
		expect(deploymentService.updateDeploymentStatus).not.toHaveBeenCalled();
		expect(applicationService.updateApplicationStatus).not.toHaveBeenCalledWith(
			"test-app-id",
			"error",
		);
		expect(notifications.sendBuildErrorNotifications).not.toHaveBeenCalled();
		expect(builders.mechanizeDockerContainer).not.toHaveBeenCalled();
	});

	it("does not start the container when the cancel lands after the build script finished", async () => {
		vi.mocked(execProcess.execAsyncRemote).mockImplementation(async () => {
			cancelFlag("cancelled");
			return { stdout: "", stderr: "" } as any;
		});

		const outcome = await run(args).catch((error) => error);

		expect(outcome).toMatchObject({ deploymentCancelled: true });
		expect(builders.mechanizeDockerContainer).not.toHaveBeenCalled();
		expect(deploymentService.updateDeploymentStatus).not.toHaveBeenCalledWith(
			"deployment-id",
			"done",
		);
	});

	it("does not replace the container when the cancel lands during the pre-deploy hook", async () => {
		vi.mocked(hooks.runDeployHook).mockImplementation((async (options: {
			kind: string;
		}) => {
			if (options.kind === "pre") cancelFlag("cancelled");
		}) as any);

		const outcome = await run(args).catch((error) => error);

		expect(outcome).toMatchObject({ deploymentCancelled: true });
		expect(builders.mechanizeDockerContainer).not.toHaveBeenCalled();
		expect(deploymentService.updateDeploymentStatus).not.toHaveBeenCalledWith(
			"deployment-id",
			"done",
		);
	});

	it("does not run the pre-deploy hook for a deployment cancelled right after the build", async () => {
		vi.mocked(execProcess.execAsyncRemote).mockImplementation(async () => {
			cancelFlag("cancelled");
			return { stdout: "", stderr: "" } as any;
		});

		await run(args).catch(() => {});

		expect(hooks.runDeployHook).not.toHaveBeenCalled();
	});

	describe("a cancel during the container swap", () => {
		// The final write is conditional: a cancelled row matches nothing.
		let allSets: Array<Record<string, unknown>> = [];
		const finishRowsOf = (rows: unknown[]) => {
			const writes: Array<Record<string, unknown>> = [];
			allSets = [];
			vi.mocked(db.update).mockImplementation((() => {
				let values: Record<string, unknown> = {};
				const chain: any = {
					set: (next: Record<string, unknown>) => {
						values = next;
						allSets.push(next);
						return chain;
					},
					where: () => chain,
					returning: () => {
						if (values.status === "done") {
							writes.push(values);
							return Promise.resolve(rows);
						}
						return Promise.resolve([{}]);
					},
					then: (resolve: (v: unknown) => void) => resolve([]),
				};
				return chain;
			}) as any);
			return writes;
		};

		it("stays cancelled instead of being overwritten by done, and announces no success", async () => {
			const writes = finishRowsOf([]);
			vi.spyOn(console, "error").mockImplementation(() => {});

			await run(args);

			expect(builders.mechanizeDockerContainer).toHaveBeenCalledTimes(1);
			expect(writes).toHaveLength(1);
			expect(deploymentService.updateDeploymentStatus).not.toHaveBeenCalledWith(
				"deployment-id",
				"done",
			);
			// The new release is running, so the service reflects that.
			expect(allSets).toContainEqual({ applicationStatus: "done" });
			expect(
				successNotifications.sendBuildSuccessNotifications,
			).not.toHaveBeenCalled();
		});

		it("an uncancelled deployment is marked done and announced", async () => {
			const writes = finishRowsOf([{ deploymentId: "deployment-id" }]);

			await run(args);

			expect(writes).toHaveLength(1);
			expect(
				successNotifications.sendBuildSuccessNotifications,
			).toHaveBeenCalledTimes(1);
		});
	});

	it("never starts a build for a deployment cancelled while it waited", async () => {
		cancelFlag("cancelled");

		const outcome = await run(args).catch((error) => error);

		expect(outcome).toMatchObject({ deploymentCancelled: true });
		expect(execProcess.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("a real build failure on the build server is still an error", async () => {
		vi.mocked(execProcess.execAsyncRemote).mockRejectedValueOnce(
			new Error("docker build failed"),
		);

		await expect(run(args)).rejects.toThrow("docker build failed");

		expect(deploymentService.updateDeploymentStatus).toHaveBeenCalledWith(
			"deployment-id",
			"error",
		);
	});
});

describe.each([
	["deployApplication", deployApplication],
	["rebuildApplication", rebuildApplication],
])("%s - without a build server", (_name, run) => {
	beforeEach(() => {
		vi.clearAllMocks();
		primeMocks(createMockApplication({ serverId: APP_SERVER }));
		vi.mocked(deploymentService.createDeployment).mockResolvedValue({
			...createMockDeployment(),
			serverId: APP_SERVER,
			buildServerId: null,
		} as any);
	});

	it("sends the build script exactly as before (two arguments) and never reads the cancel flag", async () => {
		await run({ applicationId: "test-app-id", titleLog: "t", descriptionLog: "" });

		expect(execProcess.execAsyncRemote).toHaveBeenCalledTimes(1);
		const call = vi.mocked(execProcess.execAsyncRemote).mock.calls[0]!;
		expect(call).toHaveLength(2);
		expect(call[0]).toBe(APP_SERVER);
		expect(db.query.deployments.findFirst).not.toHaveBeenCalled();
	});

	it("a failed build keeps the old failure path, whatever the cancel flag says", async () => {
		cancelFlag("cancelled");
		vi.mocked(execProcess.execAsyncRemote).mockRejectedValueOnce(
			new Error("docker build failed"),
		);

		await expect(
			run({ applicationId: "test-app-id", titleLog: "t", descriptionLog: "" }),
		).rejects.toThrow("docker build failed");

		expect(deploymentService.updateDeploymentStatus).toHaveBeenCalledWith(
			"deployment-id",
			"error",
		);
	});
});
