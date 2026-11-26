import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findBackupById: vi.fn(),
	findComposeByBackupId: vi.fn(),
	findPostgresByBackupId: vi.fn(),
	findMySqlByBackupId: vi.fn(),
	findMariadbByBackupId: vi.fn(),
	findMongoByBackupId: vi.fn(),
	findLibsqlByBackupId: vi.fn(),
	runComposeBackup: vi.fn(),
	runPostgresBackup: vi.fn(),
	runMySqlBackup: vi.fn(),
	runMariadbBackup: vi.fn(),
	runMongoBackup: vi.fn(),
	runLibsqlBackup: vi.fn(),
	keepLatestNBackups: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	getBackupAvailability: vi.fn(),
	assertBackupAvailable: vi.fn(),
}));
vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<object>()),
	...mocks,
	IS_CLOUD: false,
}));
vi.mock("@dokploy/server/services/permission", () => ({
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
}));
vi.mock("@dokploy/server/utils/backups/compose", () => ({
	runComposeBackup: mocks.runComposeBackup,
}));
vi.mock(
	"@dokploy/server/utils/backups/availability",
	async (importOriginal) => ({
		...(await importOriginal<object>()),
		getBackupAvailability: mocks.getBackupAvailability,
		assertBackupAvailable: mocks.assertBackupAvailable,
	}),
);
vi.mock("@dokploy/server/lib/auth", () => ({ validateRequest: vi.fn() }));
vi.mock("@/server/api/utils/audit", () => ({ audit: vi.fn() }));
vi.mock("@/server/utils/backup", () => ({
	removeJob: vi.fn(),
	schedule: vi.fn(),
	updateJob: vi.fn(),
}));
const { BackupUnavailableError } = await import(
	"@dokploy/server/utils/backups/availability"
);
const { backupRouter } = await import("@/server/api/routers/backup");
const caller = backupRouter.createCaller({
	session: { activeOrganizationId: "org" },
	user: { id: "member", role: "member" },
} as Parameters<typeof backupRouter.createCaller>[0]);
const types = [
	"Postgres",
	"MySql",
	"Mariadb",
	"Mongo",
	"Compose",
	"Libsql",
] as const;
const backup = { backupId: "backup", composeId: "compose", enabled: false };

describe("manual backup availability API", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.findBackupById.mockResolvedValue(backup);
		mocks.getBackupAvailability.mockResolvedValue({
			available: true,
			reason: null,
		});
		for (const type of types)
			mocks[`find${type}ByBackupId`].mockResolvedValue({ serverId: null });
	});
	it("authorizes status checks before inspecting the service", async () => {
		await caller.availability({ backupId: "backup" });
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"compose",
			{ backup: ["read"] },
		);
		expect(
			mocks.checkServicePermissionAndAccess.mock.invocationCallOrder[0],
		).toBeLessThan(mocks.getBackupAvailability.mock.invocationCallOrder[0]!);
	});
	it("does not probe a service the user cannot access", async () => {
		mocks.checkServicePermissionAndAccess.mockRejectedValue(
			new Error("Forbidden"),
		);
		await expect(caller.availability({ backupId: "backup" })).rejects.toThrow();
		expect(mocks.getBackupAvailability).not.toHaveBeenCalled();
	});
	it.each(types)(
		"rejects a direct %s manual backup call when unavailable, without backup or retention",
		async (type) => {
			mocks.findBackupById.mockResolvedValue({
				...backup,
				composeId: null,
				[`${type === "MySql" ? "mysql" : type.toLowerCase()}Id`]: "service",
			});
			mocks.assertBackupAvailable.mockRejectedValue(
				new BackupUnavailableError(
					"Start the selected service before running a manual backup.",
				),
			);
			await expect(
				caller[`manualBackup${type}`]({ backupId: "backup" }),
			).rejects.toThrow("Start the selected service");
			expect(mocks[`run${type}Backup`]).not.toHaveBeenCalled();
			expect(mocks.keepLatestNBackups).not.toHaveBeenCalled();
			expect(
				mocks.checkServicePermissionAndAccess.mock.invocationCallOrder[0],
			).toBeLessThan(mocks.assertBackupAvailable.mock.invocationCallOrder[0]!);
		},
	);
	it.each(types)(
		"runs an available %s backup even when the schedule is inactive",
		async (type) => {
			await expect(
				caller[`manualBackup${type}`]({ backupId: "backup" }),
			).resolves.toBe(true);
			expect(
				mocks.assertBackupAvailable.mock.invocationCallOrder[0],
			).toBeLessThan(mocks[`run${type}Backup`].mock.invocationCallOrder[0]!);
			expect(mocks.keepLatestNBackups).toHaveBeenCalled();
		},
	);
	it("rechecks at execution even after the browser received a ready result", async () => {
		await caller.availability({ backupId: "backup" });
		mocks.assertBackupAvailable.mockRejectedValue(
			new BackupUnavailableError("The database is unavailable."),
		);
		await expect(
			caller.manualBackupCompose({ backupId: "backup" }),
		).rejects.toThrow("unavailable");
		expect(mocks.runComposeBackup).not.toHaveBeenCalled();
	});
	it("requires permission before a manual availability check", async () => {
		mocks.checkServicePermissionAndAccess.mockRejectedValue(
			new Error("Forbidden"),
		);
		await expect(
			caller.manualBackupCompose({ backupId: "backup" }),
		).rejects.toThrow();
		expect(mocks.assertBackupAvailable).not.toHaveBeenCalled();
	});
});
