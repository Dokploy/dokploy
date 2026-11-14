import type { Compose } from "@dokploy/server/services/compose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exec = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));
vi.mock("@dokploy/server/utils/process/execAsync", () => exec);
vi.mock("@dokploy/server/utils/backups/utils", () => ({
	getComposeContainerCommand: () => "docker ps --filter label=fixture -q",
}));

import { testCustomBackup } from "@dokploy/server/utils/backups/custom-command";
import { redactBackupError } from "@dokploy/server/utils/backups/redact";

const backup = {
	database: "app",
	databaseType: "postgres",
	serviceName: "db",
	metadata: {
		backupMode: "custom" as const,
		postgres: { databasePassword: "test-secret" },
		custom: { script: "pg_dump --no-owner" },
	},
};
const compose = {
	appName: "fixture",
	composeType: "docker-compose",
	serverId: null,
} as Compose;
describe("database preflight execution", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});
	it("uses the existing local executor, bounded container execution and no upload", async () => {
		exec.execAsync.mockResolvedValue({ stdout: "123\n", stderr: "" });
		await expect(testCustomBackup(compose, backup)).resolves.toEqual({
			bytes: 123,
		});
		const script = exec.execAsync.mock.calls[0]?.[0];
		expect(script).toContain("set -eo pipefail");
		expect(script).toContain("timeout -k 10 300 pg_dump");
		expect(script).toContain("| wc -c");
		expect(script).not.toMatch(/rclone|docker run|docker service create/);
		expect(exec.execAsyncRemote).not.toHaveBeenCalled();
	});
	it("uses Dokploy's existing remote executor for remote Compose services", async () => {
		exec.execAsyncRemote.mockResolvedValue({ stdout: "123\n", stderr: "" });
		await testCustomBackup({ ...compose, serverId: "server" }, backup);
		expect(exec.execAsyncRemote).toHaveBeenCalledWith(
			"server",
			expect.stringContaining("timeout -k 10 300"),
		);
		expect(exec.execAsync).not.toHaveBeenCalled();
	});
	it.each(["", "0\n", "NaN", "Infinity"])(
		"rejects missing or invalid dump output %j",
		async (stdout) => {
			exec.execAsync.mockResolvedValue({ stdout, stderr: "" });
			await expect(testCustomBackup(compose, backup)).rejects.toThrow(
				"No configuration was saved",
			);
		},
	);
	it.each([1, 124, 137])(
		"rejects failure or timeout exit code %i without exposing the command",
		async (code) => {
			exec.execAsync.mockRejectedValue(
				Object.assign(new Error("command contains test-secret"), {
					code,
					stderr: "authentication failed with test-secret",
				}),
			);
			try {
				await testCustomBackup(compose, backup);
				expect.fail("Must fail");
			} catch (error) {
				expect(String(error)).toContain("[REDACTED]");
				expect(String(error)).not.toContain("test-secret");
				expect(String(error)).not.toContain("command contains");
			}
		},
	);
	it("redacts URI credentials in encoded and decoded forms", async () => {
		exec.execAsync.mockRejectedValue({
			stderr: "postgresql://u:p%40ss@proxy:6543/app p@ss p%40ss",
		});
		await expect(
			testCustomBackup(compose, {
				...backup,
				metadata: {
					...backup.metadata,
					postgres: { connectionUri: "postgresql://u:p%40ss@proxy:6543/app" },
				},
			}),
		).rejects.toThrow("[REDACTED]");
		try {
			await testCustomBackup(compose, {
				...backup,
				metadata: {
					...backup.metadata,
					postgres: { connectionUri: "postgresql://u:p%40ss@proxy:6543/app" },
				},
			});
		} catch (error) {
			expect(String(error)).not.toMatch(/p@ss|p%40ss/);
		}
	});
	it.each([
		[
			"mongo",
			"mongodb://user:p%40ss@primary:27017,secondary:27017/app",
			"p@ss p%40ss",
		],
		["postgres", "postgresql://user@proxy/app?password=p%40ss", "p@ss p%40ss"],
	] as const)(
		"redacts %s URI passwords without relying on a single-host URL",
		(engine, connectionUri, message) => {
			expect(
				redactBackupError(message, {
					...backup,
					metadata: { [engine]: { connectionUri } },
				}),
			).not.toMatch(/p@ss|p%40ss/);
		},
	);
});
