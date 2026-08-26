import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `moveDatabaseToServer` pulls in a large dependency graph (six database
 * service modules, docker utils, filesystem helpers, the migration store,
 * ...). Every one of those is mocked here so these tests exercise only the
 * orchestration logic in `database-move.ts` itself - in particular the two
 * safety fixes this file covers:
 *
 * 1. Target-runtime rollback ownership (TOCTOU): rollback must only remove
 *    the target Docker service once `adapter.deploy` has POSITIVELY
 *    succeeded, never merely because it was attempted - and a fresh
 *    collision check runs immediately before `deploy` to shrink the window
 *    opened by the (potentially long) volume/file transfer.
 * 2. Source-restart gating: rollback must attempt to restart the source
 *    based on whether the stop was *requested*, not on whether it was
 *    *verified* - a verification failure (SSH error, timeout) must not
 *    suppress the restart attempt.
 */
const postgresMocks = vi.hoisted(() => ({
	findPostgresById: vi.fn(),
	updatePostgresById: vi.fn(),
	deployPostgres: vi.fn(),
}));
vi.mock("@dokploy/server/services/postgres", () => postgresMocks);

// The other five database adapters are wired up eagerly at module load
// (the `adapters` record in database-move.ts), so they must be mockable
// even though these tests only ever exercise the "postgres" service type.
vi.mock("@dokploy/server/services/mysql", () => ({
	findMySqlById: vi.fn(),
	updateMySqlById: vi.fn(),
	deployMySql: vi.fn(),
}));
vi.mock("@dokploy/server/services/mariadb", () => ({
	findMariadbById: vi.fn(),
	updateMariadbById: vi.fn(),
	deployMariadb: vi.fn(),
}));
vi.mock("@dokploy/server/services/mongo", () => ({
	findMongoById: vi.fn(),
	updateMongoById: vi.fn(),
	deployMongo: vi.fn(),
}));
vi.mock("@dokploy/server/services/redis", () => ({
	findRedisById: vi.fn(),
	updateRedisById: vi.fn(),
	deployRedis: vi.fn(),
}));
vi.mock("@dokploy/server/services/libsql", () => ({
	findLibsqlById: vi.fn(),
	updateLibsqlById: vi.fn(),
	deployLibsql: vi.fn(),
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
	getMigrationServiceId: vi.fn(),
	markServiceMigrationFailed: vi.fn(),
	markServiceMigrationRollingBack: vi.fn(),
	markServiceMigrationReady: vi.fn(),
	updateServiceMigrationProgress: vi.fn(),
}));
vi.mock("@dokploy/server/services/service-migration-store", () => storeMocks);

const dockerUtilsMocks = vi.hoisted(() => ({
	startService: vi.fn(),
	startServiceRemote: vi.fn(),
	stopService: vi.fn(),
	stopServiceRemote: vi.fn(),
}));
vi.mock("@dokploy/server/utils/docker/utils", () => dockerUtilsMocks);

vi.mock("@dokploy/server/utils/filesystem/directory", () => ({
	removeDirectoryCode: vi.fn(),
	removeMonitoringDirectory: vi.fn(),
}));

const cleanupMocks = vi.hoisted(() => ({
	removeServiceIdempotent: vi.fn(),
	removeVolumeIdempotent: vi.fn(),
}));
vi.mock("@dokploy/server/utils/migration/cleanup", () => cleanupMocks);

const rollbackOutcomeMocks = vi.hoisted(() => ({
	resolveServiceMigrationAfterRollback: vi.fn(),
}));
vi.mock(
	"@dokploy/server/utils/migration/rollback-outcome",
	() => rollbackOutcomeMocks,
);

const runtimeMocks = vi.hoisted(() => ({
	countRunningContainers: vi.fn(),
	reserveServiceName: vi.fn(),
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

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	sleep: vi.fn().mockResolvedValue(undefined),
}));

import {
	moveDatabaseToServer,
	rollbackDatabaseMove,
} from "@dokploy/server/services/database-move";

