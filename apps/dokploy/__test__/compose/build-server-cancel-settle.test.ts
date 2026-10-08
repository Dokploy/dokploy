import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * How `rebuildCompose` / `deployCompose` end a build-server deployment the user
 * cancelled: the deployment stays `cancelled` (not `error`), no build-error
 * notification goes out, the service is put back to the state of the release
 * that is still serving, and the job ends with an error the queue recognises so
 * its slot and group lock are released without flipping the service to error.
 */

const mocks = vi.hoisted(() => ({
	prepareComposeBuildServerDeploy: vi.fn(),
	waitForComposeRequiredChecks: vi.fn().mockResolvedValue(undefined),
	execAsync: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
	execAsyncRemote: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
	getBuildComposeCommand: vi.fn().mockResolvedValue("docker compose up -d;"),
	createDeploymentCompose: vi.fn(),
	updateDeploymentStatus: vi.fn(),
	updateCompose: vi.fn(),
	sendBuildErrorNotifications: vi.fn(),
	sendBuildSuccessNotifications: vi.fn(),
	isDeploymentCancelled: vi.fn(),
	statusAfterCancelledDeploy: vi.fn(),
}));

vi.mock("@dokploy/server/services/compose-build-server", () => ({
	prepareComposeBuildServerDeploy: mocks.prepareComposeBuildServerDeploy,
}));
vi.mock("@dokploy/server/services/compose-registry-retention", () => ({
	pruneComposeBuildRegistry: vi.fn(),
}));
vi.mock("@dokploy/server/services/build-policy/compose-checks", () => ({
	waitForComposeRequiredChecks: mocks.waitForComposeRequiredChecks,
}));
vi.mock("@dokploy/server/utils/notifications/build-error", () => ({
	sendBuildErrorNotifications: mocks.sendBuildErrorNotifications,
}));
vi.mock("@dokploy/server/utils/notifications/build-success", () => ({
	sendBuildSuccessNotifications: mocks.sendBuildSuccessNotifications,
}));
vi.mock("@dokploy/server/utils/process/execAsync", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/utils/process/execAsync")
	>("@dokploy/server/utils/process/execAsync");
	return {
		...actual,
		execAsync: mocks.execAsync,
		execAsyncRemote: mocks.execAsyncRemote,
	};
});
vi.mock("@dokploy/server/utils/builders/compose", () => ({
	getBuildComposeCommand: mocks.getBuildComposeCommand,
	getBackupCurrentDeploymentCommand: vi.fn(() => "true;"),
	getRollbackMarkerProbeCommand: vi.fn(() => "true;"),
	getCreateEnvFileCommand: vi.fn(() => ""),
	getComposeBuildOverridePath: vi.fn(() => "/override.yml"),
}));
vi.mock("@dokploy/server/services/patch", () => ({
	generateApplyPatchesCommand: vi.fn().mockResolvedValue(""),
}));
vi.mock("@dokploy/server/services/deployment", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/services/deployment")
	>("@dokploy/server/services/deployment");
	return {
		...actual,
		createDeploymentCompose: mocks.createDeploymentCompose,
		updateDeploymentStatus: mocks.updateDeploymentStatus,
	};
});
vi.mock("@dokploy/server/services/deployment-cancel", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/services/deployment-cancel")
	>("@dokploy/server/services/deployment-cancel");
	return {
		...actual,
		isDeploymentCancelled: mocks.isDeploymentCancelled,
		statusAfterCancelledDeploy: mocks.statusAfterCancelledDeploy,
	};
});

import { deployCompose, rebuildCompose } from "@dokploy/server/services/compose";
import { DeploymentCancelledError } from "@dokploy/server/services/deployment-cancel";

const COMPOSE = {
	composeId: "compose-1",
	appName: "stack",
	name: "Stack",
	sourceType: "raw",
	composeFile: "services: {}",
	env: "",
	composeType: "docker-compose",
	composePath: "./docker-compose.yml",
	serverId: null,
	buildServerId: "build-1",
	buildRegistryId: "reg-1",
	domains: [],
	environment: { name: "prod", project: { name: "P", organizationId: "org-1" } },
};

const rebuild = () =>
	rebuildCompose({
		composeId: "compose-1",
		titleLog: "Rebuild deployment",
		descriptionLog: "",
	});

const statuses = () => ({
	deployment: mocks.updateDeploymentStatus.mock.calls.map((call) => call[1]),
	compose: mocks.updateCompose.mock.calls
		.map((call) => (call[1] as { composeStatus?: string }).composeStatus)
		.filter(Boolean),
});

