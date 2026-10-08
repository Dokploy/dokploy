import * as adminService from "@dokploy/server/services/admin";
import * as applicationService from "@dokploy/server/services/application";
import { deployApplication } from "@dokploy/server/services/application";
import * as deploymentService from "@dokploy/server/services/deployment";
import * as builders from "@dokploy/server/utils/builders";
import { encodeBase64 } from "@dokploy/server/utils/docker/utils";
import * as notifications from "@dokploy/server/utils/notifications/build-error";
import { ExecError } from "@dokploy/server/utils/process/ExecError";
import * as execProcess from "@dokploy/server/utils/process/execAsync";
import { runDockerLogin } from "@dokploy/server/utils/process/dockerLogin";
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
				buildPolicySettings: {
					findFirst: vi.fn().mockResolvedValue(undefined),
				},
				applications: { findFirst: vi.fn() },
				deployHook: { findFirst: vi.fn() },
				patch: { findMany: vi.fn().mockResolvedValue([]) },
				member: { findMany: vi.fn().mockResolvedValue([]) },
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
	return { ...actual, getGitCommitInfo: vi.fn() };
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

const PASSWORD = "s3cret-registry-password";
const LOG_PATH = "/tmp/test-deployment.log";

const app = {
	applicationId: "test-app-id",
	name: "Test App",
	appName: "test-app",
	sourceType: "git" as const,
	buildType: "nixpacks" as const,
	env: "",
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
		project: { name: "Test Project", organizationId: "org-id", env: "" },
	},
	domains: [],
};

describe("deployApplication - registry login failure", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(db.query.applications.findFirst).mockResolvedValue(app as any);
		vi.mocked(applicationService.findApplicationById).mockResolvedValue(
			app as any,
		);
		vi.mocked(db.query.deployHook.findFirst).mockResolvedValue(
			undefined as any,
		);
		vi.mocked(adminService.getDokployUrl).mockResolvedValue(
			"http://localhost:3000",
		);
		vi.mocked(deploymentService.createDeployment).mockResolvedValue({
			deploymentId: "deployment-id",
			logPath: LOG_PATH,
		} as any);
		vi.mocked(deploymentService.updateDeploymentStatus).mockResolvedValue(
			undefined as any,
		);
		vi.mocked(deploymentService.updateDeployment).mockResolvedValue({} as any);
		vi.mocked(deploymentService.getDeploymentErrorMessage).mockResolvedValue(
			"error message",
		);
		vi.mocked(applicationService.updateApplicationStatus).mockResolvedValue(
			{} as any,
		);
		vi.mocked(notifications.sendBuildErrorNotifications).mockResolvedValue(
			undefined as any,
		);
		vi.mocked(gitProvider.getGitCommitInfo).mockResolvedValue({
			message: "test commit",
			hash: "abc123",
		});
		// Only the docker login (the call that carries stdin) fails; docker's
		// output is in the error the way a real failed exec reports it.
		vi.mocked(execProcess.execAsync).mockImplementation((async (
			_command: string,
			options?: { stdin?: string },
		) => {
			if (options?.stdin !== undefined) {
				throw new ExecError("Command execution failed: docker login", {
					command: "docker login",
					stderr: `Error response from daemon: unauthorized: bad credentials for ${options.stdin}`,
				});
			}
			return { stdout: "", stderr: "" };
		}) as any);
	});

	it("writes the login failure to the deployment log, without the password", async () => {
		// What getBuildCommand does for an application with a registry: the login
		// runs while the script is generated, so it fails before any script runs.
		vi.mocked(builders.getBuildCommand).mockImplementation(async () => {
			await runDockerLogin(
				{
					registryType: "selfHosted",
					registryUrl: "registry.example.com",
					username: "deployer",
					password: PASSWORD,
				},
				null,
			);
			return "echo build";
		});

		await expect(
			deployApplication({
				applicationId: "test-app-id",
				titleLog: "t",
				descriptionLog: "",
			}),
		).rejects.toThrow(/Registry login failed for registry\.example\.com/);

		const commands = vi
			.mocked(execProcess.execAsync)
			.mock.calls.map(([command]) => command);
		const logWrite = commands.find((command) =>
			command.includes(`>> "${LOG_PATH}"`),
		);
		expect(logWrite).toBeDefined();
		const encoded = /echo "([^"]+)" \| base64 -d/.exec(logWrite as string);
		expect(encoded).not.toBeNull();
		const logged = Buffer.from(encoded?.[1] as string, "base64").toString();
		expect(logged).toContain(
			"Registry login failed for registry.example.com: Error response from daemon: unauthorized",
		);
		expect(logged).not.toContain(PASSWORD);
		expect(logWrite).not.toContain(PASSWORD);
		expect(encodeBase64(logged)).toBe(encoded?.[1]);
		expect(deploymentService.updateDeploymentStatus).toHaveBeenCalledWith(
			"deployment-id",
			"error",
		);
	});
});
