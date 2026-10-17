import { restoreWebServerBackup } from "@dokploy/server/utils/restore/web-server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const execAsync = vi.hoisted(() => vi.fn());
const migrateRestoredLegacyTwoFactorSecrets = vi.hoisted(() =>
	vi.fn(async () => 0),
);

vi.mock("node:fs/promises", async (importOriginal) => ({
	...(await importOriginal<typeof import("node:fs/promises")>()),
	mkdtemp: vi.fn(async () => "/tmp/dokploy-restore-test"),
}));
vi.mock("@dokploy/server/constants", () => ({
	IS_CLOUD: false,
	paths: () => ({ BASE_PATH: "/tmp/dokploy-restore-target" }),
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

describe("web server restore migrations", () => {
	beforeEach(() => {
		execAsync.mockReset();
		migrateRestoredLegacyTwoFactorSecrets.mockClear();
		execAsync.mockImplementation(async (command: string) => {
			if (command.includes("ls /tmp/dokploy-restore-test/database.sql.gz")) {
				return { stdout: "", stderr: "" };
			}
			if (command.includes("ls /tmp/dokploy-restore-test/database.sql")) {
				return { stdout: "database.sql", stderr: "" };
			}
			if (command.includes('docker ps --filter "name=dokploy-postgres"')) {
				return { stdout: "postgres-container\n", stderr: "" };
			}
			return { stdout: "", stderr: "" };
		});
	});

	it("runs migrations after restoring the database and before reporting success", async () => {
		const logs: string[] = [];
		await restoreWebServerBackup(destination, "webserver-backup.zip", (log) =>
			logs.push(log),
		);

		const commands = execAsync.mock.calls.map(([command]) => command as string);
		const restoreIndex = commands.findIndex((command) =>
			command.includes("pg_restore"),
		);
		const migrationIndex = commands.findIndex((command) =>
			command.includes("dist/migration.mjs"),
		);
		expect(restoreIndex).toBeGreaterThanOrEqual(0);
		expect(migrationIndex).toBeGreaterThan(restoreIndex);
		expect(migrateRestoredLegacyTwoFactorSecrets).toHaveBeenCalledOnce();
		expect(logs).toContain("Restore completed successfully!");
	});

	it("does not report success if migrations fail", async () => {
		execAsync.mockImplementation(async (command: string) => {
			if (command.includes("dist/migration.mjs")) {
				throw new Error("Migration failed");
			}
			if (command.includes("ls /tmp/dokploy-restore-test/database.sql.gz")) {
				return { stdout: "", stderr: "" };
			}
			if (command.includes("ls /tmp/dokploy-restore-test/database.sql")) {
				return { stdout: "database.sql", stderr: "" };
			}
			if (command.includes('docker ps --filter "name=dokploy-postgres"')) {
				return { stdout: "postgres-container\n", stderr: "" };
			}
			return { stdout: "", stderr: "" };
		});
		const logs: string[] = [];
		await expect(
			restoreWebServerBackup(destination, "webserver-backup.zip", (log) =>
				logs.push(log),
			),
		).rejects.toThrow("Migration failed");
		expect(migrateRestoredLegacyTwoFactorSecrets).not.toHaveBeenCalled();
		expect(logs).not.toContain("Restore completed successfully!");
	});
});
