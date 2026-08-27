import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `moveComposeToServer` pulls in a large dependency graph (compose service
 * helpers, deployment helpers, the migration store, direct exec calls for
 * discovering/tearing down runtimes, ...). Every one of those is mocked
 * here so these tests exercise only the orchestration logic in
 * `compose-move.ts` itself - in particular the two safety fixes this file
 * covers:
 *
 * 1. Target-runtime rollback ownership (TOCTOU): rollback must only tear
 *    down the target compose project/stack once
 *    `startComposeFromExistingFiles` has POSITIVELY succeeded, never
 *    merely because it was attempted - and a fresh collision check runs
 *    immediately before starting it, to shrink the window opened by the
 *    (potentially long) directory/volume transfer. Conservative
 *    non-removal is acceptable here.
 * 2. Source-restart gating: rollback must attempt to restart the source
 *    based on whether the stop was *requested*, not on whether it was
 *    *verified* - a verification failure (SSH error, timeout) must not
 *    suppress the restart attempt.
 */
const composeServiceMocks = vi.hoisted(() => ({
	findComposeById: vi.fn(),
	stopCompose: vi.fn(),
	updateCompose: vi.fn(),
}));
vi.mock("@dokploy/server/services/compose", () => composeServiceMocks);

const deploymentMocks = vi.hoisted(() => ({
	createDeploymentCompose: vi.fn(),
	updateDeploymentStatus: vi.fn(),
}));
vi.mock("@dokploy/server/services/deployment", () => deploymentMocks);

vi.mock("@dokploy/server/utils/builders/compose", () => ({
	getBuildComposeCommand: vi.fn().mockResolvedValue("docker compose up -d"),
}));

const serverMocks = vi.hoisted(() => ({
	getAccessibleServerIds: vi.fn(),
}));
vi.mock("@dokploy/server/services/server", () => serverMocks);

const storeMocks = vi.hoisted(() => ({
	createPendingServiceMigration: vi.fn(),
	deleteServiceMigration: vi.fn(),
	finalizeServiceMigration: vi.fn(),
	findPendingServiceMigration: vi.fn(),
	findServiceMigrationById: vi.fn(),
	findUnresolvedServiceMigration: vi.fn(),
	markServiceMigrationFailed: vi.fn(),
	markServiceMigrationRollingBack: vi.fn(),
	markServiceMigrationReady: vi.fn(),
	updateServiceMigrationProgress: vi.fn(),
}));
vi.mock("@dokploy/server/services/service-migration-store", () => storeMocks);

vi.mock("@dokploy/server/utils/filesystem/directory", () => ({
	removeComposeDirectory: vi.fn(),
	removeMonitoringDirectory: vi.fn(),
}));

const cleanupMocks = vi.hoisted(() => ({
	isMissingResourceError: vi.fn().mockReturnValue(false),
	removeVolumeIdempotent: vi.fn(),
}));
vi.mock("@dokploy/server/utils/migration/cleanup", () => cleanupMocks);

