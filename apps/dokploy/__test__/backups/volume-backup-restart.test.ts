import { spawnSync } from "node:child_process";
import { createRestartSafeBackupCommand } from "@dokploy/server/utils/volume-backups/backup";
import { describe, expect, it } from "vitest";

const runCommand = (command: string) =>
	spawnSync("bash", ["-c", command], {
		encoding: "utf8",
	});

const outputLines = (stdout: string) =>
	stdout
		.trim()
		.split("\n")
		.filter((line) => line.length > 0);

describe("createRestartSafeBackupCommand", () => {
	it("restarts the service and preserves the backup error status", () => {
		const result = runCommand(
			createRestartSafeBackupCommand({
				stopCommand: 'echo "stop"',
				backupCommand: 'echo "backup"; exit 23',
				startCommand: 'echo "start"',
				uploadCommand: 'echo "upload"',
			}),
		);

		expect(result.status).toBe(23);
		expect(outputLines(result.stdout)).toEqual(["stop", "backup", "start"]);
	});

	it("uploads only after a successful backup and service restart", () => {
		const result = runCommand(
			createRestartSafeBackupCommand({
				stopCommand: 'echo "stop"',
				backupCommand: 'echo "backup"',
				startCommand: 'echo "start"',
				uploadCommand: 'echo "upload"',
			}),
		);

		expect(result.status).toBe(0);
		expect(outputLines(result.stdout)).toEqual([
			"stop",
			"backup",
			"start",
			"upload",
		]);
	});
});
