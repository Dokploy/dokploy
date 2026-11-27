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
				preflightCommand: 'echo "preflight"',
				stopCommand: 'echo "stop"',
				backupCommand: 'echo "backup"; exit 23',
				startCommand: 'echo "start"',
				uploadCommand: 'echo "upload"',
			}),
		);

		expect(result.status).toBe(23);
		expect(outputLines(result.stdout)).toEqual([
			"preflight",
			"stop",
			"backup",
			"start",
		]);
	});

	it("preserves the backup error status when the restart also fails", () => {
		const result = runCommand(
			createRestartSafeBackupCommand({
				preflightCommand: 'echo "preflight"',
				stopCommand: 'echo "stop"',
				backupCommand: 'echo "backup"; exit 23',
				startCommand: 'echo "start"; exit 17',
				uploadCommand: 'echo "upload"',
			}),
		);

		expect(result.status).toBe(23);
		expect(outputLines(result.stdout)).toEqual([
			"preflight",
			"stop",
			"backup",
			"start",
			"Service restart also failed with exit code 17",
		]);
	});

	it("returns the restart error status when the backup succeeds", () => {
		const result = runCommand(
			createRestartSafeBackupCommand({
				preflightCommand: 'echo "preflight"',
				stopCommand: 'echo "stop"',
				backupCommand: 'echo "backup"',
				startCommand: 'echo "start"; exit 17',
				uploadCommand: 'echo "upload"',
			}),
		);

		expect(result.status).toBe(17);
		expect(outputLines(result.stdout)).toEqual([
			"preflight",
			"stop",
			"backup",
			"start",
		]);
	});

	it("uploads only after a successful backup and service restart", () => {
		const result = runCommand(
			createRestartSafeBackupCommand({
				preflightCommand: 'echo "preflight"',
				stopCommand: 'echo "stop"',
				backupCommand: 'echo "backup"',
				startCommand: 'echo "start"',
				uploadCommand: 'echo "upload"',
			}),
		);

		expect(result.status).toBe(0);
		expect(outputLines(result.stdout)).toEqual([
			"preflight",
			"stop",
			"backup",
			"start",
			"upload",
		]);
	});

	it("does not stop the service when the preflight fails", () => {
		const result = runCommand(
			createRestartSafeBackupCommand({
				preflightCommand: 'echo "preflight"; exit 124',
				stopCommand: 'echo "stop"',
				backupCommand: 'echo "backup"',
				startCommand: 'echo "start"',
				uploadCommand: 'echo "upload"',
			}),
		);

		expect(result.status).toBe(124);
		expect(outputLines(result.stdout)).toEqual(["preflight"]);
	});

	it("restarts the service once when the stop fails", () => {
		const result = runCommand(
			createRestartSafeBackupCommand({
				preflightCommand: 'echo "preflight"',
				stopCommand: 'echo "stop"; false',
				backupCommand: 'echo "backup"',
				startCommand: 'echo "start"',
				uploadCommand: 'echo "upload"',
			}),
		);

		expect(result.status).toBe(1);
		expect(outputLines(result.stdout)).toEqual(["preflight", "stop", "start"]);
	});

	it("restarts the service once when the backup is terminated", () => {
		const result = runCommand(
			createRestartSafeBackupCommand({
				preflightCommand: 'echo "preflight"',
				stopCommand: 'echo "stop"',
				backupCommand: 'echo "backup"; kill -TERM $$; sleep 1',
				startCommand: 'echo "start"',
				uploadCommand: 'echo "upload"',
			}),
		);

		expect(result.status).toBe(143);
		expect(outputLines(result.stdout)).toEqual([
			"preflight",
			"stop",
			"backup",
			"start",
		]);
	});
});