const execAsyncMocks = vi.hoisted(() => ({
	execAsync: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
	execAsyncRemote: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
	sleep: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@dokploy/server/utils/process/execAsync", () => execAsyncMocks);

const rollbackOutcomeMocks = vi.hoisted(() => ({
	resolveServiceMigrationAfterRollback: vi.fn(),
}));
vi.mock(
	"@dokploy/server/utils/migration/rollback-outcome",
	() => rollbackOutcomeMocks,
);

const runtimeMocks = vi.hoisted(() => ({
	countRunningContainers: vi.fn(),
	runtimeExistsOnTarget: vi.fn(),
}));
vi.mock("@dokploy/server/utils/migration/runtime", () => runtimeMocks);

vi.mock("@dokploy/server/utils/migration/transfer", () => ({
	transferDirectory: vi.fn(),
	transferDockerVolume: vi.fn(),
}));

vi.mock("@dokploy/server/utils/migration/validate-target-service", () => ({
	validateMoveTarget: vi.fn(),
}));

import {
	moveComposeToServer,
	rollbackComposeMove,
} from "@dokploy/server/services/compose-move";

const SOURCE_SERVER_ID = null; // local source
const TARGET_SERVER_ID = "server-target";

const baseCompose = {
	composeId: "compose_1",
	appName: "my-compose-app",
	serverId: SOURCE_SERVER_ID,
	composeType: "docker-compose" as const,
	serviceNetworks: [],
	sourceType: "raw",
	composePath: "docker-compose.yml",
};

describe("moveComposeToServer", () => {
	// Tracks how many times `countRunningContainers` has been called for the
	// SOURCE server, so the shared default below can distinguish the initial
	// "is it currently running" precondition check (must report >0) from the
	// later "did it actually stop" verification poll (must report 0) - both
	// of which query the exact same (source) server/appName/composeType.
	let sourceCallCount = 0;
	// How many running containers `countRunningContainers` reports for the
	// TARGET server - defaults to "it came up fine"; individual tests
	// override this (or replace the whole mock) to simulate a target that
	// never reports running, or a dead SSH connection.
	let targetRunningCount = 1;

	beforeEach(async () => {
		vi.clearAllMocks();
		sourceCallCount = 0;
		targetRunningCount = 1;
		composeServiceMocks.findComposeById.mockResolvedValue({ ...baseCompose });
		composeServiceMocks.stopCompose.mockResolvedValue(undefined);
		composeServiceMocks.updateCompose.mockResolvedValue(undefined);
		storeMocks.createPendingServiceMigration.mockResolvedValue({
			serviceMigrationId: "mig_1",
		});
		storeMocks.markServiceMigrationRollingBack.mockResolvedValue(undefined);
		storeMocks.updateServiceMigrationProgress.mockResolvedValue(undefined);
		rollbackOutcomeMocks.resolveServiceMigrationAfterRollback.mockResolvedValue(
			new Error("rolled back"),
		);
		deploymentMocks.createDeploymentCompose.mockResolvedValue({
			deploymentId: "dep_1",
		});
		deploymentMocks.updateDeploymentStatus.mockResolvedValue(undefined);
		execAsyncMocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
		execAsyncMocks.execAsyncRemote.mockResolvedValue({
			stdout: "",
			stderr: "",
		});
		cleanupMocks.isMissingResourceError.mockReturnValue(false);
		cleanupMocks.removeVolumeIdempotent.mockResolvedValue(undefined);
		storeMocks.deleteServiceMigration.mockResolvedValue(undefined);
		serverMocks.getAccessibleServerIds.mockResolvedValue(
			new Set([TARGET_SERVER_ID]),
		);
		// Default: the source reports running on the very first call (the
		// precondition check), then reports stopped on every call after that
		// (the post-stop verification poll). The target reports
		// `targetRunningCount` running containers throughout (the post-start
		// verification poll) - both are keyed by `serverId` alone since the
		// composeType/appName are constant across a test.
		runtimeMocks.countRunningContainers.mockImplementation(
			async (
				_composeType: string,
				_appName: string,
				serverId: string | null,
			) => {
				if (serverId === TARGET_SERVER_ID) return targetRunningCount;
				sourceCallCount += 1;
				return sourceCallCount === 1 ? 1 : 0;
			},
		);
		// No pre-existing collision, and none appears mid-move either, unless
		// a test overrides this.
		runtimeMocks.runtimeExistsOnTarget.mockResolvedValue(false);
		const { validateMoveTarget } = await import(
			"@dokploy/server/utils/migration/validate-target-service"
		);
		vi.mocked(validateMoveTarget).mockReset().mockResolvedValue(undefined);
	});

	it("does NOT tear down the target runtime when starting it throws before ownership is established (TOCTOU safety)", async () => {
		const startError = new Error("docker compose up failed");
		// The target is remote, so `startComposeFromExistingFiles` runs the
		// start command through `execAsyncRemote`, not `execAsync`.
		execAsyncMocks.execAsyncRemote.mockImplementation(
			async (_serverId: string, command: string) => {
				if (command.includes("up -d")) {
					throw startError;
				}
				return { stdout: "", stderr: "" };
			},
		);

		await expect(
			moveComposeToServer({
				composeId: "compose_1",
				targetServerId: TARGET_SERVER_ID,
				session: { userId: "u1", activeOrganizationId: "org-1" },
			}),
		).rejects.toThrow("rolled back");

		// Sanity check that this test actually reached (and failed at) the
		// start step, rather than vacuously passing because of an earlier
		// unrelated failure.
		const startCalls = execAsyncMocks.execAsyncRemote.mock.calls.filter(
			(call: unknown[]) => (call[1] as string).includes("up -d"),
		);
		expect(startCalls.length).toBeGreaterThan(0);

		// Nothing under this name on the target may be torn down - starting it
		// never succeeded, so ownership was never proven.
		const removeCalls = execAsyncMocks.execAsyncRemote.mock.calls.filter(
			(call: unknown[]) =>
				(call[1] as string).includes("down") ||
				(call[1] as string).includes("stack rm"),
		);
		expect(removeCalls).toHaveLength(0);
	});

	it("refuses to start - and never tears down anything on the target - when a same-name collision appears mid-transfer (recheck immediately before starting)", async () => {
		runtimeMocks.runtimeExistsOnTarget
			.mockResolvedValueOnce(false) // preflight
			.mockResolvedValueOnce(true); // recheck right before start

		await expect(
			moveComposeToServer({
				composeId: "compose_1",
				targetServerId: TARGET_SERVER_ID,
				session: { userId: "u1", activeOrganizationId: "org-1" },
			}),
		).rejects.toThrow("rolled back");

		const startCalls = execAsyncMocks.execAsyncRemote.mock.calls.filter(
			(call: unknown[]) => (call[1] as string).includes("up -d"),
		);
		expect(startCalls).toHaveLength(0);
		const removeCalls = execAsyncMocks.execAsyncRemote.mock.calls.filter(
			(call: unknown[]) =>
				(call[1] as string).includes("down") ||
				(call[1] as string).includes("stack rm"),
		);
		expect(removeCalls).toHaveLength(0);
	});

	it("tears down the target runtime once starting it succeeds, even if the post-start running-check later fails", async () => {
		// Start succeeds (ownership established); the post-start
		// running-check keeps reporting 0 running containers on the target.
		targetRunningCount = 0;

		await expect(
			moveComposeToServer({
				composeId: "compose_1",
				targetServerId: TARGET_SERVER_ID,
				session: { userId: "u1", activeOrganizationId: "org-1" },
			}),
		).rejects.toThrow("rolled back");

		const removeCalls = execAsyncMocks.execAsyncRemote.mock.calls.filter(
			(call: unknown[]) => (call[1] as string).includes("down"),
		);
		expect(removeCalls.length).toBeGreaterThan(0);
	});

	it("attempts to restart the source when stop was REQUESTED but verification fails (SSH failure), not just when it was verified stopped", async () => {
		// The initial "is it running" precondition check succeeds (1), but
		// every subsequent inspection (the stopped-verification poll) fails
		// outright - e.g. a dead SSH connection - rather than timing out.
		let call = 0;
		runtimeMocks.countRunningContainers.mockImplementation(async () => {
			call += 1;
			if (call === 1) return 1;
			throw new Error("ECONNREFUSED: dead ssh connection");
		});

		await expect(
			moveComposeToServer({
				composeId: "compose_1",
				targetServerId: TARGET_SERVER_ID,
				session: { userId: "u1", activeOrganizationId: "org-1" },
			}),
		).rejects.toThrow("rolled back");

		// The stop was requested (stopCompose invoked) before the failed
		// verification, so a restart on the source must still be attempted.
		const restartCalls = execAsyncMocks.execAsync.mock.calls.filter(
			(call: unknown[]) => (call[0] as string).includes("up -d"),
		);
		expect(restartCalls.length).toBeGreaterThan(0);

		const restartErrorArg =
			rollbackOutcomeMocks.resolveServiceMigrationAfterRollback.mock
				.calls[0]?.[0];
		expect(restartErrorArg.restartError).toEqual(
			expect.objectContaining({
				message: "ECONNREFUSED: dead ssh connection",
			}),
		);
	});

	it("does not attempt a source restart at all when the stop was never requested (failure before the stop is even invoked)", async () => {
		const { validateMoveTarget } = await import(
			"@dokploy/server/utils/migration/validate-target-service"
		);
		vi.mocked(validateMoveTarget).mockRejectedValueOnce(
			new Error("invalid target"),
		);

		await expect(
			moveComposeToServer({
				composeId: "compose_1",
				targetServerId: TARGET_SERVER_ID,
				session: { userId: "u1", activeOrganizationId: "org-1" },
			}),
		).rejects.toThrow("invalid target");

		expect(composeServiceMocks.stopCompose).not.toHaveBeenCalled();
		expect(
			rollbackOutcomeMocks.resolveServiceMigrationAfterRollback,
		).not.toHaveBeenCalled();
	});

	it("retries an interrupted rollback from persisted ownership state", async () => {
		storeMocks.findUnresolvedServiceMigration.mockResolvedValue({
			serviceMigrationId: "mig_1",
			sourceServerId: SOURCE_SERVER_ID,
			targetServerId: TARGET_SERVER_ID,
			targetRuntimeCreated: true,
			createdVolumeNames: ["my-compose-app_data"],
			targetDirectoryCreated: false,
			ownershipMoved: true,
			originalServiceNetworks: [
				{
					serviceName: "api",
					networkIds: ["network-1"],
					detachDokployNetwork: false,
				},
			],
			originalStatus: "idle",
		});

		await expect(
			rollbackComposeMove({
				composeId: "compose_1",
				migrationId: "mig_1",
				session: { userId: "u1", activeOrganizationId: "org-1" },
			}),
		).resolves.toBe(true);

		expect(cleanupMocks.removeVolumeIdempotent).toHaveBeenCalledWith(
			"my-compose-app_data",
			TARGET_SERVER_ID,
		);
		expect(composeServiceMocks.updateCompose).toHaveBeenCalledWith(
			"compose_1",
			{
				serverId: SOURCE_SERVER_ID,
				serviceNetworks: [
					{
						serviceName: "api",
						networkIds: ["network-1"],
						detachDokployNetwork: false,
					},
				],
				composeStatus: "idle",
			},
		);
		expect(storeMocks.deleteServiceMigration).toHaveBeenCalledWith("mig_1");
	});

	it("refuses rollback after source cleanup has started", async () => {
		storeMocks.findUnresolvedServiceMigration.mockResolvedValue({
			serviceMigrationId: "mig_1",
			status: "finalizing",
		});

		await expect(
			rollbackComposeMove({
				composeId: "compose_1",
				migrationId: "mig_1",
				session: { userId: "u1", activeOrganizationId: "org-1" },
			}),
		).rejects.toThrow("retry finalization");
		expect(cleanupMocks.removeVolumeIdempotent).not.toHaveBeenCalled();
	});
});
