import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Call-site guarantees of the build-registry prune. The deployment queue keeps
 * a concurrency slot and the compose's group lock until `deployCompose` /
 * `rebuildCompose` resolve (apps/dokploy/server/queues/in-memory-queue.ts,
 * `runJob`'s finally), so the prune must be detached from them, and nothing it
 * does may reach the deployment's or the compose's status.
 */

const mocks = vi.hoisted(() => ({
	pruneComposeBuildRegistry: vi.fn(),
	prepareComposeBuildServerDeploy: vi.fn(),
	waitForComposeRequiredChecks: vi.fn().mockResolvedValue(undefined),
	execAsync: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
	execAsyncRemote: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
	getBuildComposeCommand: vi.fn().mockResolvedValue("docker compose up -d;"),
	createDeploymentCompose: vi.fn(),
	updateDeploymentStatus: vi.fn(),
	updateCompose: vi.fn(),
}));

vi.mock("@dokploy/server/services/compose-registry-retention", () => ({
	pruneComposeBuildRegistry: mocks.pruneComposeBuildRegistry,
}));
vi.mock("@dokploy/server/services/compose-build-server", () => ({
	prepareComposeBuildServerDeploy: mocks.prepareComposeBuildServerDeploy,
}));
vi.mock("@dokploy/server/services/build-policy/compose-checks", () => ({
	waitForComposeRequiredChecks: mocks.waitForComposeRequiredChecks,
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

import {
	REGISTRY_PRUNE_START_DELAY_MS,
	rebuildCompose,
	scheduleComposeBuildRegistryPrune,
} from "@dokploy/server/services/compose";

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
	environment: { project: { organizationId: "org-1" } },
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

const flush = async () => {
	for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe("build registry prune: call site", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		mocks.pruneComposeBuildRegistry.mockResolvedValue(undefined);
		mocks.prepareComposeBuildServerDeploy.mockResolvedValue({
			images: [],
			loginCommand: "",
			servingHostLabel: "the Dokploy host",
		});
		mocks.createDeploymentCompose.mockResolvedValue({
			deploymentId: "dep-1",
			logPath: "/var/log/dep-1.log",
		});
		const { db } = await import("@dokploy/server/db");
		vi.mocked(db.query.compose.findFirst).mockResolvedValue(COMPOSE as any);
		// updateCompose lives in the module under test, so record what it writes
		vi.mocked(db.update).mockImplementation((() => {
			const chain: any = {
				set: (values: unknown) => {
					// A build-server deployment is finished with a conditional update
					// (never over a cancel) rather than updateDeploymentStatus.
					const status = (values as { status?: string }).status;
					if (status) mocks.updateDeploymentStatus("dep-1", status);
					mocks.updateCompose("compose", values);
					return chain;
				},
				where: () => chain,
				returning: () => Promise.resolve([{}]),
			};
			return chain;
		}) as any);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("does not run, or even start, the prune before the deploy has returned", async () => {
		await expect(rebuild()).resolves.toBe(true);
		expect(mocks.pruneComposeBuildRegistry).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(1);

		await vi.advanceTimersByTimeAsync(REGISTRY_PRUNE_START_DELAY_MS);
		expect(mocks.pruneComposeBuildRegistry).toHaveBeenCalledTimes(1);
		expect(mocks.pruneComposeBuildRegistry).toHaveBeenCalledWith(
			expect.objectContaining({
				entity: expect.objectContaining({ composeId: "compose-1" }),
				deployment: expect.objectContaining({ deploymentId: "dep-1" }),
			}),
		);
	});

	it("a prune that never finishes cannot delay the deploy (the queue slot)", async () => {
		mocks.pruneComposeBuildRegistry.mockReturnValue(new Promise(() => {}));
		await expect(rebuild()).resolves.toBe(true);
		// the deploy has settled while the prune has not even started
		expect(mocks.pruneComposeBuildRegistry).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(REGISTRY_PRUNE_START_DELAY_MS);
		expect(mocks.pruneComposeBuildRegistry).toHaveBeenCalledTimes(1);
		expect(statuses().deployment).toEqual(["done"]);
	});

	it("a prune that throws cannot flip the deployment or compose status", async () => {
		mocks.pruneComposeBuildRegistry.mockImplementation(() => {
			throw new Error("prune exploded");
		});
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});
		await expect(rebuild()).resolves.toBe(true);
		await vi.advanceTimersByTimeAsync(REGISTRY_PRUNE_START_DELAY_MS);
		await flush();
		expect(mocks.pruneComposeBuildRegistry).toHaveBeenCalledTimes(1);
		expect(errors).toHaveBeenCalledWith(
			"Build registry cleanup failed",
			expect.any(Error),
		);
		expect(statuses().deployment).toEqual(["done"]);
		expect(statuses().compose).toEqual(["done"]);
		errors.mockRestore();
	});

	it("a prune that rejects cannot flip the status either", async () => {
		mocks.pruneComposeBuildRegistry.mockRejectedValue(new Error("rejected"));
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});
		await expect(rebuild()).resolves.toBe(true);
		await vi.advanceTimersByTimeAsync(REGISTRY_PRUNE_START_DELAY_MS);
		await flush();
		expect(statuses().deployment).toEqual(["done"]);
		expect(statuses().compose).toEqual(["done"]);
		errors.mockRestore();
	});

	it("a scheduler that cannot even arm its timer is swallowed", () => {
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});
		const original = globalThis.setTimeout;
		globalThis.setTimeout = (() => {
			throw new Error("no timers");
		}) as unknown as typeof setTimeout;
		try {
			expect(() =>
				scheduleComposeBuildRegistryPrune({
					entity: COMPOSE as any,
					deployment: { logPath: "/l", deploymentId: "d" },
				}),
			).not.toThrow();
		} finally {
			globalThis.setTimeout = original;
		}
		expect(errors).toHaveBeenCalled();
		errors.mockRestore();
	});

	it("a failed deploy never schedules a prune", async () => {
		mocks.waitForComposeRequiredChecks.mockRejectedValueOnce(new Error("gate"));
		await expect(rebuild()).rejects.toThrow("gate");
		await vi.advanceTimersByTimeAsync(REGISTRY_PRUNE_START_DELAY_MS * 2);
		expect(mocks.pruneComposeBuildRegistry).not.toHaveBeenCalled();
	});

	it("a compose without a build server arms no timer and never prunes", async () => {
		const { db } = await import("@dokploy/server/db");
		vi.mocked(db.query.compose.findFirst).mockResolvedValue({
			...COMPOSE,
			buildServerId: null,
			buildRegistryId: null,
		} as any);
		await expect(rebuild()).resolves.toBe(true);
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(REGISTRY_PRUNE_START_DELAY_MS * 2);
		expect(mocks.pruneComposeBuildRegistry).not.toHaveBeenCalled();
	});
});
