import { beforeEach, describe, expect, it, vi } from "vitest";
import { backupRouter } from "@/server/api/routers/backup";

const mocks = vi.hoisted(() => ({
	createBackup: vi.fn(),
	findBackupById: vi.fn(),
	updateBackupById: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	findDestinationRow: vi.fn(),
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
	scheduleBackup: vi.fn(),
	removeScheduleBackup: vi.fn(),
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@dokploy/server/utils/restore", () => ({}));

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

const caller = backupRouter.createCaller({
	session: { activeOrganizationId: "org-a" },
	user: { id: "user-1", email: "member@example.com", role: "member" },
} as Parameters<typeof backupRouter.createCaller>[0]);

const createInput = {
	schedule: "0 0 * * *",
	prefix: "/",
	database: "app",
	destinationId: "dest-a",
	databaseType: "postgres" as const,
	postgresId: "pg-own",
	enabled: false,
};

describe("backups must target the service their type dispatches to", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findDestinationRow.mockResolvedValue({
			destinationId: "dest-a",
			organizationId: "org-a",
		});
		mocks.createBackup.mockResolvedValue({ backupId: "backup-1" });
		mocks.findBackupById.mockResolvedValue({
			backupId: "backup-1",
			postgresId: "pg-own",
			destinationId: "dest-a",
			enabled: false,
			databaseType: "postgres",
			backupType: "database",
		});
	});

	it("rejects a web-server backup attached to an accessible database", async () => {
		await expect(
			caller.create({ ...createInput, databaseType: "web-server" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.createBackup).not.toHaveBeenCalled();
	});

	it("rejects a database type that differs from the attached service", async () => {
		await expect(
			caller.create({
				...createInput,
				databaseType: "mysql",
				mysqlId: "mysql-unassigned",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.createBackup).not.toHaveBeenCalled();
	});

	it("rejects a compose backup smuggled behind an accessible database", async () => {
		await expect(
			caller.create({
				...createInput,
				backupType: "compose",
				composeId: "compose-unassigned",
				serviceName: "db",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.createBackup).not.toHaveBeenCalled();
	});

	it("rejects turning an existing database backup into a web-server backup", async () => {
		await expect(
			caller.update({
				backupId: "backup-1",
				schedule: "0 0 * * *",
				enabled: false,
				prefix: "/",
				destinationId: "dest-a",
				database: "app",
				keepLatestCount: 0,
				serviceName: null,
				metadata: {},
				databaseType: "web-server",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.updateBackupById).not.toHaveBeenCalled();
	});

	it("still creates a backup whose type matches its service", async () => {
		await caller.create(createInput);
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"pg-own",
			{ backup: ["create"] },
		);
		expect(mocks.createBackup).toHaveBeenCalledTimes(1);
	});
});
