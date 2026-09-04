import * as adminService from "@dokploy/server/services/admin";
import * as applicationService from "@dokploy/server/services/application";
import { rebuildApplication } from "@dokploy/server/services/application";
import * as deploymentService from "@dokploy/server/services/deployment";
import * as builders from "@dokploy/server/utils/builders";
import * as notifications from "@dokploy/server/utils/notifications/build-success";
import * as execProcess from "@dokploy/server/utils/process/execAsync";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/db", () => {
	const createChainableMock = (): any => {
		const chain = {
			set: vi.fn(() => chain),
			where: vi.fn(() => chain),
			returning: vi.fn().mockResolvedValue([{}] as any),
			from: vi.fn(() => chain),
			innerJoin: vi.fn(() => chain),
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

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
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

const createMockApplication = (overrides = {}) => ({
	applicationId: "test-app-id",
	name: "Test App",
	appName: "test-app",
	sourceType: "docker",
	dockerImage: "nginx:latest",
	username: null,
	password: null,
	registryUrl: null,
	registry: null,
	buildRegistry: null,
	rollbackRegistry: null,
	rollbackActive: false,
	serverId: null,
	buildServerId: null,
	buildType: "nixpacks",
	env: null,
	environmentId: "env-id",
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
	logPath: "/tmp/test-rebuild.log",
});

describe("rebuildApplication - docker image cache seeding", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(db.query.applications.findFirst).mockResolvedValue(
			createMockApplication() as any,
		);
		vi.mocked(applicationService.findApplicationById).mockResolvedValue(
			createMockApplication() as any,
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
		vi.mocked(builders.mechanizeDockerContainer).mockResolvedValue(
			undefined as any,
		);
		vi.mocked(deploymentService.updateDeploymentStatus).mockResolvedValue(
			undefined as any,
		);
		vi.mocked(applicationService.updateApplicationStatus).mockResolvedValue(
			{} as any,
		);
		vi.mocked(notifications.sendBuildSuccessNotifications).mockResolvedValue(
			undefined as any,
		);
	});

	it("prepends `docker pull <dockerImage>` for docker source before the build command", async () => {
		vi.mocked(builders.getBuildCommand).mockResolvedValue("#BUILD-COMMAND#");

		await rebuildApplication({
			applicationId: "test-app-id",
			titleLog: "Rebuild",
			descriptionLog: "",
		});

		expect(execProcess.execAsync).toHaveBeenCalledTimes(1);
		const fullCommand = vi.mocked(execProcess.execAsync).mock
			.calls[0]?.[0] as string;

		expect(fullCommand).toContain("set -e");
		expect(fullCommand).toContain("docker pull");
		expect(fullCommand).toContain("nginx:latest");

		const pullIndex = fullCommand.indexOf("docker pull");
		const buildIndex = fullCommand.indexOf("#BUILD-COMMAND#");
		expect(pullIndex).toBeGreaterThan(-1);
		expect(buildIndex).toBeGreaterThan(-1);
		expect(pullIndex).toBeLessThan(buildIndex);
	});

	it("logs the docker-login step before pulling when app-level credentials are set", async () => {
		const app = createMockApplication({
			dockerImage: "private.example.com/myrepo:v1",
			username: "app-user",
			password: "app-secret",
			registryUrl: "private.example.com",
		});
		vi.mocked(db.query.applications.findFirst).mockResolvedValue(app as any);
		vi.mocked(applicationService.findApplicationById).mockResolvedValue(
			app as any,
		);
		vi.mocked(builders.getBuildCommand).mockResolvedValue("#BUILD-COMMAND#");

		await rebuildApplication({
			applicationId: "test-app-id",
			titleLog: "Rebuild",
			descriptionLog: "",
		});

		const fullCommand = vi.mocked(execProcess.execAsync).mock
			.calls[0]?.[0] as string;

		expect(fullCommand).toContain("docker login");
		expect(fullCommand).toContain("private.example.com/myrepo:v1");
		expect(fullCommand).toContain("docker pull");

		const loginIndex = fullCommand.indexOf("docker login");
		const pullIndex = fullCommand.indexOf("docker pull");
		expect(loginIndex).toBeLessThan(pullIndex);
	});

	it("does not prepend `docker pull` for non-docker source rebuilds", async () => {
		const app = createMockApplication({ sourceType: "github" });
		vi.mocked(db.query.applications.findFirst).mockResolvedValue(app as any);
		vi.mocked(applicationService.findApplicationById).mockResolvedValue(
			app as any,
		);
		vi.mocked(builders.getBuildCommand).mockResolvedValue("#BUILD-COMMAND#");

		await rebuildApplication({
			applicationId: "test-app-id",
			titleLog: "Rebuild",
			descriptionLog: "",
		});

		const fullCommand = vi.mocked(execProcess.execAsync).mock
			.calls[0]?.[0] as string;

		expect(fullCommand).not.toContain("docker pull");
		expect(fullCommand).toContain("#BUILD-COMMAND#");
	});
});