beforeEach(async () => {
	vi.clearAllMocks();
	mocks.isDeploymentCancelled.mockResolvedValue(false);
	mocks.statusAfterCancelledDeploy.mockResolvedValue("done");
	mocks.createDeploymentCompose.mockResolvedValue({
		deploymentId: "dep-1",
		logPath: "/var/log/dep-1.log",
	});
	const { db } = await import("@dokploy/server/db");
	vi.mocked(db.query.compose.findFirst).mockResolvedValue(COMPOSE as any);
	vi.mocked(db.update).mockImplementation((() => {
		const chain: any = {
			set: (values: unknown) => {
				mocks.updateCompose("compose", values);
				return chain;
			},
			where: () => chain,
			returning: () => Promise.resolve([{}]),
		};
		return chain;
	}) as any);
});

describe("a cancelled build-server compose deployment", () => {
	it("ends as cancelled, not error, without a notification, and the service keeps its release", async () => {
		mocks.prepareComposeBuildServerDeploy.mockRejectedValue(
			new DeploymentCancelledError(),
		);
		mocks.isDeploymentCancelled.mockResolvedValue(true);

		const outcome = await rebuild().catch((error) => error);

		expect(outcome).toMatchObject({ deploymentCancelled: true });
		// `cancelled` was written by the cancel itself; nothing flips it to error.
		expect(statuses().deployment).not.toContain("error");
		expect(statuses().deployment).not.toContain("done");
		expect(statuses().compose).not.toContain("error");
		expect(statuses().compose).toContain("done");
		expect(mocks.sendBuildErrorNotifications).not.toHaveBeenCalled();
		expect(mocks.sendBuildSuccessNotifications).not.toHaveBeenCalled();
		// The serving host never pulled or started anything from this build.
		expect(mocks.getBuildComposeCommand).not.toHaveBeenCalled();
	});

	it("deployCompose ends the same way and sends no build-error notification", async () => {
		mocks.prepareComposeBuildServerDeploy.mockRejectedValue(
			new DeploymentCancelledError(),
		);
		mocks.isDeploymentCancelled.mockResolvedValue(true);

		const outcome = await deployCompose({
			composeId: "compose-1",
			titleLog: "Manual deployment",
			descriptionLog: "",
		}).catch((error) => error);

		expect(outcome).toMatchObject({ deploymentCancelled: true });
		expect(statuses().deployment).not.toContain("error");
		expect(statuses().compose).not.toContain("error");
		expect(mocks.sendBuildErrorNotifications).not.toHaveBeenCalled();
		expect(mocks.getBuildComposeCommand).not.toHaveBeenCalled();
	});

	it("deployCompose still notifies a real build failure", async () => {
		mocks.prepareComposeBuildServerDeploy.mockRejectedValue(
			new Error("docker build failed"),
		);

		await expect(
			deployCompose({
				composeId: "compose-1",
				titleLog: "Manual deployment",
				descriptionLog: "",
			}),
		).rejects.toThrow("docker build failed");

		expect(statuses().deployment).toContain("error");
		expect(mocks.sendBuildErrorNotifications).toHaveBeenCalledTimes(1);
	});

	it("a service that never deployed stays idle", async () => {
		mocks.prepareComposeBuildServerDeploy.mockRejectedValue(
			new DeploymentCancelledError(),
		);
		mocks.isDeploymentCancelled.mockResolvedValue(true);
		mocks.statusAfterCancelledDeploy.mockResolvedValue("idle");

		await rebuild().catch(() => {});

		expect(statuses().compose).toContain("idle");
		expect(statuses().compose).not.toContain("error");
	});

	it("a real build failure that was not cancelled still ends as error", async () => {
		mocks.prepareComposeBuildServerDeploy.mockRejectedValue(
			new Error("docker build failed"),
		);

		await expect(rebuild()).rejects.toThrow("docker build failed");

		expect(statuses().deployment).toContain("error");
		expect(statuses().compose).toContain("error");
		expect(mocks.getBuildComposeCommand).not.toHaveBeenCalled();
	});

	it("a compose without a build server never consults the cancel flag", async () => {
		const { db } = await import("@dokploy/server/db");
		vi.mocked(db.query.compose.findFirst).mockResolvedValue({
			...COMPOSE,
			buildServerId: null,
			buildRegistryId: null,
		} as any);
		mocks.prepareComposeBuildServerDeploy.mockResolvedValue(undefined);
		mocks.execAsync.mockRejectedValueOnce(new Error("up failed"));
		// Any command fails: the failure path must stay the old one.
		mocks.execAsync.mockRejectedValue(new Error("up failed"));

		await rebuild().catch(() => {});

		expect(mocks.isDeploymentCancelled).not.toHaveBeenCalled();
		expect(mocks.statusAfterCancelledDeploy).not.toHaveBeenCalled();
	});
});
