import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	createBackup: vi.fn(),
	findBackupById: vi.fn(),
	updateBackupById: vi.fn(),
	findPostgresById: vi.fn(),
	restorePostgresBackup: vi.fn(),
	restoreWebServerBackup: vi.fn(),
	findDestinationRow: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(async () => undefined),
}));

vi.mock("@dokploy/server/db", () => ({
	db: { query: { destinations: { findFirst: mocks.findDestinationRow } } },
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: vi.fn(async () => undefined),
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	createBackup: mocks.createBackup,
	findBackupById: mocks.findBackupById,
	updateBackupById: mocks.updateBackupById,
	findPostgresById: mocks.findPostgresById,
	scheduleBackup: vi.fn(),
	removeScheduleBackup: vi.fn(),
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@dokploy/server/utils/restore", () => ({
	restorePostgresBackup: mocks.restorePostgresBackup,
	restoreWebServerBackup: mocks.restoreWebServerBackup,
}));

vi.mock("@dokploy/server/utils/backups/compose", () => ({
	runComposeBackup: vi.fn(),
}));

vi.mock("@dokploy/server/utils/backups/utils", () => ({
	getS3Credentials: vi.fn(),
	normalizeS3Path: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));

vi.mock("@/server/api/utils/plan-limits", () => ({
	assertDatabaseBackupLimit: vi.fn(),
}));

vi.mock("@/server/utils/backup", () => ({
	removeJob: vi.fn(),
	schedule: vi.fn(),
	updateJob: vi.fn(),
}));

const { backupRouter } = await import("@/server/api/routers/backup");

const caller = backupRouter.createCaller({
	session: { activeOrganizationId: "org-a" },
	user: { id: "user-1", email: "user@example.com", role: "owner" },
} as Parameters<typeof backupRouter.createCaller>[0]);

const callerAs = (role: string) =>
	backupRouter.createCaller({
		session: { activeOrganizationId: "org-a" },
		user: { id: "user-1", email: "user@example.com", role },
	} as Parameters<typeof backupRouter.createCaller>[0]);

const ownDestination = { destinationId: "dest-a", organizationId: "org-a" };
const foreignDestination = { destinationId: "dest-b", organizationId: "org-b" };

const createInput = {
	schedule: "0 0 * * *",
	prefix: "/",
	database: "app",
	databaseType: "postgres" as const,
	postgresId: "pg-1",
	enabled: false,
};

const updateInput = {
	backupId: "backup-1",
	schedule: "0 0 * * *",
	enabled: false,
	prefix: "/",
	database: "app",
	keepLatestCount: 0,
	serviceName: null,
	metadata: {},
	databaseType: "postgres" as const,
};

const restoreInput = {
	databaseId: "pg-1",
	databaseType: "postgres" as const,
	backupType: "database" as const,
	databaseName: "app",
	backupFile: "app/2024.sql.gz",
};

const drain = async (stream: unknown) => {
	for await (const _ of stream as AsyncIterable<string>) {
	}
};

describe("backup endpoints scope destinations to the active organization", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.createBackup.mockResolvedValue({ backupId: "backup-1" });
		mocks.findBackupById.mockResolvedValue({
			backupId: "backup-1",
			postgresId: "pg-1",
			destinationId: "dest-a",
			enabled: false,
			databaseType: "postgres",
			backupType: "database",
		});
		mocks.findPostgresById.mockResolvedValue({
			postgresId: "pg-1",
			appName: "app",
		});
	});

	it("rejects creating a backup on a destination from another organization", async () => {
		mocks.findDestinationRow.mockResolvedValue(foreignDestination);

		await expect(
			caller.create({ ...createInput, destinationId: "dest-b" }),
		).rejects.toMatchObject({
			message: "You don't have access to this destination.",
		});
		expect(mocks.createBackup).not.toHaveBeenCalled();
	});

	it("creates a backup on a destination of the active organization", async () => {
		mocks.findDestinationRow.mockResolvedValue(ownDestination);

		await caller.create({ ...createInput, destinationId: "dest-a" });

		expect(mocks.createBackup).toHaveBeenCalledTimes(1);
	});

	it("rejects moving a backup to a destination from another organization", async () => {
		mocks.findDestinationRow.mockResolvedValue(foreignDestination);

		await expect(
			caller.update({ ...updateInput, destinationId: "dest-b" }),
		).rejects.toMatchObject({
			message: "You don't have access to this destination.",
		});
		expect(mocks.updateBackupById).not.toHaveBeenCalled();
	});

	it("rejects restoring from a destination of another organization", async () => {
		mocks.findDestinationRow.mockResolvedValue(foreignDestination);

		const stream = await caller.restoreBackupWithLogs({
			...restoreInput,
			destinationId: "dest-b",
		});

		await expect(drain(stream)).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		expect(mocks.restorePostgresBackup).not.toHaveBeenCalled();
	});

	it("restores from a destination of the active organization", async () => {
		mocks.findDestinationRow.mockResolvedValue(ownDestination);

		const stream = await caller.restoreBackupWithLogs({
			...restoreInput,
			destinationId: "dest-a",
		});
		await drain(stream);

		expect(mocks.restorePostgresBackup).toHaveBeenCalledTimes(1);
	});

	it("rejects a service-less web-server schedule on a foreign destination", async () => {
		mocks.findDestinationRow.mockResolvedValue(foreignDestination);

		await expect(
			caller.create({
				...createInput,
				postgresId: undefined,
				databaseType: "web-server",
				destinationId: "dest-b",
			}),
		).rejects.toMatchObject({
			message: "You don't have access to this destination.",
		});

		expect(mocks.createBackup).not.toHaveBeenCalled();
	});
});

