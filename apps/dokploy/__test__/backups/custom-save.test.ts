import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	createBackup: vi.fn(),
	findDestinationByIdForOrganization: vi.fn(),
	findBackupById: vi.fn(),
	findComposeById: vi.fn(),
	updateBackupById: vi.fn(),
	scheduleBackup: vi.fn(),
	removeScheduleBackup: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	testCustomBackup: vi.fn(),
}));
vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<object>()),
	...mocks,
	IS_CLOUD: false,
}));
vi.mock("@dokploy/server/services/permission", async (importOriginal) => ({
	...(await importOriginal<object>()),
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
}));
vi.mock(
	"@dokploy/server/utils/backups/custom-command",
	async (importOriginal) => ({
		...(await importOriginal<object>()),
		testCustomBackup: mocks.testCustomBackup,
	}),
);
vi.mock("@dokploy/server/services/destination", async (importOriginal) => ({
	...(await importOriginal<object>()),
	findDestinationByIdForOrganization: mocks.findDestinationByIdForOrganization,
}));
vi.mock("@dokploy/server/lib/auth", () => ({ validateRequest: vi.fn() }));
vi.mock("@/server/api/utils/audit", () => ({ audit: vi.fn() }));
vi.mock("@/server/utils/backup", () => ({
	removeJob: vi.fn(),
	schedule: vi.fn(),
	updateJob: vi.fn(),
}));
const { backupRouter } = await import("@/server/api/routers/backup");
const caller = backupRouter.createCaller({
	session: { activeOrganizationId: "org" },
	user: { id: "member", role: "member" },
} as Parameters<typeof backupRouter.createCaller>[0]);
const configuration = {
	databaseType: "postgres" as const,
	database: "app",
	backupType: "compose" as const,
	composeId: "compose",
	serviceName: "db",
	destinationId: "destination",
	prefix: "/",
	schedule: "0 0 * * *",
	enabled: true,
	keepLatestCount: 2,
	metadata: {
		backupMode: "custom" as const,
		custom: { script: "pg_dump --no-owner" },
		postgres: { databasePassword: "test-secret" },
	},
};
const existing = {
	...configuration,
	backupId: "backup",
	postgresId: null,
	mysqlId: null,
	mariadbId: null,
	mongoId: null,
	libsqlId: null,
};
describe("custom backups must pass validation before persistence", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.findDestinationByIdForOrganization.mockResolvedValue({
			destinationId: "destination",
			organizationId: "org",
		});
		mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
		mocks.findComposeById.mockResolvedValue({ composeId: "compose" });
		mocks.testCustomBackup.mockResolvedValue({ bytes: 123 });
		mocks.createBackup.mockResolvedValue({ backupId: "backup" });
		mocks.findBackupById.mockResolvedValue(existing);
	});
	it("rejects another organization's destination before testing or saving", async () => {
		mocks.findDestinationByIdForOrganization.mockRejectedValue(
			new Error("Destination not found"),
		);
		await expect(caller.create(configuration)).rejects.toThrow(
			"Destination not found",
		);
		expect(mocks.testCustomBackup).not.toHaveBeenCalled();
		expect(mocks.createBackup).not.toHaveBeenCalled();
	});
	it("does not create or schedule when the database test fails", async () => {
		mocks.testCustomBackup.mockRejectedValue(new Error("Backup test failed"));
		await expect(caller.create(configuration)).rejects.toThrow(
			"Backup test failed",
		);
		expect(mocks.createBackup).not.toHaveBeenCalled();
		expect(mocks.scheduleBackup).not.toHaveBeenCalled();
	});
	it("does not change a saved configuration or its schedule when retesting fails", async () => {
		mocks.testCustomBackup.mockRejectedValue(new Error("Backup test failed"));
		await expect(
			caller.update({
				...configuration,
				backupId: "backup",
				prefix: "changed",
			}),
		).rejects.toThrow("Backup test failed");
		expect(mocks.updateBackupById).not.toHaveBeenCalled();
		expect(mocks.removeScheduleBackup).not.toHaveBeenCalled();
	});
	it("retests the saved custom command if update omits metadata", async () => {
		const { metadata: _, ...input } = configuration;
		mocks.testCustomBackup.mockRejectedValue(new Error("Backup test failed"));
		await expect(
			caller.update({ ...input, backupId: "backup" }),
		).rejects.toThrow("Backup test failed");
		expect(mocks.testCustomBackup.mock.calls[0]?.[1].metadata).toEqual(
			configuration.metadata,
		);
		expect(mocks.updateBackupById).not.toHaveBeenCalled();
	});
	it("requires service and command permissions before executing a database test", async () => {
		mocks.checkServicePermissionAndAccess
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error("Permission denied"));
		await expect(caller.create(configuration)).rejects.toThrow(
			"Permission denied",
		);
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenNthCalledWith(
			2,
			expect.anything(),
			"compose",
			{ schedule: ["create"] },
		);
		expect(mocks.testCustomBackup).not.toHaveBeenCalled();
		expect(mocks.createBackup).not.toHaveBeenCalled();
	});
	it("checks update access before validating stored command details", async () => {
		mocks.findBackupById.mockResolvedValue({
			...existing,
			metadata: {
				backupMode: "custom",
				custom: { script: "invalid stored command" },
			},
		});
		mocks.checkServicePermissionAndAccess.mockRejectedValue(
			new Error("Permission denied"),
		);
		const { metadata: _, ...input } = configuration;
		await expect(
			caller.update({ ...input, backupId: "backup" }),
		).rejects.toThrow("Permission denied");
		expect(mocks.testCustomBackup).not.toHaveBeenCalled();
		expect(mocks.updateBackupById).not.toHaveBeenCalled();
	});
	it("creates after a successful test, without relying on a browser test token", async () => {
		await caller.create(configuration);
		expect(mocks.testCustomBackup.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.createBackup.mock.invocationCallOrder[0]!,
		);
		expect(mocks.scheduleBackup).toHaveBeenCalled();
	});
	it("updates after a successful test despite nullable native database IDs", async () => {
		await caller.update({ ...configuration, backupId: "backup" });
		expect(mocks.testCustomBackup.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.updateBackupById.mock.invocationCallOrder[0]!,
		);
	});
	it("rejects a missing Compose ID before database testing or persistence", async () => {
		await expect(
			caller.create({ ...configuration, composeId: undefined }),
		).rejects.toThrow("Select a Compose service");
		expect(mocks.testCustomBackup).not.toHaveBeenCalled();
		expect(mocks.createBackup).not.toHaveBeenCalled();
	});
	it("rejects mixed Compose and managed database ownership before testing", async () => {
		await expect(
			caller.create({ ...configuration, postgresId: "another-service" }),
		).rejects.toThrow("Compose backups cannot reference a managed database");
		expect(mocks.testCustomBackup).not.toHaveBeenCalled();
		expect(mocks.createBackup).not.toHaveBeenCalled();
	});
	it.each(["libsql", "web-server"] as const)(
		"rejects unsupported Compose database type %s",
		async (databaseType) => {
			await expect(
				caller.create({ ...configuration, databaseType, metadata: {} }),
			).rejects.toThrow("Select a supported Compose database type");
			expect(mocks.createBackup).not.toHaveBeenCalled();
		},
	);
	it.each(["create", "update"] as const)(
		"redacts database persistence failures during %s",
		async (operation) => {
			const secret = 'quoted " password\\value';
			const input = {
				...configuration,
				metadata: {
					...configuration.metadata,
					postgres: { databasePassword: secret },
				},
			};
			const error = new Error(
				`Failed query with params: ${JSON.stringify(input.metadata)}`,
			);
			if (operation === "create") mocks.createBackup.mockRejectedValue(error);
			else mocks.updateBackupById.mockRejectedValue(error);
			try {
				if (operation === "create") await caller.create(input);
				else await caller.update({ ...input, backupId: "backup" });
				expect.fail("Must reject the failed database operation");
			} catch (error) {
				expect(String(error)).toContain("[REDACTED]");
				expect(String(error)).not.toContain(secret);
				expect(String(error)).not.toContain(
					JSON.stringify(secret).slice(1, -1),
				);
			}
		},
	);
	it.each([
		"postgres",
		"mysql",
		"mariadb",
		"mongo",
		"libsql",
		"web-server",
	] as const)(
		"keeps managed %s edits compatible with null Compose and metadata fields",
		async (databaseType) => {
			mocks.findBackupById.mockResolvedValue({
				...existing,
				databaseType,
				backupType: "database",
				composeId: null,
				[`${databaseType}Id`]: "database",
				metadata: null,
			});
			const databaseCaller =
				databaseType === "web-server"
					? backupRouter.createCaller({
							session: { activeOrganizationId: "org" },
							user: { id: "owner", role: "owner" },
						} as Parameters<typeof backupRouter.createCaller>[0])
					: caller;
			await databaseCaller.update({
				...configuration,
				databaseType,
				backupId: "backup",
				serviceName: null,
				metadata: null,
			});
			expect(mocks.testCustomBackup).not.toHaveBeenCalled();
			expect(mocks.updateBackupById).toHaveBeenCalled();
		},
	);
	it.each([
		{
			databaseType: "postgres",
			metadata: { postgres: { databaseUser: "postgres" } },
		},
		{
			databaseType: "mysql",
			metadata: { mysql: { databaseRootPassword: "legacy" } },
		},
		{
			databaseType: "mariadb",
			metadata: {
				mariadb: { databaseUser: "backup", databasePassword: "legacy" },
			},
		},
		{
			databaseType: "mongo",
			metadata: {
				mongo: { databaseUser: "backup", databasePassword: "legacy" },
			},
		},
	] as const)(
		"saves legacy $databaseType settings without extra permissions or preflight",
		async ({ databaseType, metadata }) => {
			const input = { ...configuration, databaseType, metadata };
			mocks.findBackupById.mockResolvedValue({ ...existing, ...input });
			await caller.create(input);
			await caller.update({ ...input, backupId: "backup" });
			expect(mocks.testCustomBackup).not.toHaveBeenCalled();
			expect(
				mocks.checkServicePermissionAndAccess.mock.calls.map((call) => call[2]),
			).toEqual([{ backup: ["create"] }, { backup: ["update"] }]);
			expect(mocks.updateBackupById).toHaveBeenCalledWith(
				"backup",
				expect.objectContaining({
					metadata,
					schedule: configuration.schedule,
					destinationId: configuration.destinationId,
				}),
			);
			expect(mocks.scheduleBackup).toHaveBeenCalledWith(
				expect.objectContaining({ metadata, schedule: configuration.schedule }),
			);
		},
	);
	it("preserves default-mode behavior without running a preflight dump", async () => {
		await caller.create({
			...configuration,
			metadata: { backupMode: "default" },
		});
		expect(mocks.testCustomBackup).not.toHaveBeenCalled();
		expect(mocks.createBackup).toHaveBeenCalled();
	});
});