const SOURCE_SERVER_ID = null; // local source
const TARGET_SERVER_ID = "server-target";

const baseEntity = {
	appName: "my-postgres-app",
	serverId: SOURCE_SERVER_ID,
	networkIds: [],
	applicationStatus: "running",
	mounts: [] as unknown[],
	environment: { project: { organizationId: "org-1" } },
};

describe("moveDatabaseToServer", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		postgresMocks.findPostgresById.mockResolvedValue({ ...baseEntity });
		postgresMocks.updatePostgresById.mockResolvedValue(undefined);
		storeMocks.createPendingServiceMigration.mockResolvedValue({
			serviceMigrationId: "mig_1",
		});
		storeMocks.markServiceMigrationRollingBack.mockResolvedValue(undefined);
		storeMocks.updateServiceMigrationProgress.mockResolvedValue(undefined);
		rollbackOutcomeMocks.resolveServiceMigrationAfterRollback.mockResolvedValue(
			new Error("rolled back"),
		);
		dockerUtilsMocks.stopService.mockResolvedValue(undefined);
		dockerUtilsMocks.startService.mockResolvedValue(undefined);
		// Source is confirmed stopped (0 running containers on the source);
		// target defaults to "never comes up" unless a test overrides it.
		runtimeMocks.countRunningContainers.mockImplementation(
			async (_kind: string, _appName: string, serverId: string | null) =>
				serverId === TARGET_SERVER_ID ? 0 : 0,
		);
		// No pre-existing collision, and none appears mid-move either, unless
		// a test overrides this.
		runtimeMocks.runtimeExistsOnTarget.mockResolvedValue(false);
		runtimeMocks.reserveServiceName.mockResolvedValue(undefined);
		cleanupMocks.removeServiceIdempotent.mockResolvedValue(undefined);
		cleanupMocks.removeVolumeIdempotent.mockResolvedValue(undefined);
		storeMocks.deleteServiceMigration.mockResolvedValue(undefined);
		serverMocks.getAccessibleServerIds.mockResolvedValue(
			new Set([TARGET_SERVER_ID]),
		);
	});

	it("removes the reserved target service when adapter.deploy() throws", async () => {
		postgresMocks.deployPostgres.mockRejectedValue(
			new Error("deploy exploded"),
		);

		await expect(
			moveDatabaseToServer({
				serviceType: "postgres",
				id: "pg_1",
				targetServerId: TARGET_SERVER_ID,
				session: { userId: "u1", activeOrganizationId: "org-1" },
			}),
		).rejects.toThrow("rolled back");

		expect(postgresMocks.deployPostgres).toHaveBeenCalledTimes(1);
		expect(cleanupMocks.removeServiceIdempotent).toHaveBeenCalledWith(
			"my-postgres-app",
			TARGET_SERVER_ID,
		);

		expect(
			rollbackOutcomeMocks.resolveServiceMigrationAfterRollback,
		).toHaveBeenCalledWith(
			expect.objectContaining({
				serviceMigrationId: "mig_1",
				cleanupErrors: [],
			}),
		);
	});

	it("refuses to deploy when the atomic target service reservation loses a race", async () => {
		runtimeMocks.reserveServiceName.mockRejectedValueOnce(
			new Error("service already exists"),
		);

		await expect(
			moveDatabaseToServer({
				serviceType: "postgres",
				id: "pg_1",
				targetServerId: TARGET_SERVER_ID,
				session: { userId: "u1", activeOrganizationId: "org-1" },
			}),
		).rejects.toThrow("rolled back");

		expect(postgresMocks.deployPostgres).not.toHaveBeenCalled();
		expect(cleanupMocks.removeServiceIdempotent).not.toHaveBeenCalled();
	});

	it("removes the target service once adapter.deploy() succeeds, even if the post-deploy running-check later fails", async () => {
		postgresMocks.deployPostgres.mockResolvedValue(undefined);
		// Target never reports a running container - post-deploy verification
		// fails, but ownership was already established by the successful
		// deploy, so rollback must remove it.
		runtimeMocks.countRunningContainers.mockImplementation(
			async (_kind: string, _appName: string, serverId: string | null) =>
				serverId === TARGET_SERVER_ID ? 0 : 0,
		);

		await expect(
			moveDatabaseToServer({
				serviceType: "postgres",
				id: "pg_1",
				targetServerId: TARGET_SERVER_ID,
				session: { userId: "u1", activeOrganizationId: "org-1" },
			}),
		).rejects.toThrow("rolled back");

		expect(postgresMocks.deployPostgres).toHaveBeenCalledTimes(1);
		expect(cleanupMocks.removeServiceIdempotent).toHaveBeenCalledWith(
			"my-postgres-app",
			TARGET_SERVER_ID,
		);
	});

	it("attempts to restart the source when stop was REQUESTED but verification fails (SSH failure), not just when it was verified stopped", async () => {
		// `stopDatabaseService` itself succeeds (the stop was requested and
		// dispatched), but the subsequent verification poll fails outright
		// (e.g. a dead SSH connection) rather than timing out.
		runtimeMocks.countRunningContainers.mockRejectedValue(
			new Error("ECONNREFUSED: dead ssh connection"),
		);

		await expect(
			moveDatabaseToServer({
				serviceType: "postgres",
				id: "pg_1",
				targetServerId: TARGET_SERVER_ID,
				session: { userId: "u1", activeOrganizationId: "org-1" },
			}),
		).rejects.toThrow("rolled back");

		// The stop was requested before the failed verification, so the
		// restart must still be attempted.
		expect(dockerUtilsMocks.startService).toHaveBeenCalledTimes(1);
		// deploy was never reached - the failure happened during the source
		// stop/verify phase - so nothing on the target was ever touched.
		expect(postgresMocks.deployPostgres).not.toHaveBeenCalled();
		expect(cleanupMocks.removeServiceIdempotent).not.toHaveBeenCalled();

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
			moveDatabaseToServer({
				serviceType: "postgres",
				id: "pg_1",
				targetServerId: TARGET_SERVER_ID,
				session: { userId: "u1", activeOrganizationId: "org-1" },
			}),
		).rejects.toThrow("invalid target");

		// Failure happened before the pending-migration row (and thus before
		// the try/catch rollback path) was even created - nothing to restart,
		// nothing to roll back.
		expect(dockerUtilsMocks.startService).not.toHaveBeenCalled();
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
			createdVolumeNames: ["pg-data"],
			targetDirectoryCreated: false,
			ownershipMoved: true,
			originalNetworkIds: ["network-1"],
			originalStatus: "idle",
		});

		await expect(
			rollbackDatabaseMove({
				serviceType: "postgres",
				id: "pg_1",
				migrationId: "mig_1",
				session: { userId: "u1", activeOrganizationId: "org-1" },
			}),
		).resolves.toBe(true);

		expect(cleanupMocks.removeServiceIdempotent).toHaveBeenCalledWith(
			"my-postgres-app",
			TARGET_SERVER_ID,
		);
		expect(cleanupMocks.removeVolumeIdempotent).toHaveBeenCalledWith(
			"pg-data",
			TARGET_SERVER_ID,
		);
		expect(postgresMocks.updatePostgresById).toHaveBeenCalledWith("pg_1", {
			serverId: SOURCE_SERVER_ID,
			networkIds: ["network-1"],
			applicationStatus: "idle",
		});
		expect(storeMocks.deleteServiceMigration).toHaveBeenCalledWith("mig_1");
	});

	it("refuses rollback after source cleanup has started", async () => {
		storeMocks.findUnresolvedServiceMigration.mockResolvedValue({
			serviceMigrationId: "mig_1",
			status: "finalizing",
		});

		await expect(
			rollbackDatabaseMove({
				serviceType: "postgres",
				id: "pg_1",
				migrationId: "mig_1",
				session: { userId: "u1", activeOrganizationId: "org-1" },
			}),
		).rejects.toThrow("retry finalization");
		expect(cleanupMocks.removeServiceIdempotent).not.toHaveBeenCalled();
	});
});
