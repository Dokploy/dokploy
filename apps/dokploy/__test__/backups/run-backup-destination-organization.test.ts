import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findDestinationRow: vi.fn(),
	createDeploymentBackup: vi.fn(),
	createDeploymentVolumeBackup: vi.fn(),
	updateDeploymentStatus: vi.fn(),
	findVolumeBackupById: vi.fn(),
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: { query: { destinations: { findFirst: mocks.findDestinationRow } } },
}));

vi.mock("@dokploy/server/constants", () => ({
	paths: () => ({ VOLUME_BACKUPS_PATH: "/tmp/volume-backups" }),
}));

vi.mock("@dokploy/server/services/deployment", () => ({
	createDeploymentBackup: mocks.createDeploymentBackup,
	createDeploymentVolumeBackup: mocks.createDeploymentVolumeBackup,
	updateDeploymentStatus: mocks.updateDeploymentStatus,
}));

vi.mock("@dokploy/server/services/environment", () => ({
	findEnvironmentById: vi.fn(async () => ({ projectId: "project-1" })),
}));

vi.mock("@dokploy/server/services/project", () => ({
	findProjectById: vi.fn(async () => ({
		name: "project",
		organizationId: "org-a",
	})),
}));

vi.mock("@dokploy/server/services/volume-backups", () => ({
	findVolumeBackupById: mocks.findVolumeBackupById,
}));

vi.mock("@dokploy/server/utils/backups/utils", () => ({
	getBackupCommand: vi.fn(() => "echo backup"),
	getBackupTimestamp: vi.fn(() => "2024"),
	getBackupFileName: vi.fn(() => "2024.sql.gz"),
	getS3Credentials: vi.fn(() => []),
	normalizeS3Path: vi.fn(() => ""),
}));

vi.mock("@dokploy/server/utils/volume-backups/backup", () => ({
	backupVolume: vi.fn(async () => "echo backup"),
	getVolumeServiceAppName: vi.fn(() => "app"),
}));

vi.mock("@dokploy/server/utils/notifications/database-backup", () => ({
	sendDatabaseBackupNotifications: vi.fn(),
}));

vi.mock("@dokploy/server/utils/notifications/volume-backup", () => ({
	sendVolumeBackupNotifications: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

const { runPostgresBackup } = await import(
	"@dokploy/server/utils/backups/postgres"
);
const { runVolumeBackup } = await import(
	"@dokploy/server/utils/volume-backups/utils"
);

const ownDestination = {
	destinationId: "dest-a",
	organizationId: "org-a",
	bucket: "bucket",
};
const foreignDestination = {
	destinationId: "dest-b",
	organizationId: "org-b",
	bucket: "bucket",
};

const postgres = {
	name: "db",
	appName: "db-app",
	environmentId: "env-1",
	serverId: null,
	databaseUser: "postgres",
};

const backup = {
	backupId: "backup-1",
	prefix: "/",
	database: "app",
	databaseType: "postgres",
	backupType: "database",
};

const volumeBackup = {
	volumeBackupId: "vb-1",
	name: "data",
	appName: "vb-app",
	volumeName: "app_data",
	serviceType: "application",
	destinationId: "dest-b",
	keepLatestCount: 0,
	application: {
		appName: "app",
		serverId: null,
		environment: { project: { name: "project", organizationId: "org-a" } },
	},
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.createDeploymentBackup.mockResolvedValue({
		deploymentId: "dep-1",
		logPath: "/tmp/dep-1.log",
	});
	mocks.createDeploymentVolumeBackup.mockResolvedValue({
		deploymentId: "dep-1",
		logPath: "/tmp/dep-1.log",
	});
	mocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
	mocks.findVolumeBackupById.mockResolvedValue(volumeBackup);
});

describe("runPostgresBackup checks the destination organization before side effects", () => {
	it("aborts before creating a deployment when the destination belongs to another organization", async () => {
		mocks.findDestinationRow.mockResolvedValue(foreignDestination);

		await expect(
			runPostgresBackup(postgres as never, backup as never),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.createDeploymentBackup).not.toHaveBeenCalled();
		expect(mocks.execAsync).not.toHaveBeenCalled();
	});

	it("runs when the destination belongs to the project organization", async () => {
		mocks.findDestinationRow.mockResolvedValue(ownDestination);

		await runPostgresBackup(postgres as never, backup as never);

		expect(mocks.execAsync).toHaveBeenCalledTimes(1);
		expect(mocks.updateDeploymentStatus).toHaveBeenCalledWith("dep-1", "done");
	});
});

describe("runVolumeBackup checks the destination organization before side effects", () => {
	it("aborts before creating a deployment when the destination belongs to another organization", async () => {
		mocks.findDestinationRow.mockResolvedValue(foreignDestination);

		await expect(runVolumeBackup("vb-1")).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});

		expect(mocks.createDeploymentVolumeBackup).not.toHaveBeenCalled();
		expect(mocks.execAsync).not.toHaveBeenCalled();
	});

	it("runs when the destination belongs to the project organization", async () => {
		mocks.findDestinationRow.mockResolvedValue(ownDestination);

		await runVolumeBackup("vb-1");

		expect(mocks.execAsync).toHaveBeenCalledTimes(1);
		expect(mocks.updateDeploymentStatus).toHaveBeenCalledWith("dep-1", "done");
	});
});
