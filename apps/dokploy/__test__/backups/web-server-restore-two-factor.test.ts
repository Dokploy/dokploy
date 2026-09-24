import { restoreWebServerBackup } from "@dokploy/server/utils/restore/web-server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const execAsync = vi.hoisted(() => vi.fn());
const migrateRestoredLegacyTwoFactorSecrets = vi.hoisted(() => vi.fn());

vi.mock("node:fs/promises", async (importOriginal) => ({
	...(await importOriginal<typeof import("node:fs/promises")>()),
	mkdtemp: vi.fn(async () => "/tmp/dokploy-restore-two-factor-test"),
}));
vi.mock("@dokploy/server/constants", () => ({
	IS_CLOUD: false,
	paths: () => ({ BASE_PATH: "/tmp/dokploy-restore-two-factor-target" }),
}));
vi.mock("@dokploy/server/utils/backups/utils", () => ({
	getS3Credentials: () => [],
}));
vi.mock("@dokploy/server/utils/process/execAsync", () => ({ execAsync }));
vi.mock("@dokploy/server/utils/restore/legacy-two-factor", () => ({
	migrateRestoredLegacyTwoFactorSecrets,
}));

const destination = { bucket: "test-bucket" } as Parameters<
	typeof restoreWebServerBackup
>[0];

describe("web server restore 2FA migration", () => {
	beforeEach(() => {
		execAsync.mockReset();
		migrateRestoredLegacyTwoFactorSecrets.mockReset();
		migrateRestoredLegacyTwoFactorSecrets.mockResolvedValue(1);
		execAsync.mockImplementation(async (command: string) => {
			if (
				command.includes(
					"ls /tmp/dokploy-restore-two-factor-test/database.sql.gz",
				)
			) {
				return { stdout: "", stderr: "" };
			}
			if (
				command.includes("ls /tmp/dokploy-restore-two-factor-test/database.sql")
			) {
				return { stdout: "database.sql", stderr: "" };
			}
			if (command.includes('docker ps --filter "name=dokploy-postgres"')) {
				return { stdout: "postgres-container\n", stderr: "" };
			}
			return { stdout: "", stderr: "" };
		});
	});

	it("migrates restored 2FA before reporting success", async () => {
		const logs: string[] = [];
		await restoreWebServerBackup(destination, "webserver-backup.zip", (log) =>
			logs.push(log),
		);

		expect(
			execAsync.mock.calls.some(([command]) =>
				(command as string).includes("pg_restore"),
			),
		).toBe(true);
		expect(migrateRestoredLegacyTwoFactorSecrets).toHaveBeenCalledOnce();
		expect(logs.indexOf("Migrating restored 2FA secrets...")).toBeLessThan(
			logs.indexOf("Restore completed successfully!"),
		);
	});

	it("does not report success when the restored secret is unknown", async () => {
		migrateRestoredLegacyTwoFactorSecrets.mockRejectedValue(
			new Error("Unknown auth secret"),
		);
		const logs: string[] = [];
		await expect(
			restoreWebServerBackup(destination, "webserver-backup.zip", (log) =>
				logs.push(log),
			),
		).rejects.toThrow("Unknown auth secret");
		expect(logs).not.toContain("Restore completed successfully!");
	});
});