describe("restore access by role", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findPostgresById.mockResolvedValue({
			postgresId: "pg-1",
			appName: "app",
		});
	});

	const webServerRestore = {
		databaseId: "",
		databaseType: "web-server" as const,
		backupType: "database" as const,
		databaseName: "panel",
		backupFile: "panel.zip",
		destinationId: "dest-a",
	};

	for (const role of ["owner", "admin"]) {
		it(`${role} can run a web-server restore`, async () => {
			mocks.findDestinationRow.mockResolvedValue(ownDestination);
			const stream =
				await callerAs(role).restoreBackupWithLogs(webServerRestore);
			await drain(stream);
			expect(mocks.restoreWebServerBackup).toHaveBeenCalledTimes(1);
		});
	}

	it("a member cannot run a web-server restore (panel wipe)", async () => {
		mocks.findDestinationRow.mockResolvedValue(ownDestination);
		const stream =
			await callerAs("member").restoreBackupWithLogs(webServerRestore);
		await expect(drain(stream)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(mocks.restoreWebServerBackup).not.toHaveBeenCalled();
	});

	// Regression test for Dokploy/dokploy#5952. The Settings -> Web Server
	// page passes the viewer's user id as `databaseId`
	// (pages/dashboard/settings/server.tsx renders
	// <ShowBackups id={user?.userId} databaseType="web-server" /> and
	// RestoreBackup forwards it as databaseId). On v0.31.0,
	// restoreBackupWithLogs ran checkServicePermissionAndAccess whenever
	// databaseId was set, so that user id — which is not a service — made
	// findServiceOrganizationId return undefined and the restore failed
	// immediately with "Service not found". The router now branches on
	// databaseType instead, so a web-server restore must never run a service
	// permission check, whatever databaseId the caller sends. Note the
	// existing webServerRestore above uses databaseId "" — which is falsy,
	// so the v0.31.0 router skipped the service check for it and its owner
	// case passes against the buggy code; it does not reproduce the
	// reported input.
	const webServerRestoreWithUserId = {
		databaseId: "user-1",
		databaseType: "web-server" as const,
		backupType: "database" as const,
		databaseName: "dokploy",
		backupFile: "dokploy/2026-11-10.zip",
		destinationId: "dest-a",
	};

	it("owner can restore a web-server backup when databaseId is a non-service id", async () => {
		mocks.findDestinationRow.mockResolvedValue(ownDestination);
		const stream = await callerAs("owner").restoreBackupWithLogs(
			webServerRestoreWithUserId,
		);
		await drain(stream);
		expect(mocks.restoreWebServerBackup).toHaveBeenCalledTimes(1);
		expect(mocks.checkServicePermissionAndAccess).not.toHaveBeenCalled();
	});

	it("a member cannot restore a web-server backup when databaseId is a non-service id", async () => {
		mocks.findDestinationRow.mockResolvedValue(ownDestination);
		const stream = await callerAs("member").restoreBackupWithLogs(
			webServerRestoreWithUserId,
		);
		await expect(drain(stream)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(mocks.restoreWebServerBackup).not.toHaveBeenCalled();
		expect(mocks.checkServicePermissionAndAccess).not.toHaveBeenCalled();
	});

	it("a member with service access can still restore its own database", async () => {
		mocks.findDestinationRow.mockResolvedValue(ownDestination);
		const stream = await callerAs("member").restoreBackupWithLogs({
			...restoreInput,
			destinationId: "dest-a",
		});
		await drain(stream);
		expect(mocks.restorePostgresBackup).toHaveBeenCalledTimes(1);
	});
});
