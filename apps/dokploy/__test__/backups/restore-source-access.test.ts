import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findFirst: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: { query: { postgres: { findFirst: mocks.findFirst } } },
}));
vi.mock("@dokploy/server/services/permission", () => ({
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
}));

import { assertCanRestoreBackupFile } from "@dokploy/server/utils/restore/source-access";

const ctx = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
} as never;

describe("assertCanRestoreBackupFile", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("allows files in the target service's own folder", async () => {
		await assertCanRestoreBackupFile(
			ctx,
			"postgres",
			"target-db",
			"target-db/a.sql.gz",
		);
		expect(mocks.findFirst).not.toHaveBeenCalled();
	});

	it("allows another service's backup when the user can read it", async () => {
		mocks.findFirst.mockResolvedValue({ postgresId: "pg-src" });
		mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
		await assertCanRestoreBackupFile(
			ctx,
			"postgres",
			"target-db",
			"source-db/a.sql.gz",
		);
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			ctx,
			"pg-src",
			{ backup: ["read"] },
		);
	});

	it("rejects another service's backup the user cannot access", async () => {
		mocks.findFirst.mockResolvedValue({ postgresId: "pg-src" });
		mocks.checkServicePermissionAndAccess.mockRejectedValue(new Error("no"));
		await expect(
			assertCanRestoreBackupFile(
				ctx,
				"postgres",
				"target-db",
				"source-db/a.sql.gz",
			),
		).rejects.toThrow("Backup file does not belong to this service");
	});

	it("rejects folders that match no service (or another organization's)", async () => {
		mocks.findFirst.mockResolvedValue(undefined);
		await expect(
			assertCanRestoreBackupFile(
				ctx,
				"postgres",
				"target-db",
				"unknown/a.sql.gz",
			),
		).rejects.toThrow("Backup file does not belong");
	});

	it("rejects path traversal even under the own folder", async () => {
		await expect(
			assertCanRestoreBackupFile(
				ctx,
				"postgres",
				"target-db",
				"target-db/../x/a.sql.gz",
			),
		).rejects.toThrow("Backup file does not belong");
	});

	it("rejects bare file names", async () => {
		await expect(
			assertCanRestoreBackupFile(ctx, "postgres", "target-db", "a.sql.gz"),
		).rejects.toThrow("Backup file does not belong");
	});
});
